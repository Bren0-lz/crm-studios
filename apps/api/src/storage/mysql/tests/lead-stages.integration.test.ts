import { leadInputSchema, leadStagesInputSchema } from "@crm/contracts";
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
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: funil configurável`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadstages");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
    });

      it("saves the funnel, uses it for new leads and moves and guards stages with leads", async () => {
        const current = await repository.listLeadStages(clinicId);
        expect(current.map((item) => item.kind)).toEqual([
          "open",
          "open",
          "open",
          "open",
          "won",
          "lost",
        ]);
        const kept = current
          .filter((item) => item.stage !== "new_contact")
          .map(({ stage, label }) => ({ stage, label }));
        const newLead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead em Novos",
            phone: "31977775555",
            source: "Site",
            interest: "Pilates",
          }),
        );
        expect(newLead.stage).toBe("new_contact");
        // Com lead em "Novos", remover a etapa é bloqueado.
        const blocked = await repository
          .saveLeadStages(
            clinicId,
            leadStagesInputSchema.parse({ stages: kept }),
          )
          .catch((error: Error) => error);
        expect(blocked).toBeInstanceOf(Error);
        expect((await repository.listLeadStages(clinicId)).length).toBe(6);

        const saved = await repository.saveLeadStages(
          clinicId,
          leadStagesInputSchema.parse({
            stages: [
              { label: "Triagem", color: "#0d9488" },
              ...current.map(({ stage, label }) => ({
                stage,
                label: stage === "won" ? "Matrícula" : label,
              })),
            ],
          }),
        );
        expect(saved[0]).toMatchObject({
          label: "Triagem",
          kind: "open",
          color: "#0d9488",
        });
        expect(saved.find((item) => item.stage === "won")?.label).toBe(
          "Matrícula",
        );
        expect(await repository.listLeadStages(clinicId)).toEqual(saved);

        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead do funil configurável",
            phone: "31977776666",
            source: "Site",
            interest: "Pilates",
          }),
        );
        expect(lead.stage).toBe(saved[0]!.stage);
        expect(
          (await repository.moveLead(clinicId, actorId, lead.id, "proposal"))
            ?.stage,
        ).toBe("proposal");
        await expect(
          repository.moveLead(clinicId, actorId, lead.id, "stage_inexistente"),
        ).rejects.toThrow("Etapa do funil não encontrada.");
      });
    },
  );
}
