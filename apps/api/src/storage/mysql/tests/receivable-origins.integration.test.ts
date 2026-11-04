import { nextTestCpf } from "../../../test-support/cpf.js";
import { patientInputSchema, planTemplateInputSchema } from "@crm/contracts";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { addLegacyTabService } from "../../../test-support/legacy-tab-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

// Plano e serviços de origem das contas a receber (filtro do Financeiro).
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: origem das contas a receber`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("recorigins");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("returns the sold plan, its services, the tab services and manual entries", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: "Cliente da origem",
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Cliente da origem",
            emergencyContactPhone: "11988887777",
          }),
        );
        const [first, second] = await repository.listServices(clinicId);
        // A comanda vem antes: depois do plano, o serviço já estaria coberto.
        const tab = await repository.openPatientTab(clinicId, actorId, {
          patientId: patient.id,
        });
        await addLegacyTabService(
          repository,
          database?.pool,
          clinicId,
          tab.id,
          {
            professionalId,
            roomId,
            serviceId: first!.id,
            startsAt: "2040-06-20T13:00:00.000Z",
            visitType: "regular",
            notes: "",
          },
          18000,
        );
        await repository.closePatientTab(clinicId, actorId, tab.id, {
          settlement: "receivable",
          dueDate: "2040-06-20",
        });

        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: "Combo de origem",
            totalValueInCents: 40000,
            services: [
              {
                serviceId: first!.id,
                totalSessions: 4,
                totalValueInCents: 25000,
              },
              {
                serviceId: second!.id,
                totalSessions: 2,
                totalValueInCents: 15000,
              },
            ],
          }),
        );
        const plan = await repository.createPatientPlan(clinicId, actorId, {
          planTemplateId: template.id,
          patientId: patient.id,
          name: template.name,
          kind: "fixed_package",
          services: template.services,
          validFrom: "2040-06-01",
          totalValueInCents: 40000,
          installments: 2,
          firstDueDate: "2040-06-10",
        });
        const manual = await repository.createManualReceivable(
          clinicId,
          actorId,
          {
            patientId: patient.id,
            description: "Ajuste avulso",
            amountInCents: 5000,
            dueDate: "2040-06-15",
          },
        );
        const receivables = (await repository.getFinancialSummary(clinicId))
          .receivables;
        const planned = receivables.filter((item) => item.planId === plan.id);
        expect(planned).toHaveLength(2);
        for (const item of planned)
          expect(item).toMatchObject({
            source: "plan",
            planName: "Combo de origem",
            planKind: "fixed_package",
          });
        expect(
          planned[0]!.services!.map((service) => service.id).sort(),
        ).toEqual([first!.id, second!.id].sort());
        expect(receivables.find((item) => item.id === manual.id)).toMatchObject(
          { source: "manual" },
        );
        expect(
          receivables.find((item) => item.id === manual.id)?.services,
        ).toBeUndefined();
        const fromTab = receivables.find((item) => item.source === "tab");
        expect(fromTab?.planName).toBeUndefined();
        expect(fromTab?.planKind).toBeUndefined();
        expect(fromTab?.services).toEqual([
          { id: first!.id, name: first!.name },
        ]);
      });
    },
  );
}
