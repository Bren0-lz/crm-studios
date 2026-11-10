import { latestAssessmentTemplates } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDemoData } from "../../../database.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: modelos de avaliação`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("assessmentte");
        pool = database.pool;
        // Rodar de novo não duplica as fichas iniciais.
        await seedDemoData(pool);
        repository = new MysqlClinicRepository(pool);
      }, 30_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
    });

      it("traz as fichas iniciais e arquiva/reativa a família inteira", async () => {
        const initial = await repository.listAssessmentTemplates(clinicId);
        const names = initial.map((item) => item.name);
        for (const name of [
          "Anamnese",
          "Avaliação postural",
          "Ficha de inscrição — Dançaterapia e Aula de Ritmos",
        ])
          expect(names.filter((item) => item === name)).toHaveLength(1);
        const postural = initial.find(
          (item) => item.name === "Avaliação postural",
        )!;
        expect(postural.fields.length).toBeGreaterThan(20);

        const v2 = await repository.saveAssessmentTemplate(
          clinicId,
          adminId,
          {
            name: postural.name,
            specialty: postural.specialty,
            status: "published",
            fields: postural.fields.slice(0, 5),
          },
          postural.id,
        );
        expect(v2.version).toBe(2);

        const archived = await repository.setAssessmentTemplateActive(
          clinicId,
          adminId,
          postural.id,
          false,
        );
        expect(archived).toMatchObject({ id: v2.id, active: false });
        const afterArchive = await repository.listAssessmentTemplates(clinicId);
        expect(
          afterArchive
            .filter((item) => item.name === postural.name)
            .map((item) => item.active),
        ).toEqual([false, false]);
        expect(
          latestAssessmentTemplates(afterArchive).some(
            (item) => item.name === postural.name,
          ),
        ).toBe(false);

        const restored = await repository.setAssessmentTemplateActive(
          clinicId,
          adminId,
          v2.id,
          true,
        );
        expect(restored).toMatchObject({ id: v2.id, active: true });
        expect(
          await repository.setAssessmentTemplateActive(
            clinicId,
            adminId,
            randomUUID(),
            false,
          ),
        ).toBeNull();
      });
    },
  );
}
