import { nextTestCpf } from "../../../test-support/cpf.js";
import { patientInputSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

// Aula experimental é gratuita: realizada, não entra na produção da equipe (valor gerado).
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: produção da equipe sem aula experimental`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("teamtrial");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("leaves completed trial classes out of the team production", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Cliente experimental ${randomUUID().slice(0, 6)}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
          }),
        );
        const service = await repository.createService(clinicId, {
          name: `Pilates ${randomUUID().slice(0, 6)}`,
          durationMinutes: 50,
        });
        const trial = await repository.createAppointment(clinicId, {
          patientId: patient.id,
          professionalId,
          roomId,
          serviceId: service.id,
          startsAt: "2021-03-10T13:00:00.000Z",
          visitType: "trial",
          notes: "",
        });
        await repository.updateAppointmentStatus(
          clinicId,
          trial.id,
          "completed",
        );

        const production = await repository.listTeamProduction(
          clinicId,
          "2021-03-01",
          "2021-03-31",
        );
        expect(
          production.sessions.filter((item) => item.serviceId === service.id),
        ).toEqual([]);
      });
    },
  );
}
