import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: parcelamento por forma de pagamento`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("installments");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("saves installments per payment method keeping the others", async () => {
        const initial = await repository.getPaymentMethodSettings(clinicId);
        expect(initial.methods).toHaveLength(6);
        expect(initial.methods[0]).toEqual({
          method: "pix",
          acceptsInstallments: true,
          maxInstallments: 36,
        });
        await repository.updatePaymentMethodSettings(clinicId, actorId, {
          methods: [
            { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
            { method: "card", acceptsInstallments: true, maxInstallments: 6 },
          ],
        });
        const saved = await repository.updatePaymentMethodSettings(
          clinicId,
          actorId,
          {
            methods: [
              {
                method: "cash",
                acceptsInstallments: false,
                maxInstallments: 1,
              },
            ],
          },
        );
        expect(saved.updatedAt).toBeDefined();
        expect(saved.methods.slice(0, 3)).toEqual([
          { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
          { method: "card", acceptsInstallments: true, maxInstallments: 6 },
          { method: "cash", acceptsInstallments: false, maxInstallments: 1 },
        ]);
        expect(
          (await repository.getPaymentMethodSettings(clinicId)).methods,
        ).toEqual(saved.methods);
      });

      it("stores the template limit, card installments and the plan payment summary", async () => {
        const [service] = await repository.listServices(clinicId);
        const [patient] = await repository.listPatients(clinicId);
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          {
            name: "Pacote parcelado",
            totalValueInCents: 30000,
            kind: "fixed_package",
            maxInstallments: 3,
            services: [
              {
                serviceId: service!.id,
                totalSessions: 3,
                totalValueInCents: 30000,
              },
            ],
          },
        );
        expect(template.maxInstallments).toBe(3);
        const plan = await repository.createPatientPlan(clinicId, actorId, {
          planTemplateId: template.id,
          patientId: patient!.id,
          name: "Pacote parcelado",
          kind: "fixed_package",
          services: [
            {
              serviceId: service!.id,
              totalSessions: 3,
              totalValueInCents: 30000,
            },
          ],
          validFrom: "2039-06-01",
          totalValueInCents: 30000,
          installments: 3,
          firstDueDate: "2039-06-10",
          paymentMethod: "card",
        });
        const receivables = (
          await repository.getFinancialSummary(clinicId)
        ).receivables
          .filter((item) => item.planId === plan.id)
          .sort((a, b) => a.installmentNumber - b.installmentNumber);
        expect(receivables).toHaveLength(3);
        // A baixa conhece o total do plano e a forma combinada na venda.
        expect(receivables[0]).toMatchObject({
          planTotalInCents: 30000,
          planPaymentMethod: "card",
        });
        // Uma parcela do plano não é parcelada de novo na forma.
        await expect(
          repository.settleReceivable(
            clinicId,
            actorId,
            receivables[0]!.id,
            "card",
            undefined,
            { paymentInstallments: 3 },
          ),
        ).rejects.toMatchObject({ code: "INSTALLMENT_PAYMENT_SPLIT" });
        await repository.settleReceivable(
          clinicId,
          actorId,
          receivables[0]!.id,
          "card",
        );
        const listed = (
          await repository.listPatientPlans(clinicId, patient!.id)
        ).find((item) => item.id === plan.id);
        expect(listed?.paymentSummary).toEqual({
          installmentCount: 3,
          paidCount: 1,
          openCount: 2,
          overdueCount: 0,
          paidInCents: 10000,
          openInCents: 20000,
        });
        // À vista no plano, a cobrança única pode ser paga no cartão em 3x.
        const single = await repository.createPatientPlan(clinicId, actorId, {
          planTemplateId: template.id,
          patientId: patient!.id,
          name: "Pacote à vista",
          kind: "fixed_package",
          services: [
            {
              serviceId: service!.id,
              totalSessions: 3,
              totalValueInCents: 30000,
            },
          ],
          validFrom: "2039-06-01",
          totalValueInCents: 30000,
          installments: 1,
          firstDueDate: "2039-06-10",
        });
        const [charge] = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.filter((item) => item.planId === single.id);
        expect(charge?.planPaymentMethod).toBeUndefined();
        const paid = await repository.settleReceivable(
          clinicId,
          actorId,
          charge!.id,
          "card",
          undefined,
          { paymentInstallments: 3 },
        );
        expect(paid).toMatchObject({ status: "paid", paymentInstallments: 3 });
        const reversed = await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          charge!.id,
        );
        expect(reversed?.paymentInstallments).toBeUndefined();
        const cleared = await repository.updatePlanTemplate(
          clinicId,
          actorId,
          template.id,
          { maxInstallments: null },
        );
        expect(cleared?.maxInstallments).toBeUndefined();
      });
    },
  );
}
