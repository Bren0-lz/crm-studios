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
  otherClinicId = "99999999-9999-4999-8999-999999999999";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: conflitos de horários planejados`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("agendaconflitos");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("reports booked and blocked times without writing anything", async () => {
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead conflitos de agenda",
            phone: "11988886666",
            source: "Indicação",
            interest: "Massoterapia",
          }),
        );
        await repository.createLeadAppointment(clinicId, lead.id, {
          professionalId: professional!.id,
          roomId: room!.id,
          serviceId: service!.id,
          startsAt: "2099-03-03T17:00:00.000Z",
          notes: "",
          visitType: "trial",
        });
        await repository.createScheduleBlock(clinicId, {
          professionalId: professional!.id,
          startsAt: "2099-03-10T16:00:00.000Z",
          endsAt: "2099-03-10T20:00:00.000Z",
          reason: "Curso",
        });
        const slot = (key: string, startsAt: string, endsAt: string) => ({
          key,
          professionalId: professional!.id,
          roomId: room!.id,
          startsAt,
          endsAt,
        });
        const slots = [
          slot("1", "2099-03-03T17:30:00.000Z", "2099-03-03T18:30:00.000Z"),
          slot("2", "2099-03-10T17:00:00.000Z", "2099-03-10T18:00:00.000Z"),
          slot("3", "2099-03-17T17:00:00.000Z", "2099-03-17T18:00:00.000Z"),
        ];
        const conflicts = await repository.findAgendaConflicts(clinicId, slots);
        expect(conflicts.map(({ key, kind }) => ({ key, kind }))).toEqual([
          { key: "1", kind: "appointment" },
          { key: "2", kind: "block" },
        ]);
        expect(
          await repository.findAgendaConflicts(otherClinicId, slots),
        ).toEqual([]);
      });
    },
  );
}
