import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { demoUserId } from "../../../demo-scenarios.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: serviço sem preço`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("servicenoprice");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("cria e edita serviço só com cadastro, sem gerar plano avulso", async () => {
        const before = (await repository.listPlanTemplates(clinicId)).length;
        const service = await repository.createService(clinicId, {
          name: `QA Serviço ${storage}`,
          durationMinutes: 60,
        });
        expect(service).not.toHaveProperty("priceInCents");
        const saved = await repository.updateAdministrativeRegistry(
          clinicId,
          demoUserId,
          service.id,
          {
            kind: "service",
            data: {
              name: `QA Serviço ${storage} editado`,
              durationMinutes: 45,
              active: true,
            },
          },
        );
        expect(saved).toMatchObject({ durationMinutes: 45 });
        expect(saved).not.toHaveProperty("priceInCents");
        const listed = (await repository.listServices(clinicId)).find(
          (item) => item.id === service.id,
        );
        expect(listed).toMatchObject({
          name: `QA Serviço ${storage} editado`,
          durationMinutes: 45,
        });
        expect(listed).not.toHaveProperty("priceInCents");
        expect(await repository.listPlanTemplates(clinicId)).toHaveLength(
          before,
        );
      });
    },
  );
}
