import { describe, expect, it } from "vitest";
import {
  backupFileName,
  CleanupError,
  parseCleanupArgs,
  validateAdmin,
} from "./db-cleanup.js";

describe("db:cleanup-test-data: argumentos", () => {
  it("is a simulation by default", () => {
    expect(parseCleanupArgs([])).toEqual({ execute: false });
  });

  it("reads --flag=value and --flag value, with the password only from the environment", () => {
    expect(
      parseCleanupArgs(
        [
          "--execute",
          "--confirm=Studios Aryana",
          "--admin-email",
          "dona@estudio.com",
          "--admin-name=Aryana Dutra",
          "--studio-name=Estúdio A=B",
          "--backup-dir",
          "/tmp/bk",
        ],
        { CLEANUP_ADMIN_PASSWORD: "segredo" },
      ),
    ).toEqual({
      execute: true,
      confirm: "Studios Aryana",
      adminEmail: "dona@estudio.com",
      adminName: "Aryana Dutra",
      studioName: "Estúdio A=B",
      backupDir: "/tmp/bk",
      adminPassword: "segredo",
    });
  });

  it("rejects unknown options, missing values and a password on the command line", () => {
    expect(() => parseCleanupArgs(["--force"])).toThrow(CleanupError);
    expect(() => parseCleanupArgs(["--confirm"])).toThrow(
      "Informe um valor para --confirm.",
    );
    expect(() => parseCleanupArgs(["--confirm", "--execute"])).toThrow(
      "Informe um valor para --confirm.",
    );
    expect(() => parseCleanupArgs(["--admin-password=123"])).toThrow(
      /CLEANUP_ADMIN_PASSWORD/,
    );
  });

  it("validates the admin with the user registration rules", () => {
    const base = {
      execute: true,
      adminEmail: "Dona@Estudio.com",
      adminName: "Aryana Dutra",
      adminPassword: "segredo",
    };
    expect(validateAdmin(base)).toMatchObject({
      email: "dona@estudio.com",
      fullName: "Aryana Dutra",
      role: "admin",
    });
    expect(() =>
      validateAdmin({
        execute: true,
        adminEmail: base.adminEmail,
        adminName: base.adminName,
      }),
    ).toThrow(/CLEANUP_ADMIN_PASSWORD/);
    expect(() => validateAdmin({ ...base, adminEmail: "sem-arroba" })).toThrow(
      "E-mail do administrador inválido.",
    );
    expect(() => validateAdmin({ ...base, adminName: "A" })).toThrow(
      /Nome do administrador/,
    );
    expect(() =>
      validateAdmin({ ...base, adminPassword: "x".repeat(129) }),
    ).toThrow(/Senha do administrador/);
  });

  it("names the backup with the UTC date and time", () => {
    expect(backupFileName(new Date("2026-11-08T03:04:05.000Z"))).toBe(
      "db-cleanup-2026-11-08-030405.json",
    );
  });
});
