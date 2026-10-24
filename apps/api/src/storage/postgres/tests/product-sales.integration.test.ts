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
    },
  );
}
