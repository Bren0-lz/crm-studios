import {
  defaultNavTabLabels,
  navTabLabelsInputSchema,
  navTabSchema,
} from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: nomes das abas do menu`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("navtabs");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
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
