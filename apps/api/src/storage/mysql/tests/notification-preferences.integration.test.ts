import { defaultNotificationPreferences } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: preferências de notificação`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("notifprefs");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
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
