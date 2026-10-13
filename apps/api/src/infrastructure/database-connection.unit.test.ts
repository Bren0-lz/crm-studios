import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  databaseConnectionConfig,
  isManagedDatabaseHost,
  usesTransactionPooler,
} from "./database-connection.js";

const sessionPooler =
  "postgresql://postgres.abcdefghij:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const transactionPooler =
  "postgresql://postgres.abcdefghij:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const direct =
  "postgresql://postgres:senha@db.abcdefghij.supabase.co:5432/postgres";
const local = "postgresql://crm:crm@localhost:5432/crm";

describe("database connection", () => {
  it("recognizes Supabase hosts", () => {
    expect(isManagedDatabaseHost(sessionPooler)).toBe(true);
    expect(isManagedDatabaseHost(direct)).toBe(true);
    expect(isManagedDatabaseHost(local)).toBe(false);
    expect(
      isManagedDatabaseHost("postgresql://u:p@supabase.co.evil.test:5432/db"),
    ).toBe(false);
  });

  it("detects the transaction pooler", () => {
    expect(usesTransactionPooler(transactionPooler)).toBe(true);
    expect(usesTransactionPooler(`${sessionPooler}?pgbouncer=true`)).toBe(true);
    expect(usesTransactionPooler(sessionPooler)).toBe(false);
    expect(usesTransactionPooler(local)).toBe(false);
  });

  it("uses TLS without CA verification by default on Supabase and none locally", () => {
    expect(databaseConnectionConfig({ url: sessionPooler }).ssl).toEqual({
      rejectUnauthorized: false,
    });
    expect(databaseConnectionConfig({ url: local }).ssl).toBe(false);
    expect(
      databaseConnectionConfig({ url: local, ssl: "require" }).ssl,
    ).toEqual({
      rejectUnauthorized: false,
    });
    expect(
      databaseConnectionConfig({ url: sessionPooler, ssl: "disable" }).ssl,
    ).toBe(false);
  });

  it("strips TLS parameters from the URL so the ssl option is honored", () => {
    const config = databaseConnectionConfig({
      url: `${direct}?sslmode=require&sslrootcert=ca.crt&application_name=crm`,
    });
    const parsed = new URL(config.connectionString!);
    expect(parsed.searchParams.has("sslmode")).toBe(false);
    expect(parsed.searchParams.has("sslrootcert")).toBe(false);
    expect(parsed.searchParams.get("application_name")).toBe("crm");
  });

  it("verifies the certificate against the given CA", () => {
    expect(() =>
      databaseConnectionConfig({ url: direct, ssl: "verify" }),
    ).toThrow(/DATABASE_SSL_CA/);
    const dir = mkdtempSync(join(tmpdir(), "crm-ca-"));
    const caPath = join(dir, "supabase.crt");
    writeFileSync(
      caPath,
      "-----BEGIN CERTIFICATE-----\nteste\n-----END CERTIFICATE-----\n",
    );
    expect(
      databaseConnectionConfig({
        url: direct,
        ssl: "verify",
        caCertPath: caPath,
      }).ssl,
    ).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nteste\n-----END CERTIFICATE-----\n",
    });
  });
});
