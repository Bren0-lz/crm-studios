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

// Clientes sem retorno trazem tudo o que já contrataram, mesmo fora do período.
for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: histórico de contratações dos clientes sem retorno`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `contracted_${randomUUID().replaceAll("-", "")}`;

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

      it("lista os itens já contratados, sem repetir", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Sem retorno ${randomUUID()}`,
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
            initialStock: 5,
          }),
        );
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const appointment = await repository.createAppointment(clinicId, {
          patientId: patient.id,
          professionalId: professional!.id,
          roomId: room!.id,
          serviceId: service!.id,
          startsAt: "2020-01-01T14:00:00Z",
          visitType: "regular",
          notes: "",
        });
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        for (let sale = 0; sale < 2; sale += 1)
          await repository.createProductSale(clinicId, actorId, {
            patientId: patient.id,
            items: [{ productId: product.id, quantity: 1 }],
            settlement: "paid",
            paymentMethod: "card",
            dueDate: saoPauloToday(),
          });

        const report = await repository.getSalesPeriodReport(
          clinicId,
          "2020-01-02",
          "2020-01-02",
        );
        expect(
          report.patientsWithoutReturn.find(
            (item) => item.patientId === patient.id,
          )?.contracted,
        ).toEqual([{ sourceType: "product", itemName: product.name }]);
      });
    },
  );
}
