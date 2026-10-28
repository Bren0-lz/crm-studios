import { leadInputSchema } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: finalização automática`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("autofinaliza");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
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
