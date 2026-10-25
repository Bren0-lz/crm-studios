import { leadInputSchema } from "@crm/contracts";
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
    `${storage}: finalização automática`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `autofinal_${randomUUID().replaceAll("-", "")}`;

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

      it("keeps the defaults, then saves the clinic settings", async () => {
        expect(await repository.getAutoFinalizationSettings(clinicId)).toEqual({
          enabled: false,
          delayMinutes: 60,
        });
        const saved = await repository.updateAutoFinalizationSettings(
          clinicId,
          actorId,
          { enabled: true, delayMinutes: 120 },
        );
        expect(saved).toMatchObject({ enabled: true, delayMinutes: 120 });
        expect(saved.updatedAt).toBeDefined();
        expect(
          await repository.getAutoFinalizationSettings(clinicId),
        ).toMatchObject({ enabled: true, delayMinutes: 120 });
      });

      it("finalizes open appointments that ended before the cutoff", async () => {
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        // Lead não tem plano: a finalização não depende de saldo de sessões.
        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead finalização automática",
            phone: "11988887777",
            source: "Indicação",
            interest: "Pilates",
          }),
        );
        const book = async (startsAt: string) =>
          (await repository.createLeadAppointment(clinicId, lead.id, {
            professionalId: professional!.id,
            roomId: room!.id,
            serviceId: service!.id,
            startsAt,
            notes: "",
            visitType: "trial",
          }))!;
        const due = await book("2099-03-02T13:00:00Z");
        const later = await book("2099-03-04T13:00:00Z");
        await repository.autoFinalizeAppointments(
          clinicId,
          "2099-03-03T00:00:00.000Z",
          "2099-03-03T00:05:00.000Z",
        );
        expect(
          await repository.findAppointment(clinicId, due.id),
        ).toMatchObject({
          status: "completed",
          autoCompletedAt: "2099-03-03T00:05:00.000Z",
        });
        expect(
          (await repository.findAppointment(clinicId, later.id))?.status,
        ).toBe("scheduled");

        // Desfecho registrado pela equipe apaga a marca automática.
        const changed = await repository.updateAppointmentStatus(
          clinicId,
          due.id,
          "cancelled",
        );
        expect(changed?.autoCompletedAt).toBeUndefined();
      });
    },
  );
}
