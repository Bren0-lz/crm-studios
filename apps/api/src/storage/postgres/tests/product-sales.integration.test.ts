import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  productInputSchema,
  saoPauloToday,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// Venda de produtos em uma etapa: mesma regra e atomicidade nos dois armazenamentos.
for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: venda de produtos`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `productsale_${randomUUID().replaceAll("-", "")}`;

      beforeAll(async () => {
        if (storage === "memory") return;
        const connection = databaseConnectionConfig({
          url: process.env.TEST_DATABASE_URL!,
          ssl: "auto",
        });
        adminPool = new Pool(connection);
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        await adminPool.query(
          `CREATE TABLE ${schema}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
        );
        pool = new Pool({
          ...connection,
          options: `-c search_path=${schema},public`,
        });
        await runMigrations(pool);
        await seedDemoData(pool);
        repository = new PostgresClinicRepository(pool);
      }, 20_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        try {
          await pool?.end();
          if (adminPool)
            await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          await adminPool?.end();
        }
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
        expect(product.sizes).toEqual(["p", "g", "baby_look_m"]);
        const fields = {
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          costInCents: product.costInCents,
          salePriceInCents: 5_500,
          minimumStock: product.minimumStock,
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
        ).toEqual(["p", "g", "baby_look_m"]);
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
            { size: "p", currentStock: 4 },
            { size: "m", currentStock: 2 },
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
          { size: "p", currentStock: 2 },
          { size: "m", currentStock: 1 },
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
        await repository.cancelPatientTab(clinicId, actorId, tab.id);
        await repository.cancelPatientTab(clinicId, actorId, sale.id);
        expect(await stockOf()).toMatchObject({
          currentStock: 9,
          sizeStock: [
            { size: "p", currentStock: 4 },
            { size: "m", currentStock: 2 },
            { size: "baby_look_g", currentStock: 3 },
          ],
        });
      });
    },
  );
}
