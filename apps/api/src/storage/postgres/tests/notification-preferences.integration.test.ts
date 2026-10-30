import { defaultNotificationPreferences } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: preferências de notificação`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `notifprefs_${randomUUID().replaceAll("-", "")}`;

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

      it("keeps defaults, then saves and overwrites the user's preferences", async () => {
        expect(
          await repository.getNotificationPreferences(clinicId, userId),
        ).toEqual(defaultNotificationPreferences);
        await repository.saveNotificationPreferences(clinicId, userId, {
          ...defaultNotificationPreferences,
          playSound: true,
        });
        const changed = {
          hiddenKinds: ["birthdays" as const],
          highlightedKinds: ["autoCampaigns" as const],
          showBanner: false,
          showToasts: false,
          playSound: false,
          refreshMinutes: 15 as const,
        };
        expect(
          await repository.saveNotificationPreferences(
            clinicId,
            userId,
            changed,
          ),
        ).toEqual(changed);
        expect(
          await repository.getNotificationPreferences(clinicId, userId),
        ).toEqual(changed);
      });
    },
  );
}
