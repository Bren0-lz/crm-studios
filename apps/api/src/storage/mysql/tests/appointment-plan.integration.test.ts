import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  patientInputSchema,
  type AppointmentInput,
  type PatientPlanInput,
} from "@crm/contracts";
import { buildApp } from "../../../app.js";
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
    `${storage}: plano vinculado ao atendimento (AP2)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let day = 1;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("ap2");
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
            fullName: `AP2 ${randomUUID()}`,
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
          name: `AP2 ${randomUUID()}`,
          durationMinutes: 30,
        });
        const services = [
          { serviceId: service.id, totalSessions: 1, totalValueInCents: 5_000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          {
            name: `AP2 ${randomUUID()}`,
            totalValueInCents: 5_000,
            services,
          },
        );
        const planInput: PatientPlanInput = {
          patientId: patient.id,
          planTemplateId: template.id,
          name: template.name,
          kind: "fixed_package",
          services,
          totalValueInCents: 5_000,
          installments: 1,
          validFrom: "2020-01-01",
          validUntil: "2040-12-31",
          firstDueDate: "2020-01-01",
          autoRenew: false,
        };
        const start = `2021-02-${String(day++).padStart(2, "0")}T12:00:00.000Z`;
        const input: AppointmentInput = {
          patientId: patient.id,
          professionalId: professional!.id,
          roomId: room!.id,
          serviceId: service.id,
          startsAt: start,
          visitType: "regular",
        };
        const balance = async (id: string) =>
          (await repository.listPatientPlans(clinicId, patient.id)).find(
            (p) => p.id === id,
          )!.remainingSessions;
        return { patient, planInput, input, balance };
      }

      it("compra vincula o plano novo e não consome outro plano com vencimento anterior", async () => {
        const { planInput, input, balance } = await fixture();
        const earlier = await repository.createPatientPlan(clinicId, actorId, {
          ...planInput,
          validUntil: "2039-01-01",
        });
        const purchase = {
          idempotencyKey: randomUUID(),
          plan: planInput,
          appointments: [input],
        };
        const sale = await repository.purchasePatientPlan(
          clinicId,
          actorId,
          purchase,
        );
        const appointment = sale.appointments[0]!;
        expect(appointment.planId).toBe(sale.plan.id);
        expect(
          (await repository.purchasePatientPlan(clinicId, actorId, purchase))
            .appointments[0]!.planId,
        ).toBe(sale.plan.id);
        expect(
          (
            await repository.listAppointments(
              clinicId,
              input.startsAt,
              "2021-03-01T00:00:00Z",
            )
          ).find((a) => a.id === appointment.id)?.planId,
        ).toBe(sale.plan.id);
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        expect(await balance(sale.plan.id)).toBe(0);
        expect(await balance(earlier.id)).toBe(1);
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "confirmed",
        );
        expect(await balance(sale.plan.id)).toBe(1);
        await repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        );
        expect(await balance(sale.plan.id)).toBe(0);
        const second = await repository.createAppointment(clinicId, {
          ...input,
          startsAt: input.startsAt.replace("12:00", "13:00"),
          planId: sale.plan.id,
        });
        await expect(
          repository.updateAppointmentStatus(clinicId, second.id, "completed"),
        ).rejects.toMatchObject({ code: "NO_SESSION_BALANCE" });
        expect(await balance(earlier.id)).toBe(1);
        await repository.autoFinalizeAppointments(
          clinicId,
          "2021-03-01T00:00:00Z",
          "2021-03-02T00:00:00Z",
        );
        expect(
          (
            await repository.listAppointments(
              clinicId,
              input.startsAt,
              "2021-03-01T00:00:00Z",
            )
          ).find((a) => a.id === second.id)?.status,
        ).toBe("scheduled");
      });

      it("experimental nunca consome sessão, manualmente ou na finalização automática", async () => {
        const { planInput, input, balance } = await fixture();
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        for (const [index, auto] of [false, true].entries()) {
          const trial = await repository.createAppointment(clinicId, {
            ...input,
            startsAt: input.startsAt.replace("12:00", `${12 + index}:00`),
            visitType: "trial",
            planId: plan.id,
          });
          expect(trial).not.toHaveProperty("planId");
          if (auto)
            await repository.autoFinalizeAppointments(
              clinicId,
              "2021-03-01T00:00:00Z",
              "2021-03-02T00:00:00Z",
            );
          else
            await repository.updateAppointmentStatus(
              clinicId,
              trial.id,
              "completed",
            );
          expect(await balance(plan.id)).toBe(1);
          expect(
            (
              await repository.listAppointments(
                clinicId,
                trial.startsAt,
                "2021-03-01T00:00:00Z",
              )
            ).find((a) => a.id === trial.id)?.status,
          ).toBe("completed");
        }
      });

      it("recorrência e reposição preservam o vínculo", async () => {
        const { planInput, input } = await fixture();
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        const series = await repository.createRecurringAppointments(clinicId, {
          ...input,
          planId: plan.id,
          occurrences: 2,
          intervalWeeks: 1,
        });
        expect(series.map((a) => a.planId)).toEqual([plan.id, plan.id]);
        await repository.updateAppointmentStatus(
          clinicId,
          series[0]!.id,
          "excused_absence",
        );
        const successor = await repository.createAbsenceSuccessor(
          clinicId,
          actorId,
          series[0]!.id,
          {
            professionalId: input.professionalId,
            roomId: input.roomId,
            startsAt: input.startsAt.replace("12:00", "14:00"),
          },
        );
        expect(successor.planId).toBe(plan.id);
      });

      it("sem vínculo mantém a escolha histórica de plano", async () => {
        const { planInput, input, balance } = await fixture();
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        const legacy = await repository.createAppointment(clinicId, input);
        expect(legacy).not.toHaveProperty("planId");
        await repository.updateAppointmentStatus(
          clinicId,
          legacy.id,
          "completed",
        );
        expect(await balance(plan.id)).toBe(0);
      });

      it("a API aceita e devolve o vínculo opcional", async () => {
        const { planInput, input } = await fixture();
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        const app = await buildApp({ repository, logger: false });
        try {
          const headers = {
            authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
          };
          const response = await app.inject({
            method: "POST",
            url: "/appointments",
            headers,
            payload: { ...input, planId: plan.id },
          });
          expect(response.statusCode, response.body).toBe(201);
          expect(response.json()).toHaveProperty("planId", plan.id);
        } finally {
          await app.close();
        }
      });

      it("não vincula plano inexistente, de outro cliente ou de outro serviço", async () => {
        const { planInput, input } = await fixture();
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        const foreign = await fixture();
        for (const data of [
          { ...input, planId: randomUUID() },
          { ...foreign.input, planId: plan.id },
          { ...input, serviceId: foreign.input.serviceId, planId: plan.id },
        ]) {
          await expect(
            repository.createAppointment(clinicId, data),
          ).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
        }
      });
    },
  );
}
