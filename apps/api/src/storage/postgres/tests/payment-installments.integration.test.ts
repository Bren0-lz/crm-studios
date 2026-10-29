import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: parcelamento por forma de pagamento`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `installments_${randomUUID().replaceAll("-", "")}`;

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
        const paid = await repository.settleReceivable(
          clinicId,
          actorId,
          receivables[0]!.id,
          "card",
          undefined,
          { paymentInstallments: 3 },
        );
        expect(paid).toMatchObject({ status: "paid", paymentInstallments: 3 });
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
        const reversed = await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          receivables[0]!.id,
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
