/**
 * Limpeza dos dados de teste (`npm run db:cleanup-test-data`): apaga os dados de TODAS as
 * tabelas do banco, mantendo a estrutura e o registro de migrações (`schema_migrations`), e
 * recria só o mínimo para entrar no sistema — estúdio, filial padrão, modelos iniciais de
 * avaliação e um usuário administrador (a mesma criação de clínica do `db:setup`, sem o seed
 * demo).
 *
 * - Simulação por padrão: lista cada tabela com a quantidade de registros e o que seria
 *   recriado, sem alterar nada.
 * - `--execute` exige `--confirm=<nome de um estúdio cadastrado>`. Com mais de um estúdio,
 *   basta confirmar um deles (todos são apagados; o confirmado dá o nome padrão do novo).
 * - Antes de apagar, grava um backup JSON com todas as linhas de todas as tabelas; se o
 *   backup falhar, nada é apagado.
 * - As tabelas vêm do `information_schema` (nenhuma tabela nova fica esquecida). Os `DELETE`
 *   rodam numa única transação com `FOREIGN_KEY_CHECKS=0` só nessa sessão (a ordem das FKs
 *   deixa de importar, inclusive FKs circulares); as checagens voltam antes de recriar o
 *   mínimo e sempre no `finally`. `TRUNCATE` não serve: faz commit implícito no MySQL.
 */
import {
  adminUserInputSchema,
  clinicSettingsInputSchema,
  starterAssessmentTemplates,
} from "@crm/contracts";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { insertStarterAssessmentTemplates } from "./database.js";
import type {
  Database,
  DatabaseConnection,
} from "./infrastructure/mysql-client.js";
import { DEFAULT_CLINIC_TIMEZONE } from "./modules/finance/daily-cash.js";
import { createDefaultBranch } from "./storage/mysql/branches.js";

/** Tabela de controle das migrações (`runMigrations`): nunca é esvaziada. */
export const MIGRATIONS_TABLE = "schema_migrations";

/** Variável de ambiente com a senha do novo administrador (fora do histórico do shell). */
export const ADMIN_PASSWORD_ENV = "CLEANUP_ADMIN_PASSWORD";

/** Erro de uso ou de confirmação: a mensagem (pt-BR) vai direto para o terminal. */
export class CleanupError extends Error {}

export interface CleanupOptions {
  execute: boolean;
  confirm?: string;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
  studioName?: string;
  /** Pasta do backup; relativa a `baseDir` na CLI. */
  backupDir?: string;
}

export interface TableCount {
  table: string;
  rows: number;
}

export interface CleanupReport {
  executed: boolean;
  database: string;
  clinics: Array<{ id: string; name: string }>;
  /** Tabelas esvaziadas (ou que seriam), com os registros antes da limpeza. */
  tables: TableCount[];
  migrations: number;
  studioName: string;
  backupPath?: string;
  created?: { clinicId: string; branchId: string; userId: string };
}

const valueFlags = {
  "--confirm": "confirm",
  "--admin-email": "adminEmail",
  "--admin-name": "adminName",
  "--studio-name": "studioName",
  "--backup-dir": "backupDir",
} as const;

export const cleanupUsage = `Uso: npm run db:cleanup-test-data -- [opções]

Sem --execute é só simulação: mostra o que seria apagado e recriado, sem alterar nada.

  --execute                 apaga de verdade (exige --confirm)
  --confirm=<nome>          nome atual do estúdio, exatamente como está no banco
  --admin-email=<e-mail>    e-mail do administrador que será criado
  --admin-name=<nome>       nome do administrador
  --studio-name=<nome>      nome do estúdio recriado (padrão: o nome atual)
  --backup-dir=<pasta>      pasta do backup (padrão: backups/ na raiz do projeto)

A senha do administrador vem da variável de ambiente ${ADMIN_PASSWORD_ENV}.`;

/** Lê os argumentos da linha de comando (`--opção=valor` ou `--opção valor`). */
export function parseCleanupArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {},
): CleanupOptions {
  const options: CleanupOptions = { execute: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    const [flag, inline] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined];
    if (flag === "--execute") {
      if (inline !== undefined)
        throw new CleanupError("--execute não recebe valor.");
      options.execute = true;
      continue;
    }
    if (flag === "--admin-password")
      throw new CleanupError(
        `Não passe a senha na linha de comando (fica no histórico do shell): use a variável de ambiente ${ADMIN_PASSWORD_ENV}.`,
      );
    if (!(flag in valueFlags))
      throw new CleanupError(`Opção desconhecida: ${flag}.\n\n${cleanupUsage}`);
    const value = inline ?? argv[++index];
    if (value === undefined || (inline === undefined && value.startsWith("--")))
      throw new CleanupError(`Informe um valor para ${flag}.`);
    options[valueFlags[flag as keyof typeof valueFlags]] = value;
  }
  const password = env[ADMIN_PASSWORD_ENV];
  if (password !== undefined && password !== "")
    options.adminPassword = password;
  return options;
}

/** Valida os dados do administrador com as mesmas regras do cadastro de usuários. */
export function validateAdmin(options: CleanupOptions) {
  const missing = [
    options.adminEmail ? null : "--admin-email",
    options.adminName ? null : "--admin-name",
    options.adminPassword ? null : `a senha em ${ADMIN_PASSWORD_ENV}`,
  ].filter((item): item is string => item !== null);
  if (missing.length > 0)
    throw new CleanupError(
      `Para executar, informe ${missing.join(", ")} (o administrador que vai entrar depois da limpeza).`,
    );
  const parsed = adminUserInputSchema.safeParse({
    fullName: options.adminName,
    email: options.adminEmail,
    role: "admin",
    password: options.adminPassword,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    throw new CleanupError(
      field === "email"
        ? "E-mail do administrador inválido."
        : field === "fullName"
          ? "Nome do administrador: use de 3 a 160 caracteres."
          : `Senha do administrador (${ADMIN_PASSWORD_ENV}): informe de 1 a 128 caracteres.`,
    );
  }
  return parsed.data;
}

function validateStudioName(name: string) {
  const parsed = clinicSettingsInputSchema.shape.name.safeParse(name);
  if (!parsed.success)
    throw new CleanupError("Nome do estúdio: use de 2 a 160 caracteres.");
  return parsed.data;
}

const quoted = (table: string) => `"${table.replaceAll('"', '""')}"`;

async function listDataTables(client: DatabaseConnection) {
  const result = await client.query<{ name: string }>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> $1
     ORDER BY TABLE_NAME`,
    [MIGRATIONS_TABLE],
  );
  return result.rows.map((row) => row.name);
}

async function countRows(client: DatabaseConnection, table: string) {
  const result = await client.query<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM ${quoted(table)}`,
  );
  return Number(result.rows[0]!.total);
}

async function inspect(client: DatabaseConnection) {
  const database = (
    await client.query<{ name: string | null }>("SELECT DATABASE() AS name")
  ).rows[0]?.name;
  if (!database)
    throw new CleanupError("A conexão não aponta para nenhum banco de dados.");
  const tables: TableCount[] = [];
  for (const table of await listDataTables(client))
    tables.push({ table, rows: await countRows(client, table) });
  const clinics = (
    await client.query<{ id: string; name: string; timezone: string | null }>(
      "SELECT id, name, timezone FROM clinics ORDER BY created_at, name",
    )
  ).rows;
  const migrations = await countRows(client, MIGRATIONS_TABLE);
  return { database, tables, clinics, migrations };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `db-cleanup-AAAA-MM-DD-HHmmss.json` (horário UTC). */
export function backupFileName(now: Date) {
  return `db-cleanup-${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}.json`;
}

const jsonValue = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

/**
 * Backup JSON `{ createdAt, database, tables: { tabela: [linhas] } }` com todas as tabelas
 * (inclusive a de migrações), uma por vez para não montar tudo na memória. Nunca sobrescreve.
 */
async function writeBackup(
  client: DatabaseConnection,
  directory: string,
  database: string,
  now: Date,
) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, backupFileName(now));
  const file = await open(path, "wx", 0o600);
  const counts = new Map<string, number>();
  try {
    await file.write(
      `{"createdAt":${JSON.stringify(now.toISOString())},"database":${JSON.stringify(database)},"tables":{`,
    );
    const tables = [...(await listDataTables(client)), MIGRATIONS_TABLE];
    for (const [index, table] of tables.entries()) {
      const rows = (await client.query(`SELECT * FROM ${quoted(table)}`)).rows;
      counts.set(table, rows.length);
      await file.write(
        `${index === 0 ? "" : ","}\n${JSON.stringify(table)}:${JSON.stringify(rows, jsonValue)}`,
      );
    }
    await file.write("\n}}\n");
    await file.sync();
  } finally {
    await file.close();
  }
  return { path, counts };
}

/**
 * Simula (padrão) ou executa a limpeza. `baseDir` resolve `--backup-dir` relativo e
 * `defaultBackupDir` é a pasta quando a opção não vem.
 */
export async function cleanupDatabase(
  pool: Database,
  options: CleanupOptions,
  {
    defaultBackupDir,
    baseDir = process.cwd(),
    now = () => new Date(),
  }: { defaultBackupDir: string; baseDir?: string; now?: () => Date },
): Promise<CleanupReport> {
  const admin = options.execute ? validateAdmin(options) : null;
  if (options.studioName !== undefined) validateStudioName(options.studioName);
  if (!options.execute && options.adminEmail !== undefined) {
    // Na simulação, já aponta dado inválido do administrador que veio.
    if (!adminUserInputSchema.shape.email.safeParse(options.adminEmail).success)
      throw new CleanupError("E-mail do administrador inválido.");
  }

  const client = await pool.connect();
  try {
    const state = await inspect(client);
    const clinicNames = state.clinics.map((clinic) => clinic.name);
    const confirmed = state.clinics.find(
      (clinic) => clinic.name === options.confirm?.trim(),
    );
    const base = {
      database: state.database,
      clinics: state.clinics.map(({ id, name }) => ({ id, name })),
      tables: state.tables,
      migrations: state.migrations,
    };
    if (!options.execute)
      return {
        ...base,
        executed: false,
        studioName:
          options.studioName?.trim() ??
          confirmed?.name ??
          (state.clinics.length === 1 ? state.clinics[0]!.name : ""),
      };

    if (state.clinics.length === 0)
      throw new CleanupError(
        "Nenhum estúdio cadastrado neste banco: não há o que confirmar. Nada foi apagado.",
      );
    if (!options.confirm)
      throw new CleanupError(
        `Para apagar, confirme com --confirm=<nome do estúdio>. Estúdios neste banco: ${clinicNames.map((name) => `"${name}"`).join(", ")}. Nada foi apagado.`,
      );
    if (!confirmed)
      throw new CleanupError(
        `Confirmação incorreta: "${options.confirm}" não é o nome de nenhum estúdio deste banco (${clinicNames.map((name) => `"${name}"`).join(", ")}). Nada foi apagado.`,
      );
    const studioName = validateStudioName(options.studioName ?? confirmed.name);
    const passwordHash = await hash(admin!.password, 12);

    let backup: Awaited<ReturnType<typeof writeBackup>>;
    try {
      backup = await writeBackup(
        client,
        options.backupDir
          ? resolve(baseDir, options.backupDir)
          : defaultBackupDir,
        state.database,
        now(),
      );
    } catch (error) {
      throw new CleanupError(
        `Não foi possível gravar o backup (${error instanceof Error ? error.message : String(error)}). Nada foi apagado.`,
      );
    }

    const clinicId = randomUUID();
    const userId = randomUUID();
    let branchId = "";
    await client.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      await client.query("BEGIN");
      try {
        for (const { table } of state.tables) {
          const deleted = await client.query(`DELETE FROM ${quoted(table)}`);
          // Linha gravada depois do backup ficaria sem cópia: desfaz e pede para pausar o sistema.
          if (deleted.rowCount !== (backup.counts.get(table) ?? 0))
            throw new CleanupError(
              `A tabela ${table} mudou durante o backup (${backup.counts.get(table) ?? 0} no backup, ${deleted.rowCount} apagados). Pare o sistema e rode de novo. Nada foi apagado.`,
            );
        }
        await client.query("SET FOREIGN_KEY_CHECKS = 1");
        await client.query(
          "INSERT INTO clinics (id, name, timezone) VALUES ($1, $2, $3)",
          [clinicId, studioName, confirmed.timezone || DEFAULT_CLINIC_TIMEZONE],
        );
        branchId = await createDefaultBranch(client, clinicId);
        await insertStarterAssessmentTemplates(client, clinicId);
        await client.query(
          `INSERT INTO users (id, clinic_id, full_name, email, password_hash, role, permissions, dashboard_access)
           VALUES ($1, $2, $3, $4, $5, 'admin', $6, 1)`,
          [userId, clinicId, admin!.fullName, admin!.email, passwordHash, []],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      await client.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    return {
      ...base,
      executed: true,
      studioName,
      backupPath: backup.path,
      created: { clinicId, branchId, userId },
    };
  } finally {
    client.release();
  }
}

/** Texto para o terminal (pt-BR). */
export function formatCleanupReport(
  report: CleanupReport,
  options: CleanupOptions,
) {
  const total = report.tables.reduce((sum, table) => sum + table.rows, 0);
  const width = Math.max(...report.tables.map((table) => table.table.length));
  const lines = [
    report.executed
      ? `Limpeza concluída no banco "${report.database}".`
      : `SIMULAÇÃO — nada foi alterado no banco "${report.database}".`,
    `Estúdios encontrados: ${report.clinics.map((clinic) => `"${clinic.name}"`).join(", ") || "nenhum"}.`,
    "",
    `${report.executed ? "Registros apagados" : "Registros que seriam apagados"} (${report.tables.length} tabelas, ${total} registros no total):`,
    ...report.tables.map(
      (table) => `  ${table.table.padEnd(width)}  ${table.rows}`,
    ),
    `Preservada: ${MIGRATIONS_TABLE} (${report.migrations} migrações registradas).`,
    "",
    `${report.executed ? "Recriado" : "Seria recriado"}: estúdio "${report.studioName || "(informe --studio-name ou --confirm)"}", filial padrão "Matriz", ${starterAssessmentTemplates.length} modelos iniciais de avaliação e o administrador ${options.adminEmail ? `"${options.adminName ?? "(informe --admin-name)"}" <${options.adminEmail.toLowerCase()}>` : "(informe --admin-email e --admin-name)"} com acesso total.`,
  ];
  if (report.backupPath)
    lines.push(
      "",
      `Backup gravado em: ${report.backupPath}`,
      "Recomendado: baixe também um backup completo do banco pelo painel da Hostinger (Bancos de dados > Backups) e guarde os dois fora do servidor.",
    );
  if (!report.executed)
    lines.push(
      "",
      "Para executar (pare o sistema antes; a senha vai na variável de ambiente):",
      `  ${ADMIN_PASSWORD_ENV}='<senha>' npm run db:cleanup-test-data -- --execute --confirm="${report.clinics[0]?.name ?? "<nome do estúdio>"}" --admin-email=<e-mail> --admin-name="<nome>"`,
    );
  return `${lines.join("\n")}\n`;
}
