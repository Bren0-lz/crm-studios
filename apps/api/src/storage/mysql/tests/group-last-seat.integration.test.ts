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

// Turma cheia (TW1): a última vaga fica com uma só matrícula; a outra vai para a espera.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: última vaga da turma`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("lastseat");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("keeps one concurrent enrollment active and waitlists the other", async () => {
        const createPatient = (name: string) =>
          repository.createPatient(
            clinicId,
            patientInputSchema.parse({
              cpf: nextTestCpf(),
              fullName: `${name} ${randomUUID().slice(0, 8)}`,
              phone: "11988887777",
              whatsapp: "11988887777",
              emergencyContactName: "Contato de Emergência",
              emergencyContactPhone: "11988887777",
            }),
          );
        const [first, second] = await Promise.all([
          createPatient("Primeira"),
          createPatient("Segunda"),
        ]);
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        // Domingo à noite, fora dos atendimentos demo.
        const group = await repository.createGroupClass(clinicId, {
          serviceId: service!.id,
          professionalId: professional!.id,
          roomId: room!.id,
          capacity: 1,
          weeklySlots: [{ weekday: 0, startTime: "21:00", endTime: "22:00" }],
        });

        const enrollments = await Promise.all(
          [first!, second!].map((patient) =>
            repository.createGroupEnrollment(clinicId, {
              groupId: group.id,
              patientId: patient.id,
            }),
          ),
        );
        expect(
          enrollments.map((item) => item.status).sort(),
        ).toEqual(["active", "waitlisted"]);
        expect(
          enrollments.find((item) => item.status === "waitlisted"),
        ).toMatchObject({ queuePosition: 1 });
      });
    },
  );
}
