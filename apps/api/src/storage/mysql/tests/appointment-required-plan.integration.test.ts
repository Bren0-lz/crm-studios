import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  leadInputSchema,
  patientInputSchema,
  type AppointmentInput,
  type Appointment,
  type PatientPlanInput,
} from "@crm/contracts";
import { buildApp } from "../../../app.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { addLegacyTabService } from "../../../test-support/legacy-tab-service.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: API exige plano no agendamento (AP3)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let app: Awaited<ReturnType<typeof buildApp>>;
      let headers: { authorization: string };
      let day = 0;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("ap3");
          repository = new MysqlClinicRepository(database.pool);
        }
      }, 60_000);
      beforeEach(async () => {
        if (storage === "memory") repository = new MemoryClinicRepository();
        app = await buildApp({ repository, logger: false });
        headers = {
          authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
        };
      });
      afterEach(async () => {
        await app?.close();
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function fixture() {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `AP3 ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
            emergencyContactWhatsapp: "11988887777",
          }),
        );
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId);
        const service = await repository.createService(clinicId, {
          name: `AP3 ${randomUUID()}`,
          durationMinutes: 30,
        });
        const services = [
          { serviceId: service.id, totalSessions: 2, totalValueInCents: 5_000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          { name: `AP3 ${randomUUID()}`, totalValueInCents: 5_000, services },
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
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        const startsAt = new Date("2021-03-01T12:00:00.000Z");
        startsAt.setUTCDate(startsAt.getUTCDate() + day++ * 3);
        const input: AppointmentInput = {
          patientId: patient.id,
          serviceId: service.id,
          professionalId: professional!.id,
          roomId: room!.id,
          startsAt: startsAt.toISOString(),
          visitType: "regular",
          planId: plan.id,
        };
        return { patient, service, plan, planInput, input };
      }
      const post = (payload: Record<string, unknown>, url = "/appointments") =>
        app.inject({ method: "POST", url, headers, payload });
      async function rejected(
        payload: Record<string, unknown>,
        url = "/appointments",
      ) {
        const response = await post(payload, url);
        expect(response.statusCode, response.body).toBe(409);
        expect(response.json()).toMatchObject({ code: "PLAN_REQUIRED" });
      }

      it("recusa normal/avaliação sem planId, mesmo com plano elegível, e aceita experimental sem plano só fora do plano", async () => {
        const { input } = await fixture();
        const other = await fixture();
        for (const visitType of ["regular", "evaluation"])
          await rejected({ ...input, planId: undefined, visitType });
        expect(
          await repository.listAppointments(
            clinicId,
            input.startsAt,
            input.startsAt.replace("12:00", "12:45"),
          ),
        ).toHaveLength(0);
        // O plano do cliente cobre o serviço: experimental só de outro serviço (EX2).
        const covered = await post({
          ...input,
          planId: undefined,
          visitType: "trial",
        });
        expect(covered.statusCode, covered.body).toBe(409);
        expect(covered.json()).toMatchObject({ code: "TRIAL_SERVICE_IN_PLAN" });
        const trial = await post({
          ...input,
          serviceId: other.service.id,
          planId: undefined,
          visitType: "trial",
        });
        expect(trial.statusCode, trial.body).toBe(201);
        expect(trial.json()).not.toHaveProperty("planId");
        // Histórico do aviso "Já fez experimental" (EX2).
        expect(
          (
            await repository.listTrialAppointments(clinicId, {
              patientId: input.patientId,
            })
          ).map((item) => item.id),
        ).toEqual([trial.json().id]);
      });
      it("recusa plano de outro cliente, serviço diferente, inexistente, cancelado ou sem saldo", async () => {
        const { input, planInput, plan } = await fixture();
        const foreign = await fixture();
        await rejected({ ...input, planId: randomUUID() });
        await rejected({ ...input, planId: foreign.plan.id });
        await rejected({ ...input, serviceId: foreign.service.id });
        const cancelled = await repository.createPatientPlan(
          clinicId,
          actorId,
          planInput,
        );
        await repository.updatePatientPlanStatus(
          clinicId,
          actorId,
          cancelled.id,
          "cancelled",
        );
        await rejected({ ...input, planId: cancelled.id });
        for (const hour of [10, 11]) {
          const consumed = await repository.createAppointment(clinicId, {
            ...input,
            startsAt: input.startsAt.replace("12:00", `${hour}:00`),
          });
          await repository.updateAppointmentStatus(
            clinicId,
            consumed.id,
            "completed",
          );
        }
        await rejected({ ...input, planId: plan.id });
      });
      it("valida todas as ocorrências e o saldo antes de gravar a recorrência inteira", async () => {
        const { input, planInput } = await fixture();
        const recurring = { ...input, occurrences: 3, intervalWeeks: 1 };
        await rejected(recurring, "/appointments/recurring");
        const limited = await repository.createPatientPlan(clinicId, actorId, {
          ...planInput,
          validFrom: "2039-06-01",
          validUntil: "2039-06-08",
        });
        await rejected(
          {
            ...input,
            planId: limited.id,
            startsAt: "2039-06-01T12:00:00Z",
            occurrences: 2,
            intervalWeeks: 2,
          },
          "/appointments/recurring",
        );
        expect(
          await repository.listAppointments(
            clinicId,
            "2039-06-01T00:00:00Z",
            "2039-07-01T00:00:00Z",
          ),
        ).toHaveLength(0);
        expect(
          await repository.listAppointments(
            clinicId,
            input.startsAt,
            "2021-04-01T00:00:00Z",
          ),
        ).toHaveLength(0);
        const valid = await post(
          { ...recurring, occurrences: 2 },
          "/appointments/recurring",
        );
        expect(valid.statusCode, valid.body).toBe(201);
        expect(valid.json().map((a: { planId: string }) => a.planId)).toEqual([
          input.planId,
          input.planId,
        ]);
      });
      it("usa o dia da clínica para validar o início e o fim da vigência", async () => {
        const { input, planInput } = await fixture();
        const plan = await repository.createPatientPlan(clinicId, actorId, {
          ...planInput,
          validFrom: "2040-01-01",
          validUntil: "2040-01-01",
        });
        const valid = await post({
          ...input,
          planId: plan.id,
          startsAt: "2040-01-02T01:30:00Z",
        });
        expect(valid.statusCode, valid.body).toBe(201);
        const prices = await app.inject({
          url: `/appointments/pricing?patientId=${input.patientId}&serviceId=${input.serviceId}&startsAt=2040-01-02T01%3A30%3A00Z`,
          headers,
        });
        expect(prices.statusCode, prices.body).toBe(200);
        expect(prices.json().plans).toContainEqual(
          expect.objectContaining({ planId: plan.id }),
        );
        await rejected({
          ...input,
          planId: plan.id,
          startsAt: "2040-01-02T03:01:00Z",
        });
        await rejected({
          ...input,
          planId: plan.id,
          startsAt: "2040-01-01T02:59:00Z",
        });
      });
      it("editar cliente/serviço exige plano compatível e persiste os três vínculos", async () => {
        const original = await fixture(),
          next = await fixture();
        const current = await repository.createAppointment(
          clinicId,
          original.input,
        );
        const patch = (payload: Record<string, unknown>) =>
          app.inject({
            method: "PATCH",
            url: `/appointments/${current.id}`,
            headers,
            payload,
          });
        const missing = await patch({
          patientId: next.patient.id,
          serviceId: next.service.id,
          roomId: next.input.roomId,
        });
        expect(missing.statusCode, missing.body).toBe(409);
        expect(missing.json().code).toBe("PLAN_REQUIRED");
        const saved = await patch({
          patientId: next.patient.id,
          serviceId: next.service.id,
          roomId: next.input.roomId,
          planId: next.plan.id,
        });
        expect(saved.statusCode, saved.body).toBe(200);
        expect(
          await repository.findAppointment(clinicId, current.id),
        ).toMatchObject({
          patientId: next.patient.id,
          patientName: next.patient.fullName,
          serviceId: next.service.id,
          planId: next.plan.id,
        });
        const legacy = await repository.createAppointment(clinicId, {
          ...original.input,
          planId: undefined,
          startsAt: original.input.startsAt.replace("12:00", "13:00"),
        });
        const notes = await app.inject({
          method: "PATCH",
          url: `/appointments/${legacy.id}`,
          headers,
          payload: {
            serviceId: legacy.serviceId,
            roomId: legacy.roomId,
            notes: "Só observação",
          },
        });
        expect(notes.statusCode, notes.body).toBe(200);
      });
      it("reagendamento e reposição conferem a nova data e permitem selecionar outro plano", async () => {
        const { input, planInput } = await fixture();
        const short = await repository.createPatientPlan(clinicId, actorId, {
          ...planInput,
          validFrom: "2039-01-01",
          validUntil: "2039-01-01",
        });
        const current = await repository.createAppointment(clinicId, {
          ...input,
          planId: short.id,
          startsAt: "2039-01-01T12:00:00Z",
        });
        const schedule = {
          professionalId: input.professionalId,
          roomId: input.roomId,
          startsAt: "2039-01-03T12:00:00Z",
        };
        const failed = await app.inject({
          method: "PUT",
          url: `/appointments/${current.id}/schedule`,
          headers,
          payload: schedule,
        });
        expect(failed.statusCode, failed.body).toBe(409);
        const moved = await app.inject({
          method: "PUT",
          url: `/appointments/${current.id}/schedule`,
          headers,
          payload: { ...schedule, planId: input.planId },
        });
        expect(moved.statusCode, moved.body).toBe(200);
        expect(moved.json().planId).toBe(input.planId);
        await repository.updateAppointmentStatus(
          clinicId,
          current.id,
          "excused_absence",
        );
        const bad = await post(
          { ...schedule, planId: short.id },
          `/appointments/${current.id}/successor`,
        );
        expect(bad.statusCode, bad.body).toBe(409);
        const replacement = await post(
          { ...schedule, startsAt: "2039-01-04T12:00:00Z" },
          `/appointments/${current.id}/successor`,
        );
        expect(replacement.statusCode, replacement.body).toBe(201);
        expect(replacement.json().planId).toBe(input.planId);
      });
      it("remarca atendimento sem plano vinculado (anterior à AP3) sem exigir plano", async () => {
        const { input } = await fixture();
        const legacy = await repository.createAppointment(clinicId, {
          patientId: input.patientId,
          serviceId: input.serviceId,
          professionalId: input.professionalId,
          roomId: input.roomId,
          visitType: "regular",
          startsAt: "2039-02-01T12:00:00Z",
        });
        const moved = await app.inject({
          method: "PUT",
          url: `/appointments/${legacy.id}/schedule`,
          headers,
          payload: {
            professionalId: input.professionalId,
            roomId: input.roomId,
            startsAt: "2039-02-02T12:00:00Z",
          },
        });
        expect(moved.statusCode, moved.body).toBe(200);
        expect(moved.json().planId ?? null).toBeNull();
      });
      for (const linked of ["clinical", "financial"] as const) {
        it(`não troca cliente de atendimento com registro ${linked}`, async () => {
          const original = await fixture(),
            next = await fixture();
          let current: Appointment;
          if (linked === "financial") {
            const tab = await repository.openPatientTab(clinicId, actorId, {
              patientId: original.patient.id,
            });
            const legacy = await addLegacyTabService(
              repository,
              database?.pool,
              clinicId,
              tab.id,
              { ...original.input, planId: undefined },
              5_000,
            );
            current = (await repository.findAppointment(
              clinicId,
              legacy.services![0]!.appointmentId,
            ))!;
          } else {
            current = await repository.createAppointment(clinicId, {
              ...original.input,
              planId: undefined,
            });
          }
          if (linked === "clinical") {
            const record = await post(
              { appointmentId: current.id, subjective: "Relato clínico" },
              "/clinical-records",
            );
            expect(record.statusCode, record.body).toBe(201);
          }
          const response = await app.inject({
            method: "PATCH",
            url: `/appointments/${current.id}`,
            headers,
            payload: {
              patientId: next.patient.id,
              serviceId: next.service.id,
              roomId: current.roomId,
              planId: next.plan.id,
            },
          });
          expect(response.statusCode, response.body).toBe(409);
          expect(response.json().code).toBe("APPOINTMENT_PATIENT_LOCKED");
          expect(
            (await repository.findAppointment(clinicId, current.id))?.patientId,
          ).toBe(original.patient.id);
        });
      }

      it("lead só agenda experimental; avaliação exige conversão em cliente", async () => {
        const { input } = await fixture();
        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: `Lead ${randomUUID()}`,
            phone: "11977776666",
            source: "Indicação",
            interest: "Pilates",
          }),
        );
        // Avaliação de lead nem chega à regra do plano: o contrato só aceita experimental (EX1).
        const evaluation = await post(
          { ...input, visitType: "evaluation" },
          `/leads/${lead.id}/appointments`,
        );
        expect(evaluation.statusCode, evaluation.body).toBe(400);
        const trial = await post(
          { ...input, visitType: "trial" },
          `/leads/${lead.id}/appointments`,
        );
        expect(trial.statusCode, trial.body).toBe(201);
        expect(trial.json()).toMatchObject({
          leadId: lead.id,
          visitType: "trial",
        });
        expect(trial.json()).not.toHaveProperty("planId");
        expect(
          (
            await repository.listTrialAppointments(clinicId, {
              leadId: lead.id,
            })
          ).map((item) => item.id),
        ).toEqual([trial.json().id]);
      });
      it("recorrente mantém a frequência, sem bloquear pelo saldo nominal do ciclo", async () => {
        const { input, planInput } = await fixture();
        const plan = await repository.createPatientPlan(clinicId, actorId, {
          ...planInput,
          kind: "recurring",
          services: planInput.services.map((service) => ({
            ...service,
            totalSessions: 1,
          })),
        });
        for (const hour of [9, 10]) {
          const used = await repository.createAppointment(clinicId, {
            ...input,
            planId: plan.id,
            startsAt: input.startsAt.replace(
              "12:00",
              `${String(hour).padStart(2, "0")}:00`,
            ),
          });
          await repository.updateAppointmentStatus(
            clinicId,
            used.id,
            "completed",
          );
        }
        const response = await post({ ...input, planId: plan.id });
        expect(response.statusCode, response.body).toBe(201);
      });
    },
  );
}
