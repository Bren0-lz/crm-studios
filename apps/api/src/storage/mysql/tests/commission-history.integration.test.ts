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

/** "Comissão gerada" no Histórico mostra quem usou "Calcular comissões". */
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: histórico da comissão gerada`,
    () => {
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("commissionhistory");
        pool = database.pool;
      }, 60_000);

      afterAll(async () => {
        await database?.drop();
      });

      const repository = (): ClinicRepository =>
        storage === "memory"
          ? new MemoryClinicRepository()
          : new MysqlClinicRepository(pool!);

      async function completedAppointment(repo: ClinicRepository) {
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
          patient = await repo.createPatient(clinic, {
            cpf: nextTestCpf(),
            fullName: "Cliente do histórico da comissão",
            phone: "11988887777",
            tags: [],
          });
        await repo.createCommissionRule(clinic, {
          professionalId: professional.id,
          percentage: 10,
          effectiveFrom: "2025-01-01",
        });
        const appointment = await repo.createAppointment(clinic, {
          patientId: patient.id,
          professionalId: professional.id,
          roomId: room.id,
          serviceId: service.id,
          startsAt: "2025-05-08T13:00:00Z",
          visitType: "regular",
          notes: "",
        });
        await sellSessionForAppointment(repo, clinic, owner, appointment, 9000);
        await repo.updateAppointmentStatus(clinic, appointment.id, "completed");
        return appointment;
      }

      async function historyOf(repo: ClinicRepository, commissionId: string) {
        const page = await repo.listAdminAuditPage(clinic, undefined, {
          action: "commission.created",
        });
        return page.items.find((event) => event.entityId === commissionId);
      }

      it("registra quem calculou as comissões", async () => {
        const repo = repository();
        const appointment = await completedAppointment(repo);
        const commission = (
          await repo.generateCommissions(clinic, "2025-05", owner)
        ).find((item) => item.appointmentId === appointment.id);
        expect(commission).toBeDefined();
        const event = await historyOf(repo, commission!.id);
        expect(event).toMatchObject({
          action: "commission.created",
          description: "Comissão gerada",
          actorUserId: owner,
          actorName: "Aryana Dutra",
        });
        // Calcular de novo não troca o autor das comissões já geradas.
        await repo.generateCommissions(clinic, "2025-05");
        expect(await historyOf(repo, commission!.id)).toMatchObject({
          actorUserId: owner,
        });
      });
    },
  );
}
