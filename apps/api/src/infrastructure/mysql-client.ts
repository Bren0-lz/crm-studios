import { createHash } from "node:crypto";
import mysql, {
  type FieldPacket,
  type PoolConnection,
  type PoolOptions,
  type ResultSetHeader,
} from "mysql2/promise";

/**
 * Camada fina sobre o `mysql2` com a mesma forma de uso do repositório: `query(sql, params)`
 * devolve `{ rows, rowCount }`. Conveniências que mantêm o SQL legível:
 * - placeholders `$1`, `$2`… (podem repetir) viram `?` na ordem certa;
 * - arrays e objetos viram JSON; texto ISO com fuso (`2026-01-01T10:00:00.000Z`) vira data;
 * - colunas JSON voltam já convertidas (no MariaDB o JSON é texto, lido do information_schema);
 * - `TINYINT(1)` volta como boolean; `DATE` volta como texto `aaaa-mm-dd`;
 * - erros de restrição ganham `code` no padrão SQLSTATE (`23505`, `23503`, `23514`, `40P01`).
 * A sessão usa UTC, READ COMMITTED e `ANSI_QUOTES` (aspas duplas = identificador).
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

const sessionSql = [
  "SET SESSION sql_mode='ANSI_QUOTES,PIPES_AS_CONCAT,STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone='+00:00'",
  "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED",
];

const isoTimestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

function toParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "string" && isoTimestamp.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  if (
    value === null ||
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    typeof value !== "object"
  )
    return value;
  return JSON.stringify(value);
}

/** Troca `$N` por `?` fora de textos e identificadores, repetindo o parâmetro quando preciso. */
export function toMysqlSql(sql: string, params: readonly unknown[] = []) {
  let text = "";
  const values: unknown[] = [];
  let quote: string | null = null;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index]!;
    if (quote) {
      text += char;
      if (char === quote) {
        if (sql[index + 1] === quote) {
          text += quote;
          index++;
        } else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      text += char;
      continue;
    }
    if (char === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf("\n", index);
      const stop = end === -1 ? sql.length : end;
      text += sql.slice(index, stop);
      index = stop - 1;
      continue;
    }
    if (char === "$" && /\d/.test(sql[index + 1] ?? "")) {
      let end = index + 1;
      while (/\d/.test(sql[end] ?? "")) end++;
      const position = Number(sql.slice(index + 1, end));
      if (position < 1 || position > params.length)
        throw new Error(`Parâmetro $${position} sem valor na consulta.`);
      values.push(toParam(params[position - 1]));
      text += "?";
      index = end - 1;
      continue;
    }
    text += char;
  }
  return { sql: text, values };
}

/** Erro do banco com `code` SQLSTATE (o mesmo que o repositório trata) e a restrição violada. */
export class DatabaseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly constraint: string | undefined,
    readonly errno: number | undefined,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

const constraintPatterns = [
  /for key '(?:[^']*\.)?([^'.]+)'/,
  /CONSTRAINT `([^`]+)`/,
  /[Cc]heck constraint '([^']+)'/,
];

function translateError(error: unknown) {
  if (!error || typeof error !== "object" || !("errno" in error)) return error;
  const { errno, message, sqlState } = error as {
    errno?: number;
    message: string;
    sqlState?: string;
  };
  const code =
    errno === 1062
      ? "23505"
      : errno === 1451 || errno === 1452 || errno === 1216 || errno === 1217
        ? "23503"
        : errno === 3819 || errno === 4025
          ? "23514"
          : errno === 1048 || errno === 1364
            ? "23502"
            : errno === 1213
              ? "40P01"
              : errno === 1205
                ? "55P03"
                : (sqlState ?? "HY000");
  const constraint = constraintPatterns
    .map((pattern) => message.match(pattern)?.[1])
    .find(Boolean);
  return new DatabaseError(message, code, constraint, errno, { cause: error });
}

type SchemaInfo = { jsonColumns: Set<string> };

async function readSchemaInfo(connection: PoolConnection): Promise<SchemaInfo> {
  const [version] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT VERSION() AS version",
  );
  if (!String(version[0]?.version ?? "").includes("MariaDB"))
    return { jsonColumns: new Set() }; // MySQL devolve o tipo JSON e o driver converte.
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME AS t, CHECK_CLAUSE AS c
     FROM information_schema.CHECK_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CHECK_CLAUSE LIKE 'json_valid(%'`,
  );
  // A cláusula vem como json_valid(`col`) ou, com ANSI_QUOTES, json_valid("col").
  return {
    jsonColumns: new Set(
      rows.flatMap((row) => {
        const column = /^json_valid\([`"]?([^`")]+)[`"]?\)$/.exec(
          String(row.c),
        )?.[1];
        return column ? [`${String(row.t)}.${column}`] : [];
      }),
    ),
  };
}

function parseJsonFields(
  rows: Record<string, unknown>[],
  fields: FieldPacket[] | undefined,
  schema: SchemaInfo,
) {
  if (!fields || schema.jsonColumns.size === 0) return;
  const names = fields
    .filter((field) =>
      schema.jsonColumns.has(`${field.orgTable}.${field.orgName}`),
    )
    .map((field) => field.name);
  if (names.length === 0) return;
  for (const row of rows)
    for (const name of names) {
      const value = row[name];
      if (typeof value === "string") row[name] = JSON.parse(value);
    }
}

async function run<T>(
  connection: PoolConnection,
  schema: SchemaInfo,
  sql: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  const statement = toMysqlSql(sql, params);
  try {
    const [result, fields] = await connection.query(
      statement.sql,
      statement.values,
    );
    if (Array.isArray(result)) {
      const rows = result as Record<string, unknown>[];
      parseJsonFields(rows, fields, schema);
      return { rows: rows as T[], rowCount: rows.length };
    }
    return { rows: [], rowCount: (result as ResultSetHeader).affectedRows };
  } catch (error) {
    throw translateError(error);
  }
}

const typeCast: NonNullable<PoolOptions["typeCast"]> = (field, next) => {
  if (field.type === "TINY" && field.length === 1) {
    const value = field.string();
    return value === null ? null : value === "1";
  }
  if (field.type === "JSON") {
    const value = field.string("utf8");
    return value === null ? null : JSON.parse(value);
  }
  return next();
};

export interface DatabaseOptions {
  url: string;
  connectionLimit?: number;
  idleTimeoutMillis?: number;
  ssl?: PoolOptions["ssl"];
  multipleStatements?: boolean;
}

/** Nome de trava (GET_LOCK aceita até 64 caracteres). */
const lockName = (key: string) =>
  `crm:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;

export class DatabaseConnection implements Queryable {
  private locked = false;

  constructor(
    private readonly connection: PoolConnection,
    private readonly schema: (
      connection: PoolConnection,
    ) => Promise<SchemaInfo>,
  ) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) {
    return run<T>(
      this.connection,
      await this.schema(this.connection),
      sql,
      params,
    );
  }

  /**
   * Trava nomeada até o fim da transação (equivale ao `pg_advisory_xact_lock`): é liberada
   * no `release()`, depois do COMMIT/ROLLBACK de quem a pediu.
   */
  async lock(key: string, timeoutSeconds = 30) {
    const result = await this.query<{ acquired: number | null }>(
      "SELECT GET_LOCK($1, $2) AS acquired",
      [lockName(key), timeoutSeconds],
    );
    if (Number(result.rows[0]?.acquired) !== 1)
      throw new DatabaseError(
        "Tempo esgotado aguardando outra operação no mesmo registro.",
        "55P03",
        undefined,
        undefined,
      );
    this.locked = true;
  }

  /** Executa um texto com vários comandos (a conexão precisa de `multipleStatements`). */
  async execute(script: string) {
    try {
      await this.connection.query(script);
    } catch (error) {
      throw translateError(error);
    }
  }

  release() {
    if (!this.locked) return this.connection.release();
    this.locked = false;
    this.connection
      .query("DO RELEASE_ALL_LOCKS()")
      .catch(() => this.connection.destroy())
      .finally(() => this.connection.release());
  }
}

export class Database implements Queryable {
  readonly pool: mysql.Pool;
  readonly url: string;
  private schemaInfo: Promise<SchemaInfo> | undefined;

  constructor({
    url,
    connectionLimit = 10,
    idleTimeoutMillis = 30_000,
    ssl,
    multipleStatements = false,
  }: DatabaseOptions) {
    this.url = url;
    this.pool = mysql.createPool({
      uri: url,
      connectionLimit,
      maxIdle: connectionLimit,
      idleTimeout: idleTimeoutMillis,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      charset: "utf8mb4_unicode_ci",
      timezone: "Z",
      dateStrings: ["DATE"],
      supportBigNumbers: true,
      bigNumberStrings: false,
      multipleStatements,
      typeCast,
      ...(ssl ? { ssl } : {}),
    });
    this.pool.pool.on("connection", (connection) => {
      for (const statement of sessionSql) connection.query(statement);
    });
  }

  /** Recarrega o mapa de colunas JSON (depois das migrações). */
  resetSchemaInfo() {
    this.schemaInfo = undefined;
  }

  /** Lê o mapa de colunas na conexão informada (evita pedir outra ao pool). */
  private schema = (connection: PoolConnection) => {
    this.schemaInfo ??= readSchemaInfo(connection).catch((error: unknown) => {
      this.schemaInfo = undefined;
      throw translateError(error);
    });
    return this.schemaInfo;
  };

  async connect() {
    const connection = await this.pool.getConnection();
    return new DatabaseConnection(connection, this.schema);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) {
    const connection = await this.pool.getConnection();
    try {
      return await run<T>(
        connection,
        await this.schema(connection),
        sql,
        params,
      );
    } finally {
      connection.release();
    }
  }

  /** Executa um arquivo com vários comandos (migrações). */
  async execute(script: string) {
    const connection = await this.pool.getConnection();
    try {
      await connection.query(script);
    } catch (error) {
      throw translateError(error);
    } finally {
      connection.release();
    }
  }

  end() {
    return this.pool.end();
  }
}

export type Pool = Database;
export type PoolClient = DatabaseConnection;
