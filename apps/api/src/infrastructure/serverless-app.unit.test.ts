import { describe, expect, it } from "vitest";
import {
  migrationDatabaseUrl,
  serverlessDatabaseUrl,
} from "./database-connection.js";
import { assertServerlessConfig, stripApiPrefix } from "./serverless-app.js";

describe("serverless entry", () => {
  it("strips the public /api prefix before routing", () => {
    expect(stripApiPrefix("/api/auth/login")).toBe("/auth/login");
    expect(stripApiPrefix("/api/patients?search=ana")).toBe(
      "/patients?search=ana",
    );
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api?x=1")).toBe("/?x=1");
    expect(stripApiPrefix("/apiary")).toBe("/apiary");
    expect(stripApiPrefix("/health")).toBe("/health");
  });

  it("refuses memory storage and the public default JWT secret", () => {
    const secret = "a".repeat(40);
    expect(() =>
      assertServerlessConfig({ STORAGE_MODE: "memory", JWT_SECRET: secret }),
    ).toThrow(/STORAGE_MODE=postgres/);
    expect(() =>
      assertServerlessConfig({
        STORAGE_MODE: "postgres",
        JWT_SECRET: "development-secret-change-before-production",
      }),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      assertServerlessConfig({ STORAGE_MODE: "postgres", JWT_SECRET: secret }),
    ).not.toThrow();
  });

  it("moves the Supabase session pooler to transaction mode and keeps other URLs", () => {
    const pooler = "aws-0-sa-east-1.pooler.supabase.com";
    expect(
      serverlessDatabaseUrl(
        `postgresql://postgres.abc:senha@${pooler}:5432/postgres`,
      ),
    ).toBe(`postgresql://postgres.abc:senha@${pooler}:6543/postgres`);
    expect(
      serverlessDatabaseUrl(
        `postgresql://postgres.abc:senha@${pooler}/postgres?sslmode=require`,
      ),
    ).toBe(
      `postgresql://postgres.abc:senha@${pooler}:6543/postgres?sslmode=require`,
    );
    for (const unchanged of [
      `postgresql://postgres.abc:senha@${pooler}:6543/postgres`,
      "postgresql://postgres:senha@db.abc.supabase.co:5432/postgres",
      "postgresql://crm:crm@localhost:5432/crm",
    ]) {
      expect(serverlessDatabaseUrl(unchanged)).toBe(unchanged);
    }
  });

  it("moves the Supabase transaction pooler back to session mode for migrations", () => {
    const pooler = "aws-0-sa-east-1.pooler.supabase.com";
    expect(
      migrationDatabaseUrl(
        `postgresql://postgres.abc:senha@${pooler}:6543/postgres`,
      ),
    ).toBe(`postgresql://postgres.abc:senha@${pooler}:5432/postgres`);
    expect(
      migrationDatabaseUrl(
        `postgresql://postgres.abc:senha@${pooler}:6543/postgres?pgbouncer=true`,
      ),
    ).toBe(`postgresql://postgres.abc:senha@${pooler}:5432/postgres`);
    for (const unchanged of [
      `postgresql://postgres.abc:senha@${pooler}:5432/postgres`,
      "postgresql://postgres:senha@db.abc.supabase.co:5432/postgres",
      "postgresql://crm:crm@localhost:6543/crm",
    ]) {
      expect(migrationDatabaseUrl(unchanged)).toBe(unchanged);
    }
  });
});

describe("startup error messages", () => {
  it("names invalid variables without echoing values and hides database passwords", async () => {
    const { describeStartupError } = await import("../serverless.js");
    const { z } = await import("zod");
    const parsed = z
      .object({ JWT_SECRET: z.string().min(32) })
      .safeParse({ JWT_SECRET: "curta-demais-segredo" });
    const message = describeStartupError(parsed.error);
    expect(message).toMatch(/^JWT_SECRET: /);
    expect(message).not.toContain("curta-demais-segredo");
    expect(
      describeStartupError(
        new Error(
          "falhou postgresql://postgres.abc:senha123@host:6543/postgres",
        ),
      ),
    ).toBe("falhou postgresql://***@host:6543/postgres");
  });
});
