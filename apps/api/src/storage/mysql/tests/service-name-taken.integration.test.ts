import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import type { MemoryRepositoryContext } from "../../memory/context.js";
import { demoUserId } from "../../../demo-scenarios.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const taken = { code: "SERVICE_NAME_TAKEN", statusCode: 409 };

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: serviço com nome repetido`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("servicename");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("recusa criar e renomear para o nome de outro serviço, inclusive inativo", async () => {
        const first = await repository.createService(clinicId, {
          name: "QA Dança Terapêutica",
          durationMinutes: 60,
        });
        await expect(
          repository.createService(clinicId, {
            name: "  qa danca terapeutica ",
            durationMinutes: 30,
          }),
        ).rejects.toMatchObject(taken);

        const other = await repository.createService(clinicId, {
          name: "QA Outro serviço",
          durationMinutes: 45,
        });
        await expect(
          repository.updateAdministrativeRegistry(
            clinicId,
            demoUserId,
            other.id,
            {
              kind: "service",
              data: {
                name: "QA DANÇA TERAPÊUTICA",
                durationMinutes: 45,
                active: true,
              },
            },
          ),
        ).rejects.toMatchObject(taken);

        // O próprio nome (com outra caixa) continua aceito na edição.
        await expect(
          repository.updateAdministrativeRegistry(
            clinicId,
            demoUserId,
            first.id,
            {
              kind: "service",
              data: {
                name: "QA dança terapêutica",
                durationMinutes: 60,
                active: false,
              },
            },
          ),
        ).resolves.toMatchObject({ name: "QA dança terapêutica" });

        // Inativo continua ocupando o nome.
        await expect(
          repository.createService(clinicId, {
            name: "QA Danca Terapeutica",
            durationMinutes: 60,
          }),
        ).rejects.toMatchObject(taken);
        expect(
          (
            await repository.getAdministrativeRegistry(clinicId)
          ).services.filter((item) =>
            item.name.toLowerCase().startsWith("qa dan"),
          ),
        ).toHaveLength(1);
      });

      it("edita serviço repetido de antes da regra sem mudar o nome, mas não o renomeia para outro", async () => {
        const original = await repository.createService(clinicId, {
          name: "QA Legado Pilates",
          durationMinutes: 60,
        });
        const legacy = await repository.createService(clinicId, {
          name: "QA Legado temporário",
          durationMinutes: 60,
        });
        const other = await repository.createService(clinicId, {
          name: "QA Legado Funcional",
          durationMinutes: 60,
        });
        // Simula o repetido gravado antes da regra (direto no armazenamento).
        if (database)
          await database.pool.query(
            "UPDATE services SET name=$1 WHERE clinic_id=$2 AND id=$3",
            ["qa legado pilates ", clinicId, legacy.id],
          );
        else
          (
            repository as unknown as { context: MemoryRepositoryContext }
          ).context.services.find((item) => item.id === legacy.id)!.name =
            "qa legado pilates ";
        const edit = (id: string, name: string, active = true) =>
          repository.updateAdministrativeRegistry(clinicId, demoUserId, id, {
            kind: "service",
            data: { name, durationMinutes: 45, active },
          });

        await expect(
          edit(legacy.id, "qa legado pilates ", false),
        ).resolves.toMatchObject({ durationMinutes: 45, active: false });
        await expect(
          edit(original.id, "QA Legado Pilates"),
        ).resolves.toMatchObject({ durationMinutes: 45 });
        // Mesma chave com outra grafia continua sendo "manter o nome".
        await expect(
          edit(legacy.id, "QA LEGADO PILATES"),
        ).resolves.toMatchObject({ name: "QA LEGADO PILATES" });
        await expect(
          edit(legacy.id, "QA Legado Funcional"),
        ).rejects.toMatchObject(taken);
        await expect(edit(other.id, "QA Legado Pilates")).rejects.toMatchObject(
          taken,
        );
      });
    },
  );
}
