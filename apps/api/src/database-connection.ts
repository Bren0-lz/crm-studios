import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export type DatabaseSslMode = "auto" | "disable" | "require" | "verify";

/**
 * Hosts gerenciados que exigem TLS. O Supabase usa `*.supabase.co` na conexão
 * direta e `*.pooler.supabase.com` no pooler (Supavisor).
 */
const managedHostPattern = /(^|\.)supabase\.(co|com)$/i;

/** Porta do pooler do Supabase em modo transação (sem sessão persistente). */
const transactionPoolerPort = "6543";

export interface DatabaseConnectionOptions {
  url: string;
  ssl?: DatabaseSslMode;
  /** Caminho do certificado da CA (ex.: o do Supabase), usado quando `ssl = verify`. */
  caCertPath?: string;
}

export function isManagedDatabaseHost(url: string): boolean {
  return managedHostPattern.test(new URL(url).hostname);
}

/**
 * O pooler em modo transação troca a conexão física a cada transação: travas de sessão
 * (`pg_advisory_lock` das migrações) e comandos de sessão deixam de funcionar.
 */
export function usesTransactionPooler(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.port === transactionPoolerPort ||
    parsed.searchParams.get("pgbouncer") === "true"
  );
}

/**
 * Monta a configuração do `pg.Pool`. Parâmetros de TLS da URL (`sslmode`, `sslrootcert`…)
 * são removidos, porque o `pg` daria preferência a eles sobre a opção `ssl` e trataria
 * `sslmode=require` como verificação completa, o que falha com a CA própria do Supabase.
 */
export function databaseConnectionConfig({
  url,
  ssl = "auto",
  caCertPath,
}: DatabaseConnectionOptions): Pick<PoolConfig, "connectionString" | "ssl"> {
  const parsed = new URL(url);
  for (const param of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "pgbouncer"]) {
    parsed.searchParams.delete(param);
  }
  const connectionString = parsed.toString();
  const mode = ssl === "auto" ? (isManagedDatabaseHost(url) ? "require" : "disable") : ssl;

  if (mode === "disable") return { connectionString, ssl: false };
  if (mode === "require") return { connectionString, ssl: { rejectUnauthorized: false } };
  if (!caCertPath) {
    throw new Error(
      "DATABASE_SSL=verify exige DATABASE_SSL_CA com o caminho do certificado da CA do banco.",
    );
  }
  return {
    connectionString,
    ssl: { rejectUnauthorized: true, ca: readFileSync(caCertPath, "utf8") },
  };
}
