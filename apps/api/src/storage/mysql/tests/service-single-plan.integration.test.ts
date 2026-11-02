import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { syncServiceSinglePlan } from "../../../modules/agenda/service-single-plan.js";
import { demoUserId } from "../../../demo-scenarios.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: plano avulso do preço de tabela`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("servicesingle");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const singles = async (serviceId: string) =>
        (await repository.listPlanTemplates(clinicId)).filter(
          (item) =>
            item.active &&
            item.planType === "single" &&
            item.services.some((entry) => entry.serviceId === serviceId),
        );

      it("cria um avulso e atualiza o mesmo ao mudar o preço", async () => {
        const service = await repository.createService(clinicId, {
          name: `QA Serviço Tabela ${storage}`,
          durationMinutes: 60,
          priceInCents: 8000,
        });
        await syncServiceSinglePlan(repository, clinicId, demoUserId, service);
        const [created, ...others] = await singles(service.id);
        expect(others).toHaveLength(0);
        expect(created).toMatchObject({
          name: `QA Serviço Tabela ${storage} (avulso)`,
          totalValueInCents: 8000,
          services: [{ totalSessions: 1, totalValueInCents: 8000 }],
        });

        await syncServiceSinglePlan(repository, clinicId, demoUserId, {
          ...service,
          priceInCents: 9500,
        });
        await syncServiceSinglePlan(repository, clinicId, demoUserId, {
          ...service,
          priceInCents: 9500,
        });
        const after = await singles(service.id);
        expect(after).toHaveLength(1);
        expect(after[0]).toMatchObject({
          id: created!.id,
          totalValueInCents: 9500,
          services: [{ totalValueInCents: 9500 }],
        });
      });
    },
  );
}
