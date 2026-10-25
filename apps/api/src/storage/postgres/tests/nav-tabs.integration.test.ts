import {
  defaultNavTabLabels,
  navTabLabelsInputSchema,
  navTabSchema,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: nomes das abas do menu`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `navtabs_${randomUUID().replaceAll("-", "")}`;

      beforeAll(async () => {
        if (storage === "memory") return;
        const connection = databaseConnectionConfig({
          url: process.env.TEST_DATABASE_URL!,
          ssl: "auto",
        });
        adminPool = new Pool(connection);
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        await adminPool.query(
          `CREATE TABLE ${schema}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
        );
        pool = new Pool({
          ...connection,
          options: `-c search_path=${schema},public`,
        });
        await runMigrations(pool);
        await seedDemoData(pool);
        repository = new PostgresClinicRepository(pool);
      }, 20_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        try {
          await pool?.end();
          if (adminPool)
            await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          await adminPool?.end();
        }
      });

      it("keeps defaults, then saves and overwrites the clinic names", async () => {
        expect(await repository.listNavTabLabels(clinicId)).toEqual(
          navTabSchema.options.map((tab) => ({
            tab,
            label: defaultNavTabLabels[tab],
          })),
        );
        const names = (suffix: string) =>
          navTabLabelsInputSchema.parse({
            tabs: navTabSchema.options.map((tab) => ({
              tab,
              label: `${tab} ${suffix}`,
            })),
          });
        await repository.saveNavTabLabels(clinicId, names("A"));
        const saved = await repository.saveNavTabLabels(clinicId, names("B"));
        expect(saved).toEqual(names("B").tabs);
        expect(await repository.listNavTabLabels(clinicId)).toEqual(
          names("B").tabs,
        );
      });
    },
  );
}
