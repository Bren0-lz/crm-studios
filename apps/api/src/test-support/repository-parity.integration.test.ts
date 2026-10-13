import {
  appointmentInputSchema,
  guidedPatientInputSchema,
  patientInputSchema,
  patientPlanInputSchema,
  planTemplateInputSchema,
  saoPauloToday,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../database.js";
import { databaseConnectionConfig } from "../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../memory-repository.js";
import { PostgresClinicRepository } from "../postgres-repository.js";
import type { ClinicRepository } from "../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const serviceId = "77777777-7777-4777-8777-777777777777";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage} repository parity`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `parity_${randomUUID().replaceAll("-", "")}`;

      beforeAll(async () => {
        if (storage === "memory") return;
        const connection = databaseConnectionConfig({
          url: process.env.TEST_DATABASE_URL!,
          ssl: "auto",
        });
        adminPool = new Pool(connection);
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        // Own migration registry prevents falling through to the public schema's registry.
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
        if (storage === "memory")
          repository = new MemoryClinicRepository(false);
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

      async function patient(name: string) {
        return repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            fullName: `${name} ${randomUUID()}`,
            phone: "11988887777",
          }),
        );
      }
      async function plan(patientId: string) {
        const services = [
          { serviceId, totalSessions: 4, totalValueInCents: 20000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: `Parity ${randomUUID()}`,
            totalValueInCents: 20000,
            services,
          }),
        );
        return repository.createPatientPlan(
          clinicId,
          actorId,
          patientPlanInputSchema.parse({
            patientId,
            planTemplateId: template.id,
            name: template.name,
            kind: "fixed_package",
            services,
            totalValueInCents: 20000,
            installments: 1,
            validFrom: "2055-01-01",
            validUntil: "2055-12-31",
            firstDueDate: "2055-01-01",
          }),
        );
      }

      it("persists and finds a patient without exposing the record to another clinic", async () => {
        const created = await patient("Parity Cliente");
        expect(
          await repository.listPatients(clinicId, created.fullName),
        ).toEqual([expect.objectContaining({ id: created.id })]);
        expect(
          await repository.listPatients(randomUUID(), created.fullName),
        ).toEqual([]);
        expect(
          await repository.updatePatient(
            randomUUID(),
            created.id,
            patientInputSchema.parse({
              fullName: "Alteração indevida",
              phone: "11988887777",
            }),
          ),
        ).toBeNull();
      });

      it("rejects an overlapping appointment without persisting a second record", async () => {
        const created = await patient("Parity Agenda");
        const input = appointmentInputSchema.parse({
          patientId: created.id,
          professionalId,
          roomId,
          serviceId,
          startsAt: "2055-01-03T12:00:00Z",
        });
        await repository.createAppointment(clinicId, input);
        await expect(
          repository.createAppointment(clinicId, {
            ...input,
            startsAt: "2055-01-03T12:15:00Z",
          }),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(
          (
            await repository.listAppointments(
              clinicId,
              "2055-01-03T00:00:00Z",
              "2055-01-04T00:00:00Z",
            )
          ).filter((item) => item.patientId === created.id),
        ).toHaveLength(1);
      });

      it("consumes and reverses one session when completion is repeated or reopened", async () => {
        const created = await patient("Parity Sessão");
        const sold = await plan(created.id);
        const appointment = await repository.createAppointment(
          clinicId,
          appointmentInputSchema.parse({
            patientId: created.id,
            professionalId,
            roomId,
            serviceId,
            startsAt: "2055-01-04T12:00:00Z",
          }),
        );
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]
            ?.remainingSessions,
        ).toBe(3);
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "confirmed",
        );
        expect(
          (await repository.listPatientPlans(clinicId, created.id))[0]
            ?.remainingSessions,
        ).toBe(4);
        const movements = await repository.listSessionMovements(
          clinicId,
          sold.id,
        );
        expect(
          movements
            .filter((item) => item.appointmentId === appointment.id)
            .map((item) => item.quantity)
            .sort(),
        ).toEqual([-1, 1]);
      });

      it("rejects duplicate payments and reversals while preserving the cash movements", async () => {
        const created = await patient("Parity Pagamento");
        await plan(created.id);
        const receivable = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.find((item) => item.patientId === created.id)!;
        await repository.settleReceivable(
          clinicId,
          actorId,
          receivable.id,
          "pix",
        );
        await expect(
          repository.settleReceivable(clinicId, actorId, receivable.id, "pix"),
        ).rejects.toMatchObject({ code: "RECEIVABLE_NOT_OPEN" });
        await repository.reverseReceivablePayment(
          clinicId,
          actorId,
          receivable.id,
        );
        await expect(
          repository.reverseReceivablePayment(clinicId, actorId, receivable.id),
        ).rejects.toMatchObject({ code: "RECEIVABLE_NOT_PAID" });
        const movements = (
          await repository.getDailyCash(clinicId, saoPauloToday())
        ).movements.filter((item) => item.counterpart === created.fullName);
        expect(movements).toHaveLength(2);
        expect(
          movements.reduce((sum, item) => sum + item.amountInCents, 0),
        ).toBe(0);
      });

      it("rolls back a guided registration when the subsequent plan cannot be created", async () => {
        const name = `Parity Rollback ${randomUUID()}`;
        const input = guidedPatientInputSchema.parse({
          next: "plan",
          patient: { fullName: name, phone: "11988887777" },
          plan: {
            planTemplateId: randomUUID(),
            name: "Plano inexistente",
            kind: "fixed_package",
            services: [
              { serviceId, totalSessions: 4, totalValueInCents: 20000 },
            ],
            totalValueInCents: 20000,
            installments: 1,
            validFrom: "2055-01-01",
            firstDueDate: "2055-01-01",
          },
        });
        await expect(
          repository.createPatientWithNextStep(clinicId, actorId, input),
        ).rejects.toBeInstanceOf(Error);
        expect(await repository.listPatients(clinicId, name)).toEqual([]);
      });
    },
  );
}
