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

// Venda de produtos em uma etapa: mesma regra e atomicidade nos dois armazenamentos.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: venda de produtos`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("productsales");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
      await database?.drop();
    });

      async function fixtures(stock: number) {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Venda ${randomUUID()}`,
            phone: "11988887777",
          }),
        );
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Produto ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 1_000,
            salePriceInCents: 2_500,
            initialStock: stock,
          }),
        );
        return { patient, product };
      }

      it("abre, preenche e fecha a comanda com o preço ajustado", async () => {
        const { patient, product } = await fixtures(4);
        const sale = await repository.createProductSale(clinicId, actorId, {
          patientId: patient.id,
          items: [
            { productId: product.id, quantity: 3, unitPriceInCents: 2_000 },
          ],
          settlement: "paid",
          paymentMethod: "card",
          dueDate: saoPauloToday(),
        });
        expect(sale).toMatchObject({
          status: "closed",
          paymentStatus: "paid",
          totalInCents: 6_000,
        });
        expect(sale.items[0]).toMatchObject({
          quantity: 3,
          unitPriceInCents: 2_000,
          totalInCents: 6_000,
        });
        const inventory = await repository.getInventoryWorkspace(clinicId);
        expect(
          inventory.products.find((item) => item.id === product.id)
            ?.currentStock,
        ).toBe(1);
      });

      it("desfaz tudo quando um item não tem estoque", async () => {
        const { patient, product } = await fixtures(1);
        const before = await repository.getInventoryWorkspace(clinicId);
        await expect(
          repository.createProductSale(clinicId, actorId, {
            patientId: patient.id,
            items: [{ productId: product.id, quantity: 2 }],
            settlement: "receivable",
            dueDate: saoPauloToday(),
          }),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
        const after = await repository.getInventoryWorkspace(clinicId);
        expect(after.tabs).toHaveLength(before.tabs.length);
        expect(
          after.products.find((item) => item.id === product.id)?.currentStock,
        ).toBe(1);
      });
    },
  );
}
