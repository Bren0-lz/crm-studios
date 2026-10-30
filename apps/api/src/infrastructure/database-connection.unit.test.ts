import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { databaseSslConfig } from "./database-connection.js";

describe("database connection", () => {
  it("disables TLS by default (banco no mesmo servidor)", () => {
    expect(databaseSslConfig({})).toBeUndefined();
    expect(databaseSslConfig({ ssl: "disable" })).toBeUndefined();
  });

  it("encrypts without verifying the CA in require mode", () => {
    expect(databaseSslConfig({ ssl: "require" })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("verifies the CA in verify mode", () => {
    expect(() => databaseSslConfig({ ssl: "verify" })).toThrow(
      /DATABASE_SSL_CA/,
    );
    const dir = mkdtempSync(join(tmpdir(), "crm-ca-"));
    const caPath = join(dir, "ca.pem");
    writeFileSync(caPath, "-----BEGIN CERTIFICATE-----\nabc\n");
    expect(databaseSslConfig({ ssl: "verify", caCertPath: caPath })).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nabc\n",
    });
  });
});
