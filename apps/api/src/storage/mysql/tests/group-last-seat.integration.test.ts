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
              emergencyContactWhatsapp: "11988887777",
            }),
          );
        const [first, second] = await Promise.all([
          createPatient("Primeira"),
          createPatient("Segunda"),
        ]);
        const [professional] = await repository.listProfessionals(clinicId),
          rooms = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const room = rooms.find((item) => item.capacity >= 2)!;
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
        expect(enrollments.map((item) => item.status).sort()).toEqual([
          "active",
          "waitlisted",
        ]);
        expect(
          enrollments.find((item) => item.status === "waitlisted"),
        ).toMatchObject({ queuePosition: 1 });
        const active = enrollments.find((item) => item.status === "active")!;
        const waiting = enrollments.find(
          (item) => item.status === "waitlisted",
        )!;
        await expect(
          repository.confirmGroupEnrollment(clinicId, waiting.id),
        ).rejects.toMatchObject({ code: "GROUP_FULL" });
        await repository.cancelGroupEnrollment(clinicId, active.id);
        const workspace = await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-01-02T00:00:00Z",
        );
        expect(
          workspace.enrollments.find((item) => item.id === waiting.id)?.status,
        ).toBe("waitlisted");
        expect(
          workspace.groups.find((item) => item.id === group.id),
        ).toMatchObject({ activeEnrollments: 0, waitlistCount: 1 });
        const third = await createPatient("Terceira");
        // O aumento de capacidade também mantém a fila, sem promover ninguém.
        await repository.updateGroupClass(clinicId, group.id, {
          capacity: 2,
          weeklySlots: group.weeklySlots,
        });
        const afterIncrease = await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-01-02T00:00:00Z",
        );
        expect(
          afterIncrease.enrollments.find((item) => item.id === waiting.id)
            ?.status,
        ).toBe("waitlisted");
        await repository.createGroupEnrollment(clinicId, {
          groupId: group.id,
          patientId: third.id,
        });
        const fourth = await createPatient("Quarta");
        await repository.createGroupEnrollment(clinicId, {
          groupId: group.id,
          patientId: fourth.id,
        });
        const fifth = await createPatient("Quinta");
        const otherWaiting = await repository.createGroupEnrollment(clinicId, {
          groupId: group.id,
          patientId: fifth.id,
        });
        const current = await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-01-02T00:00:00Z",
        );
        const toCancel = current.enrollments.find(
          (item) => item.groupId === group.id && item.status === "active",
        )!;
        await repository.cancelGroupEnrollment(clinicId, toCancel.id);
        const results = await Promise.allSettled(
          [waiting, otherWaiting].map((item) =>
            repository.confirmGroupEnrollment(clinicId, item.id),
          ),
        );
        expect(
          results.filter((item) => item.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          results.filter((item) => item.status === "rejected"),
        ).toHaveLength(1);
        const beforeContact = await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-01-02T00:00:00Z",
        );
        const stillWaiting = beforeContact.enrollments.find(
          (item) => item.groupId === group.id && item.status === "waitlisted",
        )!;
        const leaving = beforeContact.enrollments.find(
          (item) => item.groupId === group.id && item.status === "active",
        )!;
        const contactRace = await Promise.allSettled([
          repository.cancelGroupEnrollment(clinicId, leaving.id),
          repository.confirmGroupEnrollment(clinicId, stillWaiting.id),
        ]);
        for (const result of contactRace) {
          if (result.status === "rejected")
            expect(result.reason).toMatchObject({ code: "GROUP_FULL" });
        }
        const afterContact = await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-01-02T00:00:00Z",
        );
        expect(
          afterContact.groups.find((item) => item.id === group.id)!
            .activeEnrollments,
        ).toBeLessThanOrEqual(2);
      });
    },
  );
}
