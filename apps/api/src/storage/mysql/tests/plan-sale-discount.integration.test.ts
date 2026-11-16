import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { patientInputSchema, type PatientPlanInput } from "@crm/contracts";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

const tenPercent = {
  type: "percentage",
  percent: 10,
  scope: "permanent",
} as const;

// Contratação pela ficha (RE15): "3x com 10%" grava o desconto no plano e nas parcelas,
// na venda simples e na contratação com sessões/turma, nos dois armazenamentos.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: desconto na contratação pela ficha`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("salediscount");
          repository = new MysqlClinicRepository(database.pool);
        }
      }, 60_000);
      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function planInput(): Promise<PatientPlanInput> {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Desconto ficha ${randomUUID().slice(0, 8)}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
        const service = await repository.createService(clinicId, {
          name: `Pilates ${randomUUID().slice(0, 8)}`,
          durationMinutes: 50,
        });
        const services = [
          { serviceId: service.id, totalSessions: 3, totalValueInCents: 30_000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          {
            name: `Pacote ${randomUUID().slice(0, 8)}`,
            totalValueInCents: 30_000,
            services,
          },
        );
        return {
          patientId: patient.id,
          planTemplateId: template.id,
          name: template.name,
          kind: "fixed_package",
          services,
          totalValueInCents: 30_000,
          installments: 3,
          validFrom: "2039-06-01",
          validUntil: "2039-06-30",
          firstDueDate: "2039-06-10",
          autoRenew: false,
          discount: tenPercent,
        };
      }

      const charges = async (planId: string) =>
        (await repository.getFinancialSummary(clinicId)).receivables
          .filter((item) => item.planId === planId)
          .sort((a, b) => a.installmentNumber - b.installmentNumber)
          .map((item) => [item.amountInCents, item.customerDiscountInCents]);
      const discounted = [
        [9_000, 1_000],
        [9_000, 1_000],
        [9_000, 1_000],
      ];

      it("grava o desconto na venda simples do plano", async () => {
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          await planInput(),
        );
        expect(plan.discount).toEqual({ ...tenPercent, usedCharges: 3 });
        expect(await charges(plan.id)).toEqual(discounted);
      });

      it("grava o desconto na contratação com idempotência", async () => {
        const { plan } = await repository.purchasePatientPlan(
          clinicId,
          actorId,
          {
            idempotencyKey: randomUUID(),
            plan: await planInput(),
            appointments: [],
          },
        );
        expect(plan.discount).toEqual({ ...tenPercent, usedCharges: 3 });
        expect(
          (await repository.listPatientPlans(clinicId, plan.patientId))[0]
            ?.discount,
        ).toEqual({ ...tenPercent, usedCharges: 3 });
        expect(await charges(plan.id)).toEqual(discounted);
      });
    },
  );
}
