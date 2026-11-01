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

      it("guarda, mantém e desliga o aviso de reposição do produto", async () => {
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Faixa ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 500,
            salePriceInCents: 1_500,
            initialStock: 3,
            restockAlertAt: 3,
          }),
        );
        const listed = async () =>
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === product.id,
          );
        expect(await listed()).toMatchObject({
          restockAlertAt: 3,
          lowStock: true,
        });
        const fields = {
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          costInCents: product.costInCents,
          salePriceInCents: 1_800,
          active: true,
        };
        await repository.updateProduct(clinicId, actorId, product.id, fields);
        expect(await listed()).toMatchObject({ restockAlertAt: 3 });
        await repository.updateProduct(clinicId, actorId, product.id, {
          ...fields,
          restockAlertAt: null,
        });
        expect(await listed()).toMatchObject({
          restockAlertAt: null,
          lowStock: false,
        });
      });

      it("pede reposição quando um tamanho chega ao aviso, mesmo com o total acima", async () => {
        const lowStockCount = async () =>
          (
            await repository.getManagementReport(
              clinicId,
              saoPauloToday(),
              saoPauloToday(),
            )
          ).profitability.operational.lowStockCount;
        const baseline = await lowStockCount();
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Camiseta ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 2_000,
            salePriceInCents: 5_000,
            initialStock: 0,
            sizes: ["P", "M"],
            initialSizeStock: [
              { size: "P", quantity: 6 },
              { size: "M", quantity: 20 },
            ],
            restockAlertAt: 5,
          }),
        );
        const listed = async () =>
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === product.id,
          );
        expect(await listed()).toMatchObject({
          currentStock: 26,
          lowStock: false,
        });
        expect(await lowStockCount()).toBe(baseline);
        await repository.createStockMovement(clinicId, actorId, {
          productId: product.id,
          size: "P",
          kind: "loss",
          quantity: 1,
          notes: "Rasgou",
        });
        expect(await listed()).toMatchObject({
          currentStock: 25,
          lowStock: true,
        });
        expect(await lowStockCount()).toBe(baseline + 1);
      });

      it("guarda os tamanhos definidos na categoria de produtos", async () => {
        const name = `Calçados ${randomUUID().slice(0, 8)}`;
        const category = await repository.saveClinicCatalog(
          clinicId,
          actorId,
          "product_category",
          { name, active: true, sizes: ["38", "36", "40"] },
        );
        expect(category?.sizes).toEqual(["38", "36", "40"]);
        // Sem `sizes` na edição, a lista atual fica como está.
        const renamed = await repository.saveClinicCatalog(
          clinicId,
          actorId,
          "product_category",
          { name: `${name} adulto`, active: true },
          category!.id,
        );
        expect(renamed?.sizes).toEqual(["38", "36", "40"]);
        const cleared = await repository.saveClinicCatalog(
          clinicId,
          actorId,
          "product_category",
          { name: `${name} adulto`, active: true, sizes: [] },
          category!.id,
        );
        expect(cleared?.sizes).toEqual([]);
        // Só categorias de produtos guardam tamanhos.
        const brand = await repository.saveClinicCatalog(
          clinicId,
          actorId,
          "product_brand",
          {
            name: `Marca ${randomUUID().slice(0, 8)}`,
            active: true,
            sizes: ["P"],
          },
        );
        expect(brand?.sizes).toEqual([]);
        expect(
          (await repository.listClinicCatalog(clinicId, "product_brand")).find(
            (item) => item.id === brand!.id,
          )?.sizes,
        ).toEqual([]);
      });

      it("guarda, mantém e limpa os tamanhos do produto", async () => {
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Camiseta ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 2_000,
            salePriceInCents: 5_000,
            sizes: ["g", "baby_look_m", "p"],
          }),
        );
        expect(product.sizes).toEqual(["g", "baby_look_m", "p"]);
        const fields = {
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          costInCents: product.costInCents,
          salePriceInCents: 5_500,
          active: true,
        };
        expect(
          (
            await repository.updateProduct(
              clinicId,
              actorId,
              product.id,
              fields,
            )
          )?.sizes,
        ).toEqual(["g", "baby_look_m", "p"]);
        expect(
          (
            await repository.updateProduct(clinicId, actorId, product.id, {
              ...fields,
              sizes: [],
            })
          )?.sizes,
        ).toEqual([]);
        const plain = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Óleo ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 1_000,
            salePriceInCents: 2_000,
          }),
        );
        expect(
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === plain.id,
          )?.sizes,
        ).toEqual([]);
      });

      it("define o saldo de cada tamanho na edição do produto", async () => {
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Top ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 2_000,
            salePriceInCents: 5_000,
            sizes: ["p"],
            initialSizeStock: [{ size: "p", quantity: 2 }],
          }),
        );
        const fields = {
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          costInCents: product.costInCents,
          salePriceInCents: product.salePriceInCents,
          active: true,
        };
        await expect(
          repository.updateProduct(clinicId, actorId, product.id, {
            ...fields,
            sizes: ["p"],
            sizeQuantities: [{ size: "m", quantity: 1 }],
          }),
        ).rejects.toMatchObject({ code: "PRODUCT_SIZE_INVALID" });
        const updated = await repository.updateProduct(
          clinicId,
          actorId,
          product.id,
          {
            ...fields,
            sizes: ["p", "m"],
            sizeQuantities: [
              { size: "p", quantity: 1 },
              { size: "m", quantity: 3 },
            ],
          },
        );
        expect(updated).toMatchObject({
          currentStock: 4,
          sizeStock: [
            { size: "p", currentStock: 1 },
            { size: "m", currentStock: 3 },
          ],
        });
        const movements = (
          await repository.getInventoryWorkspace(clinicId)
        ).movements.filter((item) => item.productId === product.id);
        expect(movements).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "adjustment_out",
              size: "p",
              quantity: -1,
              balanceAfter: 1,
            }),
            expect.objectContaining({
              kind: "adjustment_in",
              size: "m",
              quantity: 3,
              balanceAfter: 3,
            }),
          ]),
        );
      });

      it("separa o estoque por tamanho na venda, no ajuste e no estorno", async () => {
        const { patient } = await fixtures(1);
        const product = await repository.createProduct(
          clinicId,
          actorId,
          productInputSchema.parse({
            name: `Legging ${randomUUID().slice(0, 8)}`,
            sku: randomUUID().slice(0, 12),
            costInCents: 3_000,
            salePriceInCents: 9_000,
            sizes: ["m", "p", "baby_look_g"],
            initialSizeStock: [
              { size: "p", quantity: 4 },
              { size: "m", quantity: 2 },
            ],
          }),
        );
        expect(product).toMatchObject({
          currentStock: 6,
          sizeStock: [
            { size: "m", currentStock: 2 },
            { size: "p", currentStock: 4 },
            { size: "baby_look_g", currentStock: 0 },
          ],
        });
        const stockOf = async () =>
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === product.id,
          )!;

        await expect(
          repository.createStockMovement(clinicId, actorId, {
            productId: product.id,
            kind: "purchase",
            quantity: 1,
            notes: "Sem tamanho",
          }),
        ).rejects.toMatchObject({ code: "PRODUCT_SIZE_REQUIRED" });
        const movement = await repository.createStockMovement(
          clinicId,
          actorId,
          {
            productId: product.id,
            kind: "purchase",
            size: "baby_look_g",
            quantity: 3,
            notes: "Reposição",
          },
        );
        expect(movement).toMatchObject({
          size: "baby_look_g",
          quantity: 3,
          balanceAfter: 3,
        });

        await expect(
          repository.createProductSale(clinicId, actorId, {
            patientId: patient.id,
            items: [{ productId: product.id, size: "m", quantity: 3 }],
            settlement: "receivable",
            dueDate: saoPauloToday(),
          }),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
        const sale = await repository.createProductSale(clinicId, actorId, {
          patientId: patient.id,
          items: [
            { productId: product.id, size: "p", quantity: 2 },
            { productId: product.id, size: "m", quantity: 1 },
          ],
          settlement: "receivable",
          dueDate: saoPauloToday(),
        });
        expect(
          sale.items.map((item) => [item.size, item.quantity]).sort(),
        ).toEqual([
          ["m", 1],
          ["p", 2],
        ]);
        expect((await stockOf()).sizeStock).toEqual([
          { size: "m", currentStock: 1 },
          { size: "p", currentStock: 2 },
          { size: "baby_look_g", currentStock: 3 },
        ]);
        const period = await repository.getSalesPeriodReport(
          clinicId,
          saoPauloToday(),
          saoPauloToday(),
        );
        expect(
          period.sales
            .filter((item) => item.sourceId === sale.id)
            .map((item) => item.itemName)
            .sort(),
        ).toEqual([`${product.name} · M`, `${product.name} · P`]);

        // Comanda aberta: ajuste de quantidade mexe só no tamanho do item.
        const tab = await repository.openPatientTab(clinicId, actorId, {
          patientId: patient.id,
        });
        const withItem = (await repository.addPatientTabItem(
          clinicId,
          actorId,
          tab.id,
          { productId: product.id, size: "baby_look_g", quantity: 1 },
        ))!;
        await repository.updatePatientTabItem(
          clinicId,
          actorId,
          tab.id,
          withItem.items[0]!.id,
          { quantity: 3, unitPriceInCents: 9_000 },
        );
        expect((await stockOf()).sizeStock[2]).toEqual({
          size: "baby_look_g",
          currentStock: 0,
        });
        expect(
          await repository.cancelPatientTab(clinicId, actorId, tab.id),
        ).not.toHaveProperty("cancellationReason");
        expect(
          await repository.cancelPatientTab(clinicId, actorId, sale.id, {
            reason: "Tamanho errado",
          }),
        ).toMatchObject({ cancellationReason: "Tamanho errado" });
        expect(
          (await repository.getInventoryWorkspace(clinicId)).tabs.find(
            (item) => item.id === sale.id,
          ),
        ).toMatchObject({ cancellationReason: "Tamanho errado" });
        expect(await stockOf()).toMatchObject({
          currentStock: 9,
          sizeStock: [
            { size: "m", currentStock: 2 },
            { size: "p", currentStock: 4 },
            { size: "baby_look_g", currentStock: 3 },
          ],
        });
      });
    },
  );
}
