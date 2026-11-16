import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  productInputSchema,
  saoPauloToday,
} from "@crm/contracts";
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

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// E7c: estorno (recebimento e conta a pagar) e cancelamento de contrato guardam o motivo.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: motivo do estorno e do cancelamento de contrato`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("reversalrsn");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      async function patient() {
        return repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Cliente estorno ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: `Contato ${randomUUID()}`,
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
      }

      it("guarda o motivo do estorno do recebimento no evento do Histórico", async () => {
        const client = await patient();
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Produto ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 1_000,
            salePriceInCents: 2_500,
            initialStock: 5,
          }),
        );
        const sale = await repository.createProductSale(clinicId, actorId, {
          patientId: client.id,
          items: [{ productId: product.id, quantity: 1 }],
          settlement: "paid",
          paymentMethod: "card",
          dueDate: saoPauloToday(),
        });
        const reversed = await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          sale.receivableId!,
          "Cobrança em duplicidade",
        );
        expect(reversed).toMatchObject({ status: "open" });
        const page = await repository.listAdminAuditPage(clinicId);
        expect(
          page.items.filter(
            (item) =>
              item.module === "finance" &&
              item.metadata.reason === "Cobrança em duplicidade",
          ),
        ).toHaveLength(1);
      });

      it("guarda o motivo do estorno da conta a pagar", async () => {
        const marker = randomUUID().slice(0, 8);
        const category = await repository.createFinancialCategory(clinicId, {
          name: `Despesa ${marker}`,
          kind: "expense",
        });
        const costCenter = await repository.createCostCenter(clinicId, {
          name: `Centro ${marker}`,
        });
        const payable = await repository.createPayable(clinicId, actorId, {
          description: `Conta ${marker}`,
          supplier: "Fornecedor",
          categoryId: category.id,
          costCenterId: costCenter.id,
          dueDate: saoPauloToday(),
          amountInCents: 4_000,
        });
        await repository.settlePayable(clinicId, actorId, payable.id, "pix");
        const reversed = await repository.reversePayablePayment(
          clinicId,
          actorId,
          payable.id,
          "Pago na conta errada",
        );
        expect(reversed).toMatchObject({ status: "open" });
        if (!pool) return;
        const events = await pool.query<{ reason: string | null }>(
          `SELECT JSON_VALUE(metadata, '$.reason') AS reason FROM payable_events
           WHERE clinic_id = $1 AND payable_id = $2 AND kind = 'payment_reversal'`,
          [clinicId, payable.id],
        );
        expect(events.rows.map((row) => row.reason)).toEqual([
          "Pago na conta errada",
        ]);
        const page = await repository.listAdminAuditPage(clinicId);
        expect(
          page.items.some(
            (item) =>
              item.action === "payable.payment_reversal" &&
              item.metadata.reason === "Pago na conta errada",
          ),
        ).toBe(true);
      });

      it("guarda o motivo do cancelamento do contrato", async () => {
        const client = await patient();
        const template = await repository.createDocumentTemplate(clinicId, {
          name: `Contrato ${randomUUID().slice(0, 8)}`,
          kind: "contract",
          body: "Contrato de {{paciente_nome}}.",
        });
        const document = await repository.createIssuedDocument(
          clinicId,
          actorId,
          {
            templateId: template.id,
            patientId: client.id,
            title: "Contrato a cancelar",
          },
        );
        const issued = await repository.updateIssuedDocumentStatus(
          clinicId,
          document.id,
          "issued",
        );
        expect(issued).not.toHaveProperty("cancellationReason");
        const cancelled = await repository.updateIssuedDocumentStatus(
          clinicId,
          document.id,
          "cancelled",
          "Cliente desistiu do plano",
        );
        expect(cancelled).toMatchObject({
          status: "cancelled",
          cancellationReason: "Cliente desistiu do plano",
        });
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === document.id,
          )?.cancellationReason,
        ).toBe("Cliente desistiu do plano");
      });
    },
  );
}
