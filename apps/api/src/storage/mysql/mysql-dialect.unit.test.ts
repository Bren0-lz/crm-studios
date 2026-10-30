import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O banco é MySQL 8 / MariaDB 10.6+ (Hostinger) desde a troca do Postgres. Código escrito para a
 * versão antiga (PRs abertos antes da troca, agentes com o modelo antigo na memória) costuma
 * trazer sintaxe do Postgres que só quebra no `test:mysql`, que fica `skip` sem banco. Esta
 * checagem roda sempre e aponta o arquivo e o trecho.
 */
const apiRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsPath = `${apiRoot}migrations`;
const mysqlStoragePath = `${apiRoot}src/storage/mysql`;

const postgresOnly: Array<[RegExp, string]> = [
  [/\bjsonb\b/i, "jsonb → JSON"],
  [/\btimestamptz\b/i, "timestamptz → DATETIME(6) em UTC"],
  [/\bRETURNING\b/i, "RETURNING → writeAndRead() ou SELECT depois da escrita"],
  [
    /\bON\s+CONFLICT\b/i,
    'ON CONFLICT → ON DUPLICATE KEY UPDATE / insertRows(..., { onDuplicate: "ignore" })',
  ],
  [
    /::\s*(text|int|integer|bigint|uuid|jsonb?|date|numeric|boolean|timestamptz)\b/i,
    "cast :: → CAST(... AS ...)",
  ],
  [/\bILIKE\b/i, "ILIKE → LIKE (colação já ignora caixa)"],
  [
    /\bgen_random_uuid\s*\(/i,
    "gen_random_uuid() → randomUUID() na aplicação ou DEFAULT (UUID())",
  ],
  [/\bJOIN\s+LATERAL\b/i, "JOIN LATERAL → LEFT JOIN com subconsulta"],
  [/\bDISTINCT\s+ON\b/i, "DISTINCT ON → ROW_NUMBER() ou subconsulta"],
  [/\bpg_advisory/i, "pg_advisory_* → client.lock() (GET_LOCK)"],
  [/=\s*ANY\s*\(/i, "= ANY($n) → inJsonArray() de sql.ts"],
  [
    /\b(jsonb_\w+|json_(build_object|build_array|agg|object_agg|array_elements\w*|each\w*))\s*\(/i,
    "funções json do Postgres → JSON_SET/JSON_OBJECT/JSON_ARRAYAGG/JSON_TABLE",
  ],
  [/\b(text|uuid|int|integer)\s*\[\]/i, "array do Postgres → coluna JSON"],
  [/\bfrom\s+["']pg["']/i, "pacote pg → infrastructure/mysql-client.ts"],
];

const migrationOnly: Array<[RegExp, string]> = [
  [
    /\buuid\b(?!\s*\()/i,
    "tipo uuid → VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin",
  ],
  [/\b(BIG)?SERIAL\b/i, "SERIAL → id VARCHAR(36) DEFAULT (UUID())"],
  [
    /\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER|PROCEDURE)\b/i,
    "sem gatilhos/funções no banco: regra na aplicação",
  ],
  [/\$\$/, "bloco $$ do Postgres"],
  [/\bCREATE\s+EXTENSION\b/i, "extensão do Postgres"],
];

/** Tira comentários (as explicações "no Postgres era ..." podem citar a sintaxe antiga). */
function withoutComments(source: string, sql: boolean) {
  const block = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return sql
    ? block.replace(/--.*$/gm, "")
    : block.replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function findings(
  file: string,
  source: string,
  rules: Array<[RegExp, string]>,
) {
  return source
    .split("\n")
    .flatMap((line, index) =>
      rules
        .filter(([pattern]) => pattern.test(line))
        .map(([, hint]) => `${file}:${index + 1} ${hint} — ${line.trim()}`),
    );
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(`${dir}/${entry.name}`)
        : Promise.resolve(
            entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
              ? [`${dir}/${entry.name}`]
              : [],
          ),
    ),
  );
  return nested.flat();
}

describe("dialeto MySQL/MariaDB", () => {
  it("não há mais implementação Postgres", () => {
    expect(existsSync(`${apiRoot}src/storage/postgres`)).toBe(false);
    expect(existsSync(`${apiRoot}src/postgres-repository.ts`)).toBe(false);
  });

  it("migrações usam nomes NNNN_nome.sql sem número repetido", async () => {
    const files = (await readdir(migrationsPath)).filter((file) =>
      file.endsWith(".sql"),
    );
    const invalid = files.filter(
      (file) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(file),
    );
    expect(invalid).toEqual([]);
    const numbers = files.map((file) => file.slice(0, 4));
    const repeated = numbers.filter(
      (number, index) => numbers.indexOf(number) !== index,
    );
    expect(repeated).toEqual([]);
  });

  it("migrações não usam sintaxe do Postgres", async () => {
    const files = (await readdir(migrationsPath)).filter((file) =>
      file.endsWith(".sql"),
    );
    const problems = (
      await Promise.all(
        files.map(async (file) =>
          findings(
            `migrations/${file}`,
            withoutComments(
              await readFile(`${migrationsPath}/${file}`, "utf8"),
              true,
            ),
            [...postgresOnly, ...migrationOnly],
          ),
        ),
      )
    ).flat();
    expect(problems).toEqual([]);
  });

  it("consultas de storage/mysql não usam sintaxe do Postgres", async () => {
    const files = await sourceFiles(mysqlStoragePath);
    const problems = (
      await Promise.all(
        files.map(async (file) =>
          findings(
            file.slice(apiRoot.length),
            withoutComments(await readFile(file, "utf8"), false),
            postgresOnly,
          ),
        ),
      )
    ).flat();
    expect(problems).toEqual([]);
  });
});
