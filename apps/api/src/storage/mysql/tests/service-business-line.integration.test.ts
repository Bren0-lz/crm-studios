import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { OWNER_ID } from "../../../test-support/legacy-fixtures.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: linha do serviço no painel de vendas`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("servicebizline");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("creates with studio by default, lists it and keeps it on edits that omit it", async () => {
        const studio = await repository.createService(clinicId, {
          name: "Pilates em grupo",
          durationMinutes: 50,
          priceInCents: 9000,
        });
        const laser = await repository.createService(clinicId, {
          name: "Depilação a laser",
          durationMinutes: 30,
          priceInCents: 15000,
          businessLine: "aesthetics",
        });
        expect(studio.businessLine).toBe("studio");
        expect(laser.businessLine).toBe("aesthetics");
        const listed = await repository.listServices(clinicId);
        expect(listed.find((item) => item.id === laser.id)?.businessLine).toBe(
          "aesthetics",
        );
        expect(
          listed.find((item) => item.id === studio.id)?.businessLine,
        ).toBe("studio");
        // Serviços já existentes (seed/migração) entram como Estúdio.
        expect(
          listed.every((item) =>
            ["studio", "aesthetics"].includes(item.businessLine),
          ),
        ).toBe(true);

        const registryLine = async (id: string) =>
          (await repository.getAdministrativeRegistry(clinicId)).services.find(
            (item) => item.id === id,
          )?.businessLine;
        expect(await registryLine(laser.id)).toBe("aesthetics");

        // Edição sem o campo mantém a linha atual.
        const kept = await repository.updateAdministrativeRegistry(
          clinicId,
          OWNER_ID,
          laser.id,
          {
            kind: "service",
            data: {
              name: "Depilação a laser (axilas)",
              durationMinutes: 30,
              priceInCents: 15000,
              active: true,
            },
          },
        );
        expect(kept).toMatchObject({ businessLine: "aesthetics" });
        expect(await registryLine(laser.id)).toBe("aesthetics");

        const changed = await repository.updateAdministrativeRegistry(
          clinicId,
          OWNER_ID,
          laser.id,
          {
            kind: "service",
            data: {
              name: "Depilação a laser (axilas)",
              durationMinutes: 30,
              priceInCents: 15000,
              active: true,
              businessLine: "studio",
            },
          },
        );
        expect(changed).toMatchObject({ businessLine: "studio" });
        expect(await registryLine(laser.id)).toBe("studio");
      });

      it.skipIf(storage === "memory")(
        "rejects an unknown business line in the database",
        async () => {
          const service = await repository.createService(clinicId, {
            name: "Massoterapia",
            durationMinutes: 60,
            priceInCents: 17000,
          });
          await expect(
            pool!.query(
              "UPDATE services SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
              ["dance", clinicId, service.id],
            ),
          ).rejects.toThrow();
        },
      );
    },
  );
}
