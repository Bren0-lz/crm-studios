import { starterAssessmentTemplates } from "@crm/contracts";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../../app.js";
import {
  cleanupDatabase,
  CleanupError,
  MIGRATIONS_TABLE,
} from "../../../db-cleanup.js";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const admin = {
  adminEmail: "Dona@Estudio.com",
  adminName: "Aryana Dutra",
  adminPassword: "Senha-Real@2026",
};

/** Registros por tabela (todas as BASE TABLE do banco, inclusive a de migrações). */
async function countAll(pool: Pool) {
  const tables = await pool.query<{ name: string }>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables.rows)
    counts[name] = Number(
      (
        await pool.query<{ total: number }>(
          `SELECT COUNT(*) AS total FROM "${name}"`,
        )
      ).rows[0]!.total,
    );
  return counts;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mysql: limpeza dos dados de teste (db:cleanup-test-data)",
  () => {
    let database: TestDatabase;
    let pool: Pool;
    let backupDir: string;
    let before: Record<string, number>;

    beforeAll(async () => {
      database = await createTestDatabase("dbcleanup");
      pool = database.pool;
      backupDir = await mkdtemp(join(tmpdir(), "db-cleanup-"));
      before = await countAll(pool);
    }, 60_000);

    afterAll(async () => {
      await database?.drop();
      if (backupDir) await rm(backupDir, { recursive: true, force: true });
    });

    const run = (options: Parameters<typeof cleanupDatabase>[1]) =>
      cleanupDatabase(pool, options, {
        defaultBackupDir: backupDir,
        now: () => new Date("2026-11-08T22:30:15.000Z"),
      });

    it("simulates by default: counts every table and changes nothing", async () => {
      expect(before.patients).toBeGreaterThan(0);
      const report = await run({ execute: false, ...admin });
      expect(report.executed).toBe(false);
      expect(report.studioName).toBe("Studios Aryana");
      expect(report.clinics.map((clinic) => clinic.name)).toEqual([
        "Studios Aryana",
      ]);
      const { [MIGRATIONS_TABLE]: migrations, ...data } = before;
      expect(
        Object.fromEntries(report.tables.map((t) => [t.table, t.rows])),
      ).toEqual(data);
      expect(report.migrations).toBe(migrations);
      expect(await countAll(pool)).toEqual(before);
      expect(await readdir(backupDir)).toEqual([]);
    });

    it("refuses to delete without the right confirmation or the admin data", async () => {
      await expect(
        run({ execute: true, confirm: "Outro Estúdio", ...admin }),
      ).rejects.toThrow(/Confirmação incorreta.*"Studios Aryana"/);
      await expect(run({ execute: true, ...admin })).rejects.toThrow(
        CleanupError,
      );
      await expect(
        run({
          execute: true,
          confirm: "Studios Aryana",
          adminEmail: admin.adminEmail,
          adminName: admin.adminName,
        }),
      ).rejects.toThrow(/CLEANUP_ADMIN_PASSWORD/);
      expect(await countAll(pool)).toEqual(before);
      expect(await readdir(backupDir)).toEqual([]);
    });

    it("backs up, empties every table but the migrations and leaves a working admin", async () => {
      const report = await run({
        execute: true,
        confirm: "Studios Aryana",
        ...admin,
      });
      expect(report.executed).toBe(true);

      const after = await countAll(pool);
      expect(after[MIGRATIONS_TABLE]).toBe(before[MIGRATIONS_TABLE]);
      expect(
        Object.fromEntries(
          Object.entries(after).filter(
            ([table, rows]) => table !== MIGRATIONS_TABLE && rows > 0,
          ),
        ),
      ).toEqual({
        clinics: 1,
        branches: 1,
        users: 1,
        assessment_templates: starterAssessmentTemplates.length,
      });

      const clinic = await pool.query<{ id: string; name: string }>(
        "SELECT id, name FROM clinics",
      );
      expect(clinic.rows[0]!.name).toBe("Studios Aryana");
      expect(clinic.rows[0]!.id).toBe(report.created!.clinicId);
      const branch = await pool.query<{ name: string; is_default: boolean }>(
        "SELECT name, is_default FROM branches",
      );
      expect(branch.rows).toEqual([{ name: "Matriz", is_default: true }]);

      // Backup com todas as linhas de todas as tabelas, de antes da limpeza.
      expect(report.backupPath).toBe(
        join(backupDir, "db-cleanup-2026-11-08-223015.json"),
      );
      expect(existsSync(report.backupPath!)).toBe(true);
      const backup = JSON.parse(await readFile(report.backupPath!, "utf8")) as {
        tables: Record<string, Array<Record<string, unknown>>>;
      };
      expect(
        Object.fromEntries(
          Object.entries(backup.tables).map(([table, rows]) => [
            table,
            rows.length,
          ]),
        ),
      ).toEqual(before);
      expect(
        backup.tables.users!.some(
          (user) => user.email === "admin@movimenta.local",
        ),
      ).toBe(true);

      // Login real: o novo administrador entra; o usuário demo não existe mais.
      const app = await buildApp({
        repository: new MysqlClinicRepository(pool),
        logger: false,
      });
      try {
        const login = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: {
            email: "dona@estudio.com",
            password: admin.adminPassword,
          },
        });
        expect(login.statusCode).toBe(200);
        const session = login.json<{
          token: string;
          user: { role: string; fullName: string };
        }>();
        expect(session.user).toMatchObject({
          role: "admin",
          fullName: "Aryana Dutra",
        });
        const branches = await app.inject({
          method: "GET",
          url: "/branches",
          headers: { authorization: `Bearer ${session.token}` },
        });
        expect(branches.statusCode).toBe(200);
        const demo = await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email: "admin@movimenta.local", password: "Admin@123" },
        });
        expect(demo.statusCode).toBe(401);
      } finally {
        await app.close();
      }
    }, 60_000);
  },
);
