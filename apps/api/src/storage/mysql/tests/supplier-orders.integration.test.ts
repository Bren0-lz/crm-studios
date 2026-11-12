import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  saoPauloToday,
  supplierInputSchema,
  supplierOrderInputSchema,
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

// Pedidos ao fornecedor: produtos novos sem preço, entrada no estoque e atomicidade nos dois armazenamentos.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: pedidos ao fornecedor`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("supplierorders");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function supplier() {
        return (await repository.saveSupplier(
          clinicId,
          actorId,
          supplierInputSchema.parse({
            name: `Fornecedor ${randomUUID().slice(0, 8)}`,
            kind: "company",
          }),
        ))!;
      }

      it("cadastra o item novo sem preço, dá entrada e bloqueia a venda", async () => {
        const { id: supplierId } = await supplier();
        const name = `Item ${randomUUID().slice(0, 8)}`;
        const order = await repository.createSupplierOrder(
          clinicId,
          actorId,
          supplierId,
          supplierOrderInputSchema.parse({
            orderedOn: "2026-10-20",
            number: "77",
            totalInCents: 9_000,
            items: [{ productName: name, quantity: 3, unitCostInCents: 3_000 }],
          }),
        );
        expect(order).toMatchObject({
          number: "77",
          totalInCents: 9_000,
          items: [{ productName: name, quantity: 3, createdProduct: true }],
        });
        const inventory = await repository.getInventoryWorkspace(clinicId);
        const product = inventory.products.find((item) => item.name === name)!;
        expect(product).toMatchObject({
          salePriceInCents: null,
          costInCents: 3_000,
          currentStock: 3,
        });
        expect(
          await repository.listSupplierOrders(clinicId, supplierId),
        ).toHaveLength(1);
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Venda ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: `Venda ${randomUUID()}`,
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
        await expect(
          repository.createProductSale(clinicId, actorId, {
            patientId: patient.id,
            items: [
              { productId: product.id, quantity: 1, unitPriceInCents: 5_000 },
            ],
            settlement: "receivable",
            dueDate: saoPauloToday(),
          }),
        ).rejects.toMatchObject({ code: "PRODUCT_PRICE_MISSING" });
      });

      it("desfaz o pedido inteiro quando um item é inválido", async () => {
        const { id: supplierId } = await supplier();
        const name = `Item ${randomUUID().slice(0, 8)}`;
        await expect(
          repository.createSupplierOrder(
            clinicId,
            actorId,
            supplierId,
            supplierOrderInputSchema.parse({
              orderedOn: "2026-10-20",
              totalInCents: 1_000,
              items: [
                { productName: name, quantity: 1 },
                { productId: randomUUID(), quantity: 1 },
              ],
            }),
          ),
        ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
        const inventory = await repository.getInventoryWorkspace(clinicId);
        expect(inventory.products.some((item) => item.name === name)).toBe(
          false,
        );
        expect(
          await repository.listSupplierOrders(clinicId, supplierId),
        ).toEqual([]);
      });
    },
  );
}
