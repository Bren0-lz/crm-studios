import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { sellSessionForAppointment } from "../../../test-support/commission-billing.js";
import { nextTestCpf } from "../../../test-support/cpf.js";

const clinic = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";

/**
 * RF1: "Plano contratado", "Cliente matriculado em turma" e "Saldo de sessões alterado"
 * mostram quem fez a ação; registros sem autor seguem "Responsável não registrado".
 */
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: histórico de plano, matrícula e saldo com responsável`,
    () => {
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("planhistory");
        pool = database.pool;
      }, 60_000);

      afterAll(async () => {
        await database?.drop();
      });

      const repository = (): ClinicRepository =>
        storage === "memory"
          ? new MemoryClinicRepository()
          : new MysqlClinicRepository(pool!);

      const createPatient = (repo: ClinicRepository, name: string) =>
        repo.createPatient(clinic, {
          cpf: nextTestCpf(),
          fullName: `${name} ${randomUUID().slice(0, 6)}`,
          phone: "11988887777",
          tags: [],
        });

      async function historyEvent(
        repo: ClinicRepository,
        action: string,
        entityId: string,
      ) {
        const page = await repo.listAdminAuditPage(clinic, undefined, {
          action,
        });
        return page.items.find((event) => event.entityId === entityId);
      }

      it("registra quem contratou o plano e quem movimentou o saldo", async () => {
        const repo = repository();
        const professional = await repo.createProfessional(clinic, {
            fullName: `Profissional do histórico ${randomUUID().slice(0, 6)}`,
            crefito: randomUUID().slice(0, 12),
            specialty: "Pilates",
            color: "#547A6B",
          }),
          room = await repo.createRoom(clinic, {
            name: `Sala ${randomUUID().slice(0, 8)}`,
            capacity: 1,
          }),
          service = await repo.createService(clinic, {
            name: `Pilates ${randomUUID().slice(0, 8)}`,
            durationMinutes: 50,
          }),
          patient = await createPatient(repo, "Cliente do histórico do plano");
        const appointment = await repo.createAppointment(clinic, {
          patientId: patient.id,
          professionalId: professional.id,
          roomId: room.id,
          serviceId: service.id,
          startsAt: "2025-05-08T13:00:00Z",
          visitType: "regular",
          notes: "",
        });
        const plan = await sellSessionForAppointment(
          repo,
          clinic,
          owner,
          appointment,
          9000,
        );
        expect(await historyEvent(repo, "plan.created", plan.id)).toMatchObject(
          {
            description: "Plano contratado",
            actorUserId: owner,
            actorName: "Aryana Dutra",
          },
        );

        await repo.updateAppointmentStatus(
          clinic,
          appointment.id,
          "completed",
          undefined,
          owner,
        );
        await repo.updateAppointmentStatus(
          clinic,
          appointment.id,
          "scheduled",
          undefined,
          owner,
        );
        const movements = await repo.listSessionMovements(clinic, plan.id);
        expect(movements.map((item) => item.kind).sort()).toEqual([
          "consumption",
          "credit",
          "reversal",
        ]);
        for (const movement of movements)
          expect(
            await historyEvent(repo, "session.movement", movement.id),
          ).toMatchObject({
            description: "Saldo de sessões alterado",
            actorUserId: owner,
            actorName: "Aryana Dutra",
          });
      });

      it("registra quem matriculou na turma e quem confirmou a vaga da espera", async () => {
        const repo = repository();
        const [professional] = await repo.listProfessionals(clinic),
          rooms = await repo.listRooms(clinic),
          [service] = await repo.listServices(clinic);
        const room = rooms.find((item) => item.capacity >= 2)!;
        const group = await repo.createGroupClass(clinic, {
          serviceId: service!.id,
          professionalId: professional!.id,
          roomId: room.id,
          capacity: 1,
          weeklySlots: [{ weekday: 0, startTime: "21:30", endTime: "22:30" }],
        });
        const first = await createPatient(repo, "Primeira da turma"),
          second = await createPatient(repo, "Segunda da turma");
        const active = await repo.createGroupEnrollment(
          clinic,
          { groupId: group.id, patientId: first.id },
          owner,
        );
        expect(active.status).toBe("active");
        expect(
          await historyEvent(repo, "group.enrolled", active.id),
        ).toMatchObject({
          description: "Cliente matriculado em turma",
          actorUserId: owner,
          actorName: "Aryana Dutra",
        });

        // Sem autor (como os registros antigos): segue sem responsável.
        const waiting = await repo.createGroupEnrollment(clinic, {
          groupId: group.id,
          patientId: second.id,
        });
        expect(waiting.status).toBe("waitlisted");
        const withoutActor = await historyEvent(
          repo,
          "group.enrolled",
          waiting.id,
        );
        expect(withoutActor).toBeDefined();
        expect(withoutActor?.actorUserId).toBeUndefined();

        // "Cliente aceitou" na Lista de espera: a confirmação é a matrícula.
        await repo.cancelGroupEnrollment(clinic, active.id);
        await repo.confirmGroupEnrollment(clinic, waiting.id, owner);
        expect(
          await historyEvent(repo, "group.enrolled", waiting.id),
        ).toMatchObject({ actorUserId: owner, actorName: "Aryana Dutra" });
      });
    },
  );
}
