import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  productInputSchema,
  saoPauloToday,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
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

// Descontos da venda e da baixa: mesmos valores nos dois armazenamentos.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: descontos no Financeiro e nos relatórios`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("discounts");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      it("grava o desconto da venda e o da baixa, e o estorno tira só o da baixa", async () => {
        const today = saoPauloToday();
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Desconto ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: `Desconto ${randomUUID()}`,
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
        const product = (sku: string) =>
          repository.createProduct(
            clinicId,
            actorId,
            productInputSchema.parse({
              name: `Produto ${sku}`,
              sku: `${sku}-${randomUUID().slice(0, 8)}`,
              costInCents: 1_000,
              salePriceInCents: 4_000,
              initialStock: 5,
            }),
          );
        const [cream, oil] = await Promise.all([product("A"), product("B")]);
        const sale = await repository.createProductSale(clinicId, actorId, {
          patientId: patient.id,
          items: [
            { productId: cream.id, quantity: 1, unitPriceInCents: 3_600 },
            { productId: oil.id, quantity: 2, unitPriceInCents: 3_600 },
          ],
          settlement: "receivable",
          paymentMethod: "pix",
          dueDate: today,
          discountInCents: 1_200,
        });
        const receivableId = sale.receivableId!;
        const find = async () =>
          (await repository.getFinancialSummary(clinicId)).receivables.find(
            (item) => item.id === receivableId,
          )!;
        expect(await find()).toMatchObject({
          amountInCents: 10_800,
          customerDiscountInCents: 1_200,
        });
        expect((await find()).settlementDiscountInCents).toBeUndefined();

        await repository.settleReceivable(
          clinicId,
          actorId,
          receivableId,
          "pix",
          undefined,
          { discountInCents: 800 },
        );
        expect(await find()).toMatchObject({
          status: "paid",
          amountInCents: 10_000,
          customerDiscountInCents: 1_200,
          settlementDiscountInCents: 800,
        });
        const cash = await repository.getDailyCash(clinicId, today);
        expect(cash.totalDiscountInCents).toBe(800);
        expect(
          cash.movements.find((item) => item.kind === "receipt"),
        ).toMatchObject({ amountInCents: 10_000, discountInCents: 800 });
        expect(
          (await repository.getDreReport(clinicId, today, today)).totals,
        ).toMatchObject({
          customerDiscountInCents: 1_200,
          settlementDiscountInCents: 800,
        });
        const report = await repository.getSalesPeriodReport(
          clinicId,
          today,
          today,
        );
        expect(report.summary).toMatchObject({
          customerDiscountInCents: 1_200,
          settlementDiscountInCents: 800,
        });
        expect(
          report.sales
            .filter((item) => item.kind === "sale")
            .map((item) => item.customerDiscountInCents)
            .sort(),
        ).toEqual([400, 800]);

        await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          receivableId,
        );
        const reversed = await find();
        expect(reversed).toMatchObject({
          status: "open",
          amountInCents: 10_800,
          customerDiscountInCents: 1_200,
        });
        expect(reversed.settlementDiscountInCents).toBeUndefined();
        expect(
          (await repository.getDreReport(clinicId, today, today)).totals
            .settlementDiscountInCents,
        ).toBeUndefined();

        // Nova baixa sem desconto: o da baixa estornada não volta.
        await repository.settleReceivable(
          clinicId,
          actorId,
          receivableId,
          "card",
        );
        expect((await find()).settlementDiscountInCents).toBeUndefined();
      });
    },
  );
}
