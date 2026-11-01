import { randomUUID } from "node:crypto";
import {
  patientPlanInputSchema,
  type DailyCash,
  type PaymentMethod,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const paidAt = "2031-04-10T15:00:00Z";
const day = "2031-04-10";

const inflow = (cash: DailyCash, method: PaymentMethod | "unspecified") =>
  cash.byPaymentMethod.find((item) => item.paymentMethod === method)
    ?.inflowInCents ?? 0;
const outflow = (cash: DailyCash, method: PaymentMethod | "unspecified") =>
  cash.byPaymentMethod.find((item) => item.paymentMethod === method)
    ?.outflowInCents ?? 0;

async function patientOf(repo: ClinicRepository) {
  return repo.createPatient(clinic, {
    cpf: nextTestCpf(),
    fullName: "Cliente do pagamento picado",
    phone: "11988887777",
    tags: [],
  });
}

/** Pagamento picado (várias formas) igual nos dois repositórios. */
export function splitPaymentSuite(
  label: string,
  repository: () => ClinicRepository,
) {
  describe(`${label}: pagamento picado`, () => {
    it("vende produto em três formas, separa o caixa por forma e estorna cada uma", async () => {
      const repo = repository();
      const patient = await patientOf(repo);
      const product = await repo.createProduct(clinic, actor, {
        name: `Creme ${randomUUID().slice(0, 6)}`,
        sku: `SPL-${randomUUID().slice(0, 6)}`,
        unit: "un",
        costInCents: 2_000,
        salePriceInCents: 5_000,
        initialStock: 5,
      });
      await expect(
        repo.createProductSale(clinic, actor, {
          patientId: patient.id,
          items: [{ productId: product.id, quantity: 2 }],
          settlement: "paid",
          payments: [
            { paymentMethod: "cash", amountInCents: 3_000 },
            { paymentMethod: "pix", amountInCents: 5_000 },
          ],
          dueDate: day,
        }),
      ).rejects.toMatchObject({ code: "INVALID_PAYMENT_PARTS" });
      const sale = await repo.createProductSale(clinic, actor, {
        patientId: patient.id,
        items: [{ productId: product.id, quantity: 2 }],
        settlement: "paid",
        payments: [
          { paymentMethod: "cash", amountInCents: 3_000 },
          { paymentMethod: "pix", amountInCents: 5_000 },
          {
            paymentMethod: "card",
            amountInCents: 2_000,
            paymentInstallments: 2,
          },
        ],
        dueDate: day,
      });
      const receivable = (
        await repo.getFinancialSummary(clinic)
      ).receivables.find((item) => item.id === sale.receivableId)!;
      expect(receivable).toMatchObject({
        status: "paid",
        amountInCents: 10_000,
        paymentMethod: "cash",
        paymentParts: [
          { paymentMethod: "cash", amountInCents: 3_000 },
          { paymentMethod: "pix", amountInCents: 5_000 },
          {
            paymentMethod: "card",
            amountInCents: 2_000,
            paymentInstallments: 2,
          },
        ],
      });
      const today = receivable.paidAt!.slice(0, 10);
      const before = await repo.getDailyCash(clinic, today);
      expect(inflow(before, "cash")).toBeGreaterThanOrEqual(3_000);
      const receipt = await repo.getPaymentReceipt(clinic, receivable.id);
      expect(receipt?.paymentParts).toHaveLength(3);
      await repo.reverseReceivablePayment(clinic, actor, receivable.id);
      const after = await repo.getDailyCash(clinic, today);
      expect(inflow(before, "cash") - inflow(after, "cash")).toBe(3_000);
      expect(inflow(before, "pix") - inflow(after, "pix")).toBe(5_000);
      expect(inflow(before, "card") - inflow(after, "card")).toBe(2_000);
      expect(inflow(after, "unspecified")).toBe(0);
      const reopened = (
        await repo.getFinancialSummary(clinic)
      ).receivables.find((item) => item.id === receivable.id)!;
      expect(reopened.status).toBe("open");
      expect(reopened.paymentParts).toBeUndefined();
    });

    it("dá baixa picada com desconto, deixa o saldo aberto e corrige as datas de todas as formas", async () => {
      const repo = repository();
      const patient = await patientOf(repo);
      const invoice = await repo.createManualReceivable(clinic, actor, {
        patientId: patient.id,
        description: "Pacote picado",
        amountInCents: 10_000,
        dueDate: day,
        competence: "2031-04",
      });
      await expect(
        repo.settleReceivable(
          clinic,
          actor,
          invoice.id,
          "pix",
          { paidAt },
          {
            discountInCents: 1_000,
            payments: [
              { paymentMethod: "pix", amountInCents: 6_000 },
              { paymentMethod: "card", amountInCents: 4_000 },
            ],
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_SETTLEMENT" });
      const paid = await repo.settleReceivable(
        clinic,
        actor,
        invoice.id,
        "pix",
        { paidAt },
        {
          discountInCents: 1_000,
          balanceDueDate: "2031-05-10",
          payments: [
            { paymentMethod: "pix", amountInCents: 4_000 },
            {
              paymentMethod: "card",
              amountInCents: 3_000,
              paymentInstallments: 3,
            },
          ],
        },
      );
      expect(paid).toMatchObject({
        status: "paid",
        amountInCents: 7_000,
        paymentMethod: "pix",
      });
      const balance = (await repo.getFinancialSummary(clinic)).receivables.find(
        (item) =>
          item.patientId === patient.id &&
          item.status === "open" &&
          item.id !== invoice.id,
      );
      expect(balance).toMatchObject({ amountInCents: 2_000 });
      expect(balance?.paymentParts).toBeUndefined();
      const cash = await repo.getDailyCash(clinic, day);
      expect(inflow(cash, "pix")).toBe(4_000);
      expect(inflow(cash, "card")).toBe(3_000);
      const receipt = await repo.getPaymentReceipt(clinic, invoice.id);
      expect(receipt).toMatchObject({
        amountInCents: 7_000,
        discountInCents: 1_000,
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 4_000 },
          {
            paymentMethod: "card",
            amountInCents: 3_000,
            paymentInstallments: 3,
          },
        ],
      });
      await repo.setFinancialDates(clinic, actor, "receivable", invoice.id, {
        paidAt: "2031-04-12T15:00:00Z",
        availableAt: "2031-04-12T15:00:00Z",
        reason: "Conciliação do extrato",
      });
      const moved = await repo.getDailyCash(clinic, "2031-04-12");
      expect(inflow(moved, "pix")).toBe(4_000);
      expect(inflow(moved, "card")).toBe(3_000);
      expect((await repo.getDailyCash(clinic, day)).totalInflowInCents).toBe(0);
      const reversed = await repo.reverseReceivablePayment(
        clinic,
        actor,
        invoice.id,
      );
      // Volta sem o desconto: 7.000 recebidos + 1.000 de desconto.
      expect(reversed).toMatchObject({ status: "open", amountInCents: 8_000 });
    });

    it("paga despesa em duas formas e estorna cada uma na sua forma", async () => {
      const repo = repository();
      const category = await repo.createFinancialCategory(clinic, {
          name: `Despesa picada ${randomUUID().slice(0, 6)}`,
          kind: "expense",
        }),
        center = await repo.createCostCenter(clinic, {
          name: `Centro ${randomUUID().slice(0, 6)}`,
        });
      const payable = await repo.createPayable(clinic, actor, {
        description: "Fornecedor picado",
        categoryId: category.id,
        costCenterId: center.id,
        amountInCents: 9_000,
        dueDate: day,
      });
      await expect(
        repo.settlePayable(clinic, actor, payable.id, "pix", { paidAt }, [
          { paymentMethod: "pix", amountInCents: 1_000 },
        ]),
      ).rejects.toMatchObject({ code: "INVALID_PAYMENT_PARTS" });
      const paid = await repo.settlePayable(
        clinic,
        actor,
        payable.id,
        "pix",
        { paidAt },
        [
          { paymentMethod: "pix", amountInCents: 6_000 },
          { paymentMethod: "bank_transfer", amountInCents: 3_000 },
        ],
      );
      expect(paid).toMatchObject({
        status: "paid",
        paymentMethod: "pix",
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 6_000 },
          { paymentMethod: "bank_transfer", amountInCents: 3_000 },
        ],
      });
      const cash = await repo.getDailyCash(clinic, day);
      expect(outflow(cash, "pix")).toBe(6_000);
      expect(outflow(cash, "bank_transfer")).toBe(3_000);
      await repo.reversePayablePayment(clinic, actor, payable.id);
      const reversedOn = (
        await repo.getFinancialWorkspace(clinic)
      ).payables.find((item) => item.id === payable.id)!;
      expect(reversedOn.status).toBe("open");
      expect(reversedOn.paymentParts).toBeUndefined();
    });

    it("gera as cobranças do plano por forma, com a forma prevista em cada uma", async () => {
      const repo = repository();
      const patient = await patientOf(repo);
      const service = (await repo.listServices(clinic))[0]!;
      const template = await repo.createPlanTemplate(clinic, actor, {
        name: `Plano picado ${randomUUID().slice(0, 6)}`,
        totalValueInCents: 30_000,
        services: [
          {
            serviceId: service.id,
            totalSessions: 4,
            totalValueInCents: 30_000,
          },
        ],
      } as Parameters<ClinicRepository["createPlanTemplate"]>[2]);
      const plan = await repo.createPatientPlan(
        clinic,
        actor,
        patientPlanInputSchema.parse({
          planTemplateId: template.id,
          patientId: patient.id,
          kind: "fixed_package",
          name: "Plano picado",
          services: [
            {
              serviceId: service.id,
              totalSessions: 4,
              totalValueInCents: 30_000,
            },
          ],
          validFrom: "2031-04-01",
          totalValueInCents: 30_000,
          installments: 1,
          firstDueDate: "2031-04-10",
          paymentParts: [
            { paymentMethod: "pix", amountInCents: 10_000, installments: 1 },
            { paymentMethod: "card", amountInCents: 20_000, installments: 2 },
          ],
        }),
      );
      expect(plan).toMatchObject({
        paymentMethod: "pix",
        installments: 3,
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 10_000, installments: 1 },
          { paymentMethod: "card", amountInCents: 20_000, installments: 2 },
        ],
      });
      const charges = (await repo.getFinancialSummary(clinic)).receivables
        .filter((item) => item.planId === plan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);
      expect(
        charges.map((item) => [
          item.installmentNumber,
          item.installmentCount,
          item.dueDate,
          item.amountInCents,
          item.paymentParts?.[0]?.paymentMethod,
        ]),
      ).toEqual([
        [1, 3, "2031-04-10", 10_000, "pix"],
        [2, 3, "2031-04-10", 10_000, "card"],
        [3, 3, "2031-05-10", 10_000, "card"],
      ]);
      expect(charges[0]!.description).toBe(`${plan.name} · 1/3`);
    });
  });
}
