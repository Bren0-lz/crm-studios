import {
  allocatePlanRevenue,
  defaultContractTemplateBody,
  guidedPatientInputSchema,
  patientPlanInputSchema,
  planRenewalInputSchema,
  planTemplateInputSchema,
  saoPauloToday,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../database.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { PostgresClinicRepository } from "../../postgres-repository.js";
import type { ClinicRepository } from "../../repository.js";
import { atInstant } from "../../test-support/clock.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

describe("service composition validation and allocation", () => {
  const entry = {
    serviceId: randomUUID(),
    totalSessions: 1,
    totalValueInCents: 100,
  };
  it("requires distinct services, integer quantities, nonnegative values and a matching total", () => {
    const input = { name: "Pacote", totalValueInCents: 100, services: [entry] };
    expect(planTemplateInputSchema.safeParse(input).success).toBe(true);
    for (const services of [
      [],
      [entry, entry],
      [{ ...entry, totalSessions: 0 }],
      [{ ...entry, totalSessions: 1001 }],
      [{ ...entry, totalSessions: 1.5 }],
      [{ ...entry, totalValueInCents: -1 }],
      [{ ...entry, totalValueInCents: 99 }],
    ])
      expect(
        planTemplateInputSchema.safeParse({ ...input, services }).success,
      ).toBe(false);
    expect(
      planTemplateInputSchema.safeParse({
        ...input,
        totalValueInCents: 0,
        services: [{ ...entry, totalValueInCents: 0 }],
      }).success,
    ).toBe(true);
  });
  it("allocates every received cent, with stable ties and zero-valued services", () => {
    expect(
      allocatePlanRevenue(101, [
        { totalValueInCents: 1 },
        { totalValueInCents: 1 },
        { totalValueInCents: 1 },
      ]),
    ).toEqual([34, 34, 33]);
    expect(
      allocatePlanRevenue(101, [
        { totalValueInCents: 1 },
        { totalValueInCents: 3 },
        { totalValueInCents: 0 },
      ]),
    ).toEqual([25, 76, 0]);
    expect(
      allocatePlanRevenue(3, [
        { totalValueInCents: 0 },
        { totalValueInCents: 0 },
      ]),
    ).toEqual([2, 1]);
    const shares = allocatePlanRevenue(2147483647, [
      { totalValueInCents: 2147483646 },
      { totalValueInCents: 1 },
    ]);
    expect(shares.reduce((sum, item) => sum + item, 0)).toBe(2147483647);
  });
});

for (const backend of ["memory", "postgres"] as const) {
  describe.skipIf(backend === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${backend}: plans with independent services`,
    () => {
      let repository: ClinicRepository;
      let pool: Pool | undefined;
      const patientIds: string[] = [];
      const serviceIds: string[] = [];
      const templateIds: string[] = [];
      const groupIds: string[] = [];
      const documentTemplateIds: string[] = [];
      beforeAll(async () => {
        if (backend === "memory") repository = new MemoryClinicRepository();
        else {
          pool = new Pool({
            connectionString: process.env.TEST_DATABASE_URL,
            ssl: false,
          });
          await runMigrations(pool);
          await seedDemoData(pool);
          repository = new PostgresClinicRepository(pool);
        }
      });
      afterAll(async () => {
        if (!pool) return;
        await pool.query(
          "DELETE FROM issued_documents WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM document_templates WHERE id=ANY($1::uuid[])",
          [documentTemplateIds],
        );
        await pool.query(
          "DELETE FROM financial_events WHERE receivable_id IN (SELECT id FROM receivables WHERE patient_id=ANY($1::uuid[]))",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM session_movements WHERE plan_id IN (SELECT id FROM patient_plans WHERE patient_id=ANY($1::uuid[]))",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM appointments WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM group_enrollments WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM group_sessions WHERE group_id=ANY($1::uuid[])",
          [groupIds],
        );
        await pool.query("DELETE FROM group_classes WHERE id=ANY($1::uuid[])", [
          groupIds,
        ]);
        await pool.query(
          "DELETE FROM receivables WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query(
          "UPDATE patient_plans SET renewed_from_plan_id=NULL WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query(
          "DELETE FROM patient_plans WHERE patient_id=ANY($1::uuid[])",
          [patientIds],
        );
        await pool.query("DELETE FROM patients WHERE id=ANY($1::uuid[])", [
          patientIds,
        ]);
        await pool.query(
          "DELETE FROM plan_templates WHERE id=ANY($1::uuid[])",
          [templateIds],
        );
        await pool.query("DELETE FROM services WHERE id=ANY($1::uuid[])", [
          serviceIds,
        ]);
        await pool.end();
      });
      async function setup() {
        const marker = `multiservice-${randomUUID()}`;
        const services = await Promise.all(
          ["A", "B"].map(async (name) => {
            const service = await repository.createService(clinicId, {
              name: `${marker}-${name}`,
              durationMinutes: 30,
              priceInCents: 100,
              color: "#64748b",
            });
            serviceIds.push(service.id);
            return service;
          }),
        );
        const patient = await repository.createPatient(clinicId, {
          fullName: marker,
          phone: "11999991234",
          tags: [],
        });
        patientIds.push(patient.id);
        const composition = services.map((item, index) => ({
          serviceId: item.id,
          totalSessions: index + 1,
          totalValueInCents: 100,
        }));
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          { name: marker, totalValueInCents: 200, services: composition },
        );
        templateIds.push(template.id);
        const input = patientPlanInputSchema.parse({
          name: "Nome enviado",
          patientId: patient.id,
          planTemplateId: template.id,
          kind: "fixed_package",
          services: composition,
          totalValueInCents: 200,
          validFrom: "2049-01-01",
          validUntil: "2051-12-31",
          firstDueDate: "2049-01-01",
          installments: 3,
        });
        const plan = await repository.createPatientPlan(
          clinicId,
          actorId,
          input,
        );
        return { services, patient, template, input, plan };
      }
      it("consumes and restores only the matching service, without duplicate consumption or partial completion", async () => {
        const { patient, services, plan } = await setup();
        const appointments: Awaited<
          ReturnType<ClinicRepository["createAppointment"]>
        >[] = [];
        for (const [index, serviceId] of [
          services[0]!.id,
          services[0]!.id,
          services[1]!.id,
        ].entries()) {
          appointments.push(
            await repository.createAppointment(clinicId, {
              patientId: patient.id,
              serviceId,
              professionalId: "44444444-4444-4444-8444-444444444444",
              roomId: "55555555-5555-4555-8555-555555555555",
              startsAt: `2050-01-03T${12 + index}:00:00Z`,
              visitType: "regular",
            }),
          );
        }
        const results = await atInstant("2050-01-04T12:00:00Z", () =>
          Promise.allSettled(
            appointments
              .slice(0, 2)
              .map((appointment) =>
                repository.updateAppointmentStatus(
                  clinicId,
                  appointment.id,
                  "completed",
                ),
              ),
          ),
        );
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.status === "rejected"),
        ).toHaveLength(1);
        const completed =
          appointments[results[0]!.status === "fulfilled" ? 0 : 1]!;
        await atInstant("2050-01-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            completed.id,
            "completed",
          ),
        );
        await atInstant("2050-01-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointments[2]!.id,
            "completed",
          ),
        );
        let sold = (await repository.listPatientPlans(clinicId)).find(
          (item) => item.id === plan.id,
        )!;
        expect(sold.services.map((entry) => entry.remainingSessions)).toEqual([
          0, 1,
        ]);
        expect(sold.remainingSessions).toBe(1);
        await atInstant("2050-01-04T12:00:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            completed.id,
            "scheduled",
          ),
        );
        sold = (await repository.listPatientPlans(clinicId)).find(
          (item) => item.id === plan.id,
        )!;
        expect(sold.services.map((entry) => entry.remainingSessions)).toEqual([
          1, 1,
        ]);
        const movements = await repository.listSessionMovements(
          clinicId,
          plan.id,
        );
        expect(
          movements.filter((item) => item.kind === "reversal"),
        ).toMatchObject([{ serviceId: services[0]!.id, quantity: 1 }]);
        expect(movements.reduce((sum, item) => sum + item.quantity, 0)).toBe(
          sold.remainingSessions,
        );
      });
      it("fills the standard contract with the plan terms and the clinic and client data", async () => {
        const { plan } = await setup();
        const clinic = (await repository.getClinicSettings(clinicId))!;
        const documentTemplate = await repository.createDocumentTemplate(
          clinicId,
          {
            name: `multiservice-${randomUUID()}`,
            kind: "contract",
            body: defaultContractTemplateBody,
          },
        );
        documentTemplateIds.push(documentTemplate.id);
        const document = await repository.createIssuedDocument(
          clinicId,
          actorId,
          {
            patientId: plan.patientId,
            planId: plan.id,
            templateId: documentTemplate.id,
            title: "Contrato padrão",
          },
        );
        const value = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(2);
        expect(document.snapshotBody).not.toContain("{{");
        expect(document.snapshotBody).toContain(
          `CONTRATADA: ${clinic.legalName || clinic.name}, nome fantasia ${clinic.name}`,
        );
        expect(document.snapshotBody).toContain(
          "inscrito(a) no CPF sob o nº não informado, residente em não informado.",
        );
        expect(document.snapshotBody).toContain(
          `o valor total de ${value}, em 3 parcela(s).`,
        );
        expect(document.snapshotBody).toContain(
          "Este contrato vigora de 01/01/2049 a 31/12/2051,",
        );
      });
      it("keeps sold terms after catalog changes, renews inactive templates and allocates actual receipts", async () => {
        const { services, plan, template } = await setup();
        await repository.updatePlanTemplate(clinicId, actorId, template.id, {
          active: false,
          totalValueInCents: 300,
          services: services.map((entry) => ({
            serviceId: entry.id,
            totalSessions: 900,
            totalValueInCents: 150,
          })),
        });
        const previous = (await repository.listPatientPlans(clinicId)).find(
          (item) => item.id === plan.id,
        )!;
        expect(previous.services.map((entry) => entry.totalSessions)).toEqual([
          1, 2,
        ]);
        const documentTemplate = await repository.createDocumentTemplate(
          clinicId,
          {
            name: `multiservice-${randomUUID()}`,
            kind: "contract",
            body: "Plano {{plano_nome}}. Serviços: {{plano_servicos}}.",
          },
        );
        documentTemplateIds.push(documentTemplate.id);
        const document = await repository.createIssuedDocument(
          clinicId,
          actorId,
          {
            patientId: plan.patientId,
            planId: plan.id,
            templateId: documentTemplate.id,
            title: "Contrato com serviços",
          },
        );
        expect(document.snapshotBody).toContain(
          `${services[0]!.name}: 1 sessão`,
        );
        expect(document.snapshotBody).toContain(
          `${services[1]!.name}: 2 sessões`,
        );
        expect(document.snapshotBody).not.toContain("900 sessões");
        const receivables = (
          await repository.getFinancialSummary(clinicId)
        ).receivables.filter((item) => item.planId === plan.id);
        expect(
          receivables.reduce((sum, entry) => sum + entry.amountInCents, 0),
        ).toBe(200);
        await repository.settleReceivable(
          clinicId,
          actorId,
          receivables[0]!.id,
          "pix",
        );
        const today = saoPauloToday();
        const report = await repository.getManagementReport(
          clinicId,
          today,
          today,
        );
        expect(
          report.profitability.byService
            .filter((entry) =>
              services.some((service) => service.id === entry.id),
            )
            .map((entry) => entry.revenueInCents)
            .sort(),
        ).toEqual([33, 34]);
        const renewed = await repository.renewPatientPlan(
          clinicId,
          actorId,
          plan.id,
          planRenewalInputSchema.parse({
            name: plan.name,
            services: plan.services.map((entry) => ({
              serviceId: entry.serviceId,
              totalSessions: 3,
              totalValueInCents: 50,
            })),
            totalValueInCents: 100,
            validFrom: "2052-01-01",
            firstDueDate: "2052-01-01",
            installments: 1,
          }),
        );
        expect(
          renewed?.services.map((entry) => entry.remainingSessions),
        ).toEqual([3, 3]);
        expect(renewed?.totalValueInCents).toBe(100);
      });
      it("rejects incomplete or changed compositions atomically", async () => {
        const { input, patient, template } = await setup();
        const before = (await repository.listPatientPlans(clinicId)).filter(
          (item) => item.patientId === patient.id,
        ).length;
        await expect(
          repository.createPatientPlan(clinicId, actorId, {
            ...input,
            services: [input.services[0]!],
            totalValueInCents: 100,
          }),
        ).rejects.toMatchObject({ code: "PLAN_SERVICE_COMPOSITION_MISMATCH" });
        await expect(
          repository.updatePlanTemplate(clinicId, actorId, template.id, {
            totalValueInCents: 201,
          }),
        ).rejects.toBeDefined();
        expect(
          (await repository.listPlanTemplates(clinicId)).find(
            (item) => item.id === template.id,
          )?.totalValueInCents,
        ).toBe(200);
        expect(
          (await repository.listPatientPlans(clinicId)).filter(
            (item) => item.patientId === patient.id,
          ),
        ).toHaveLength(before);
      });
      it("automatically renews every sold service after catalog deactivation", async () => {
        const { input, template } = await setup();
        const today = saoPauloToday();
        const previousEnd = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
        previousEnd.setUTCDate(0);
        const end = previousEnd.toISOString().slice(0, 10),
          start = `${end.slice(0, 7)}-01`;
        const original = await repository.createPatientPlan(clinicId, actorId, {
          ...input,
          kind: "recurring",
          autoRenew: true,
          validFrom: start,
          validUntil: end,
          firstDueDate: start,
        });
        await repository.updatePlanTemplate(clinicId, actorId, template.id, {
          active: false,
        });
        await repository.renewDuePatientPlans(clinicId, actorId);
        const successors = (await repository.listPatientPlans(clinicId)).filter(
          (item) => item.renewedFromPlanId === original.id,
        );
        expect(successors).toHaveLength(1);
        expect(
          successors[0]?.services.map((entry) => [
            entry.serviceId,
            entry.remainingSessions,
            entry.totalValueInCents,
          ]),
        ).toEqual(
          original.services.map((entry) => [
            entry.serviceId,
            entry.totalSessions,
            entry.totalValueInCents,
          ]),
        );
        await repository.renewDuePatientPlans(clinicId, actorId);
        expect(
          (await repository.listPatientPlans(clinicId)).filter(
            (item) => item.renewedFromPlanId === original.id,
          ),
        ).toHaveLength(1);
      });
      it("enrolls a guided sale in a group for any included service", async () => {
        const { input, services } = await setup();
        const group = await repository.createGroupClass(clinicId, {
          serviceId: services[1]!.id,
          professionalId: "44444444-4444-4444-8444-444444444444",
          roomId: "66666666-6666-4666-8666-666666666666",
          capacity: 2,
          weeklySlots: [{ weekday: 2, startTime: "23:00", endTime: "23:30" }],
        });
        groupIds.push(group.id);
        const sale = await repository.createPatientWithNextStep(
          clinicId,
          actorId,
          guidedPatientInputSchema.parse({
            next: "plan",
            patient: {
              fullName: `multiservice-${randomUUID()}`,
              phone: "11999991235",
            },
            plan: {
              ...input,
              validFrom: saoPauloToday(),
              kind: "fixed_package",
            },
            groupId: group.id,
          }),
        );
        patientIds.push(sale.patient.id);
        expect(sale.enrollment).toMatchObject({
          groupId: group.id,
          patientId: sale.patient.id,
        });
        expect(sale.plan?.services).toHaveLength(2);
        const subscribers =
          await repository.listSubscriberIdsWithoutGroup(clinicId);
        expect(subscribers).not.toContain(sale.patient.id);
      });
    },
  );
}
