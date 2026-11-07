import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renamedMigrations, runMigrations } from "../../../database.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const migrationsPath = fileURLToPath(
  new URL("../../../../migrations/", import.meta.url),
);

describe("migrações renomeadas", () => {
  it("cada nome novo existe e o antigo não existe mais", () => {
    for (const [current, previous] of Object.entries(renamedMigrations)) {
      expect(existsSync(`${migrationsPath}${current}`)).toBe(true);
      expect(existsSync(`${migrationsPath}${previous}`)).toBe(false);
    }
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mysql: migração renomeada não roda de novo",
  () => {
    let database: TestDatabase;

    beforeAll(async () => {
      database = await createTestDatabase("migrename");
    }, 120_000);

    afterAll(async () => {
      await database?.drop();
    });

    it("banco que aplicou o nome antigo só registra o novo, sem reaplicar", async () => {
      const pool = database.pool;
      // Simula a produção que aplicou a migração do produto com o nome antigo (0052).
      await pool.query("DELETE FROM schema_migrations WHERE name = $1", [
        "0053_product_business_line.sql",
      ]);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        "0052_product_business_line.sql",
      ]);

      // Sem a proteção, o ALTER TABLE rodaria de novo e falharia (a coluna já existe).
      await expect(runMigrations(pool)).resolves.toEqual([]);

      const { rows } = await pool.query<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE name LIKE $1 ORDER BY name",
        ["%_product_business_line.sql"],
      );
      expect(rows.map((row) => row.name)).toEqual([
        "0052_product_business_line.sql",
        "0053_product_business_line.sql",
      ]);
      await expect(runMigrations(pool)).resolves.toEqual([]);
    });

    it("banco novo aplica o nome novo normalmente", async () => {
      const { rows } = await database.pool.query<{ total: number }>(
        "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'business_line'",
      );
      expect(Number(rows[0]?.total)).toBe(1);
    });
  },
);
