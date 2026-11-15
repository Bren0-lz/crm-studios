import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { patientInputSchema } from "@crm/contracts";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: "Realizado" depois da finalização automática (RE8)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let day = 1;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("re8");
          repository = new MysqlClinicRepository(database.pool);
        }
      }, 60_000);
      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function fixture() {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `RE8 ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
        const [professional] = await repository.listProfessionals(clinicId);
        const [room] = await repository.listRooms(clinicId);
        const service = await repository.createService(clinicId, {
          name: `RE8 ${randomUUID()}`,
          durationMinutes: 30,
        });
        const services = [
          { serviceId: service.id, totalSessions: 3, totalValueInCents: 9_000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          { name: `RE8 ${randomUUID()}`, totalValueInCents: 9_000, services },
        );
        const plan = await repository.createPatientPlan(clinicId, actorId, {
          patientId: patient.id,
          planTemplateId: template.id,
          name: template.name,
          kind: "fixed_package",
          services,
          totalValueInCents: 9_000,
          installments: 1,
          validFrom: "2020-01-01",
          validUntil: "2040-12-31",
          firstDueDate: "2020-01-01",
          autoRenew: false,
        });
        const dayOfMonth = String(day++).padStart(2, "0");
        const book = (hour: number) =>
          repository.createAppointment(clinicId, {
            patientId: patient.id,
            professionalId: professional!.id,
            roomId: room!.id,
            serviceId: service.id,
            startsAt: `2021-04-${dayOfMonth}T${hour}:00:00.000Z`,
            visitType: "regular",
            planId: plan.id,
          });
        const balance = async () =>
          (await repository.listPatientPlans(clinicId, patient.id)).find(
            (item) => item.id === plan.id,
          )!.remainingSessions;
        return { book, balance };
      }

      it("recusa o Realizado de atendimento já finalizado sozinho, sem baixar saldo de novo", async () => {
        const { book, balance } = await fixture();
        const appointment = await book(12);
        await repository.autoFinalizeAppointments(
          clinicId,
          "2021-05-01T00:00:00.000Z",
          "2021-05-01T00:05:00.000Z",
        );
        expect(await balance()).toBe(2);

        const error = await repository
          .updateAppointmentStatus(clinicId, appointment.id, "completed")
          .catch((cause: unknown) => cause);
        expect(error).toMatchObject({
          code: "APPOINTMENT_ALREADY_AUTO_COMPLETED",
          statusCode: 409,
          message: "Este atendimento já foi finalizado automaticamente.",
          details: {
            appointment: {
              id: appointment.id,
              status: "completed",
              autoCompletedAt: "2021-05-01T00:05:00.000Z",
            },
          },
        });
        expect(await balance()).toBe(2);
        // O selo de quem foi de fato finalizado sozinho continua.
        expect(
          await repository.findAppointment(clinicId, appointment.id),
        ).toMatchObject({
          status: "completed",
          autoCompletedAt: "2021-05-01T00:05:00.000Z",
        });
      });

      it("mantém idempotente o Realizado repetido de atendimento finalizado pela equipe", async () => {
        const { book, balance } = await fixture();
        const appointment = await book(13);
        const first = await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        const again = await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        expect(first?.status).toBe("completed");
        expect(again?.status).toBe("completed");
        expect(again?.autoCompletedAt).toBeUndefined();
        expect(await balance()).toBe(2);
      });
    },
  );
}
