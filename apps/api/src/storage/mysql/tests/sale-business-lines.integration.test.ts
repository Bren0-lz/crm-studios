import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  planTemplateInputSchema,
  productInputSchema,
  productUpdateSchema,
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
import { OWNER_ID } from "../../../test-support/legacy-fixtures.js";
import { addLegacyTabService } from "../../../test-support/legacy-tab-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

// Linha no painel do produto e serviços/linha de cada venda (PX5, painel de vendas).
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: linha do produto e das vendas no painel de vendas`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("salebizline");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const product = (
        name: string,
        extra: { businessLine?: "studio" | "aesthetics" | null } = {},
      ) =>
        repository.createProduct(
          clinicId,
          OWNER_ID,
          productInputSchema.parse({
            name,
            sku: randomUUID().slice(0, 12),
            costInCents: 1_000,
            salePriceInCents: 2_500,
            initialStock: 10,
            ...extra,
          }),
        );

      it("creates a product without classification by default, keeps it on edits that omit it and clears it with null", async () => {
        const plain = await product(`Faixa ${randomUUID().slice(0, 6)}`);
        const cream = await product(`Creme ${randomUUID().slice(0, 6)}`, {
          businessLine: "aesthetics",
        });
        expect(plain.businessLine).toBeNull();
        expect(cream.businessLine).toBe("aesthetics");
        const listed = async (id: string) =>
          (await repository.getInventoryWorkspace(clinicId)).products.find(
            (item) => item.id === id,
          )?.businessLine;
        expect(await listed(plain.id)).toBeNull();
        expect(await listed(cream.id)).toBe("aesthetics");

        const edit = (extra: { businessLine?: "studio" | null }) =>
          repository.updateProduct(
            clinicId,
            OWNER_ID,
            cream.id,
            productUpdateSchema.parse({
              name: cream.name,
              costInCents: 1_000,
              salePriceInCents: 2_500,
              ...extra,
            }),
          );
        expect((await edit({}))?.businessLine).toBe("aesthetics");
        expect(await listed(cream.id)).toBe("aesthetics");
        expect((await edit({ businessLine: "studio" }))?.businessLine).toBe(
          "studio",
        );
        expect(await listed(cream.id)).toBe("studio");
        expect((await edit({ businessLine: null }))?.businessLine).toBeNull();
        expect(await listed(cream.id)).toBeNull();
        expect((await edit({}))?.businessLine).toBeNull();
      });

      it("sales carry the services with the registry line and the product line; overdue receivables keep their origin", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Cliente das linhas ${randomUUID().slice(0, 6)}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
          }),
        );
        const studio = await repository.createService(clinicId, {
          name: `Pilates ${randomUUID().slice(0, 6)}`,
          durationMinutes: 50,
          priceInCents: 9_000,
          businessLine: "studio",
        });
        const laser = await repository.createService(clinicId, {
          name: `Laser ${randomUUID().slice(0, 6)}`,
          durationMinutes: 30,
          priceInCents: 15_000,
          businessLine: "aesthetics",
        });
        const massage = await repository.createService(clinicId, {
          name: `Massagem ${randomUUID().slice(0, 6)}`,
          durationMinutes: 60,
          priceInCents: 12_000,
        });

        // Comanda antiga com atendimento (serviço sem classificação) e produto de Estética,
        // a receber com vencimento passado (vencida).
        const cream = await product(`Creme ${randomUUID().slice(0, 6)}`, {
          businessLine: "aesthetics",
        });
        const band = await product(`Faixa ${randomUUID().slice(0, 6)}`);
        const tab = await repository.openPatientTab(clinicId, OWNER_ID, {
          patientId: patient.id,
        });
        await addLegacyTabService(
          repository,
          pool,
          clinicId,
          tab.id,
          {
            professionalId,
            roomId,
            serviceId: massage.id,
            startsAt: "2040-06-20T13:00:00.000Z",
            visitType: "regular",
            notes: "",
          },
          12_000,
        );
        await repository.addPatientTabItem(clinicId, OWNER_ID, tab.id, {
          productId: cream.id,
          quantity: 1,
        });
        await repository.closePatientTab(clinicId, OWNER_ID, tab.id, {
          settlement: "receivable",
          dueDate: "2020-01-10",
        });
        const productSale = await repository.createProductSale(
          clinicId,
          OWNER_ID,
          {
            patientId: patient.id,
            items: [{ productId: band.id, quantity: 1 }],
            settlement: "receivable",
            dueDate: "2020-01-15",
          },
        );

        const template = await repository.createPlanTemplate(
          clinicId,
          OWNER_ID,
          planTemplateInputSchema.parse({
            name: "Combo das linhas",
            totalValueInCents: 40_000,
            services: [
              {
                serviceId: studio.id,
                totalSessions: 4,
                totalValueInCents: 25_000,
              },
              {
                serviceId: laser.id,
                totalSessions: 2,
                totalValueInCents: 15_000,
              },
            ],
          }),
        );
        const plan = await repository.createPatientPlan(clinicId, OWNER_ID, {
          planTemplateId: template.id,
          patientId: patient.id,
          name: template.name,
          kind: "fixed_package",
          services: template.services,
          validFrom: "2020-01-01",
          totalValueInCents: 40_000,
          installments: 2,
          firstDueDate: "2020-01-10",
        });

        // Serviço inativo continua com a linha (e o nome) do cadastro.
        await repository.updateAdministrativeRegistry(
          clinicId,
          OWNER_ID,
          laser.id,
          {
            kind: "service",
            data: {
              name: laser.name,
              durationMinutes: 30,
              priceInCents: 15_000,
              active: false,
            },
          },
        );

        const today = saoPauloToday();
        const report = await repository.getSalesPeriodReport(
          clinicId,
          today,
          today,
        );
        const mine = report.sales.filter(
          (item) => item.patientId === patient.id && item.kind === "sale",
        );
        const planSale = mine.find((item) => item.sourceType === "plan");
        expect(planSale?.services).toEqual([
          { id: studio.id, name: studio.name, businessLine: "studio" },
          { id: laser.id, name: laser.name, businessLine: "aesthetics" },
        ]);
        expect(planSale).not.toHaveProperty("businessLine");
        // O valor do plano não se divide entre os serviços.
        expect(planSale?.amountInCents).toBe(40_000);
        const serviceSale = mine.find((item) => item.sourceType === "service");
        expect(serviceSale?.services).toEqual([
          { id: massage.id, name: massage.name, businessLine: null },
        ]);
        expect(serviceSale).not.toHaveProperty("businessLine");
        const products = mine
          .filter((item) => item.sourceType === "product")
          .map((item) => ({
            itemName: item.itemName,
            services: item.services,
            businessLine: item.businessLine,
          }))
          .sort((left, right) => left.itemName.localeCompare(right.itemName));
        expect(products).toEqual(
          [
            { itemName: cream.name, services: [], businessLine: "aesthetics" },
            { itemName: band.name, services: [], businessLine: null },
          ].sort((left, right) => left.itemName.localeCompare(right.itemName)),
        );
        // O histórico do cliente usa as mesmas vendas.
        expect(
          (await repository.listPatientSales(clinicId, patient.id))
            ?.find((item) => item.id === planSale?.id)
            ?.services.map((item) => item.businessLine),
        ).toEqual(["studio", "aesthetics"]);

        // A origem das parcelas que a API externa usa em /overdue.
        const receivables = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.filter((item) => item.patientId === patient.id);
        expect(
          receivables
            .filter((item) => item.planId === plan.id)[0]
            ?.services?.map((item) => item.id)
            .sort(),
        ).toEqual([studio.id, laser.id].sort());
        const inventory = await repository.getInventoryWorkspace(clinicId);
        const closed = inventory.tabs.find((item) => item.id === tab.id);
        expect(
          receivables.find((item) => item.id === closed?.receivableId)
            ?.services,
        ).toEqual([{ id: massage.id, name: massage.name }]);
        expect(closed?.items.map((item) => item.productId)).toEqual([cream.id]);
        const sold = inventory.tabs.find(
          (item) => item.id === productSale.id,
        );
        expect(sold?.receivableId).toBeTruthy();
        expect(sold?.items.map((item) => item.productId)).toEqual([band.id]);
      });

      it.skipIf(storage === "memory")(
        "rejects an unknown product line in the database",
        async () => {
          const created = await product(`Óleo ${randomUUID().slice(0, 6)}`);
          await expect(
            pool!.query(
              "UPDATE products SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
              ["dance", clinicId, created.id],
            ),
          ).rejects.toThrow();
          await pool!.query(
            "UPDATE products SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
            ["studio", clinicId, created.id],
          );
        },
      );
    },
  );
}
