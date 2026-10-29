import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import { commissionRecalculationSuite } from "../../../test-support/commission-recalculation-suite.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "postgres: recálculo retroativo de comissões",
  () => {
    let pool: Pool;
    let adminPool: Pool;
    let repository: PostgresClinicRepository;
    const schema = `commission_recalc_${randomUUID().replaceAll("-", "")}`;
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
      await pool.query(
        "CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      await runMigrations(pool);
      await seedDemoData(pool);
      repository = new PostgresClinicRepository(pool);
    }, 20_000);
    afterAll(async () => {
      try {
        await pool?.end();
        await adminPool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await adminPool?.end();
      }
    });
    commissionRecalculationSuite(() => repository);
  },
);
