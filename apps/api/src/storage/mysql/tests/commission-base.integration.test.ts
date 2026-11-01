import { randomUUID } from "node:crypto";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import { serviceWithSinglePlan } from "../../../test-support/single-plan-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// Serviço não tem preço: a comissão percentual usa a sessão do plano consumido; sem plano,
// a do plano avulso do serviço; sem nenhum, 0.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: base da comissão sem preço de serviço`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("commissionbase");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("usa a sessão do plano consumido, depois a do plano avulso e, sem nenhum, zero", async () => {
        const professional = await repository.createProfessional(clinicId, {
            fullName: `Profissional base ${randomUUID().slice(0, 6)}`,
            crefito: randomUUID().slice(0, 12),
            specialty: "Pilates",
            color: "#547A6B",
          }),
          room = await repository.createRoom(clinicId, {
            name: `Sala ${randomUUID().slice(0, 8)}`,
            capacity: 1,
          }),
          withSingle = await serviceWithSinglePlan(
            repository,
            clinicId,
            actorId,
            18000,
          ),
          withoutPlan = await repository.createService(clinicId, {
            name: `Sem plano ${randomUUID().slice(0, 8)}`,
            durationMinutes: 50,
            color: "#547A6B",
          });
        const patient = async (name: string) =>
          repository.createPatient(clinicId, {
            cpf: nextTestCpf(),
            fullName: name,
            phone: "11988887777",
            tags: [],
          });
        const subscriber = await patient("Cliente com pacote"),
          walkIn = await patient("Cliente avulso");
        const terms = {
          name: "Pacote base",
          totalValueInCents: 24000,
          kind: "custom" as const,
          services: [
            {
              serviceId: withSingle.id,
              totalSessions: 4,
              totalValueInCents: 24000,
            },
          ],
        };
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          { ...terms, planType: null },
        );
        await repository.createPatientPlan(clinicId, actorId, {
          ...terms,
          planTemplateId: template.id,
          patientId: subscriber.id,
          installments: 1,
          firstDueDate: "2025-03-01",
          validFrom: "2025-03-01",
          validUntil: "2025-12-31",
          autoRenew: false,
        });
        await repository.createCommissionRule(clinicId, {
          professionalId: professional.id,
          percentage: 10,
          effectiveFrom: "2025-01-01",
        });
        const completed = async (
          patientId: string,
          serviceId: string,
          day: string,
        ) => {
          const appointment = await repository.createAppointment(clinicId, {
            patientId,
            professionalId: professional.id,
            roomId: room.id,
            serviceId,
            startsAt: `2025-03-${day}T13:00:00Z`,
            visitType: "regular",
            notes: "",
          });
          await repository.updateAppointmentStatus(
            clinicId,
            appointment.id,
            "completed",
          );
          return appointment.id;
        };
        const fromPlan = await completed(subscriber.id, withSingle.id, "10"),
          fromSingle = await completed(walkIn.id, withSingle.id, "11"),
          noReference = await completed(walkIn.id, withoutPlan.id, "12");
        const generated = await repository.generateCommissions(
          clinicId,
          "2025-03",
        );
        const of = (appointmentId: string) =>
          generated.find((item) => item.appointmentId === appointmentId);
        expect(of(fromPlan)).toMatchObject({
          baseAmountInCents: 6000,
          amountInCents: 600,
        });
        expect(of(fromSingle)).toMatchObject({
          baseAmountInCents: 18000,
          amountInCents: 1800,
        });
        expect(of(noReference)).toMatchObject({
          baseAmountInCents: 0,
          amountInCents: 0,
        });
      });
    },
  );
}
