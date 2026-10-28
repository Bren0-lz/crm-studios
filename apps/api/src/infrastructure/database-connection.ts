import { readFileSync } from "node:fs";
import type { PoolOptions } from "mysql2/promise";

export type DatabaseSslMode = "disable" | "require" | "verify";

export interface DatabaseSslOptions {
  ssl?: DatabaseSslMode;
  /** Caminho do certificado da CA do banco, usado quando `ssl = verify`. */
  caCertPath?: string;
}

/**
 * TLS da conexão com o MySQL. Na Hostinger o banco fica no mesmo servidor do site
 * (`localhost`) e não precisa de TLS (`disable`); um banco remoto pode exigir `require`
 * (criptografa sem verificar a CA) ou `verify` (exige `DATABASE_SSL_CA`).
 */
export function databaseSslConfig({
  ssl = "disable",
  caCertPath,
}: DatabaseSslOptions): PoolOptions["ssl"] | undefined {
  if (ssl === "disable") return undefined;
  if (ssl === "require") return { rejectUnauthorized: false };
  if (!caCertPath) {
    throw new Error(
      "DATABASE_SSL=verify exige DATABASE_SSL_CA com o caminho do certificado da CA do banco.",
    );
  }
  return { rejectUnauthorized: true, ca: readFileSync(caCertPath, "utf8") };
}
