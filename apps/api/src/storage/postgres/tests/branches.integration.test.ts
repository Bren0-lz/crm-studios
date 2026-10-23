import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import { runBranchScenario } from "../../../test-support/branch-scenario.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("postgres: filiais", () => {
  let adminPool: Pool;
  let pool: Pool;
  const schema = `branches_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    const connection = databaseConnectionConfig({
      url: process.env.TEST_DATABASE_URL!,
      ssl: "auto",
    });
    adminPool = new Pool(connection);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      ...connection,
      options: `-c search_path=${schema},public`,
    });
    await runMigrations(pool);
    await seedDemoData(pool);
  }, 20_000);

  afterAll(async () => {
    try {
      await pool?.end();
      await adminPool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await adminPool?.end();
    }
  });

  it("separa cadastros, agenda, estoque, comercial e financeiro por filial", async () => {
    await runBranchScenario(new PostgresClinicRepository(pool));
  });
});
