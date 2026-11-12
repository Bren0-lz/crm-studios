import { leadImportInputSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import { testPatientContact } from "../../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: importação de leads por planilha (LI1)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadimport");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const row = (fields: Record<string, string>) => ({
        ...leadImportInputSchema.parse(fields),
        source: fields.source ?? "Planilha",
      });

      it("grava os leads na etapa escolhida, com origem e Outros, numa transação", async () => {
        const tag = randomUUID().slice(0, 8);
        expect(
          await repository.importLeads(clinicId, "proposal", [
            row({ fullName: `Ana ${tag}`, phone: "11999990001" }),
            row({ notes: `Sem contato ${tag}`, source: "Instagram" }),
            {
              ...row({ fullName: `Extra ${tag}` }),
              extraFields: { Turma: "Manhã" },
            },
          ]),
        ).toEqual({ created: 3 });
        const leads = (await repository.listLeads(clinicId)).filter(
          (lead) => lead.fullName.includes(tag) || lead.notes?.includes(tag),
        );
        expect(leads).toHaveLength(3);
        expect(leads.every((lead) => lead.stage === "proposal")).toBe(true);
        expect(leads.every((lead) => !lead.eventId)).toBe(true);
        expect(leads.map((lead) => lead.source).sort()).toEqual([
          "Instagram",
          "Planilha",
          "Planilha",
        ]);
        expect(
          leads.find((lead) => lead.fullName === `Extra ${tag}`)?.extraFields,
        ).toEqual({ Turma: "Manhã" });

        for (const stage of ["won", "lost", "inexistente"])
          await expect(
            repository.importLeads(clinicId, stage, [row({ fullName: tag })]),
          ).rejects.toMatchObject({ code: "LEAD_IMPORT_INVALID_STAGE" });
        // Falha no meio: nada da importação fica gravado.
        await expect(
          repository.importLeads(clinicId, "new_contact", [
            row({ fullName: `Rollback ${tag}` }),
            {
              ...row({ fullName: `Rollback ${tag}` }),
              responsibleUserId: randomUUID(),
            },
          ]),
        ).rejects.toMatchObject({ code: "RESPONSIBLE_USER_NOT_FOUND" });
        expect(
          (await repository.listLeads(clinicId)).filter(
            (lead) => lead.fullName === `Rollback ${tag}`,
          ),
        ).toHaveLength(0);
      });

      it("lista clientes e leads em aberto para os avisos de duplicidade", async () => {
        const tag = randomUUID().slice(0, 8);
        const patient = await repository.createPatient(clinicId, {
          fullName: `Cliente ${tag}`,
          phone: "11988887777",
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });
        await repository.importLeads(clinicId, "new_contact", [
          row({ fullName: `Lead ${tag}`, email: `${tag}@example.com` }),
        ]);
        const candidates =
          await repository.listContactImportCandidates(clinicId);
        expect(candidates.patients).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: patient.id,
              fullName: `Cliente ${tag}`,
              phone: "11988887777",
            }),
          ]),
        );
        expect(candidates.leads).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              fullName: `Lead ${tag}`,
              email: `${tag}@example.com`,
            }),
          ]),
        );
        expect(
          (
            await repository.listContactImportCandidates(
              "99999999-9999-4999-8999-999999999999",
            )
          ).leads.some((lead) => lead.fullName.includes(tag)),
        ).toBe(false);
      });
    },
  );
}
