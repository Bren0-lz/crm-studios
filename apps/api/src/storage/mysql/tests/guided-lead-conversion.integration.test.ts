import { leadInputSchema } from "@crm/contracts";
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
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cadastro guiado convertendo o lead (LC1)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("guided_lead");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const createLead = (phone: string) =>
        repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lia Guiada",
            phone,
            source: "Instagram",
            interest: "Pilates",
          }),
        );
      const patient = (phone: string, cpf = nextTestCpf()) => ({
        fullName: "Lia Guiada",
        phone,
        cpf,
        tags: [],
        ...testPatientContact,
      });
      const leadOf = async (id: string) =>
        (await repository.listLeads(clinicId)).find((item) => item.id === id);

      it("cria o cliente e converte o lead na mesma operação", async () => {
        const lead = await createLead("11955550001");
        const result = await repository.createPatientWithNextStep(
          clinicId,
          actorId,
          {
            next: "none",
            leadId: lead.id,
            patient: patient("11955550001"),
          } as never,
        );
        expect(result.lead).toMatchObject({
          id: lead.id,
          stage: "won",
          convertedPatientId: result.patient.id,
        });
        expect(result.patient.tags).toContain("Convertido do CRM");
        expect(result.patient.interests).toContain("Pilates");
        expect(await leadOf(lead.id)).toMatchObject({
          stage: "won",
          convertedPatientId: result.patient.id,
        });
        await expect(
          repository.createPatientWithNextStep(clinicId, actorId, {
            next: "none",
            leadId: lead.id,
            patient: patient("11955550001"),
          } as never),
        ).rejects.toMatchObject({ code: "LEAD_ALREADY_CONVERTED" });
      });

      it("recusa CPF já cadastrado e deixa o lead aberto", async () => {
        const cpf = nextTestCpf();
        await repository.createPatient(clinicId, patient("11955550002", cpf));
        const lead = await createLead("11955550002");
        await expect(
          repository.createPatientWithNextStep(clinicId, actorId, {
            next: "none",
            leadId: lead.id,
            patient: patient("11955550002", cpf),
          } as never),
        ).rejects.toMatchObject({ code: "LEAD_PATIENT_EXISTS" });
        expect(await leadOf(lead.id)).not.toHaveProperty("convertedPatientId");
      });
    },
  );
}
