import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  patientInputSchema,
  patientPlanInputSchema,
  planTemplateInputSchema,
  tabCreditHistoryLabel,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { atInstant } from "../../../test-support/clock.js";
import { addLegacyTabService } from "../../../test-support/legacy-tab-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const serviceId = "77777777-7777-4777-8777-777777777777";
const professionalId = "44444444-4444-4444-8444-444444444444";
const roomId = "66666666-6666-4666-8666-666666666666";

// Crédito pago na comanda (QC8): consumido primeiro e exibido como serviço avulso.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: crédito do serviço pago na comanda`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("tabservicecr");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      async function closedTabCredit(startsAt: string) {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `Comanda ${randomUUID()}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: `Comanda ${randomUUID()}`,
            emergencyContactPhone: "11988887777",
          }),
        );
        const tab = await repository.openPatientTab(clinicId, actorId, {
          patientId: patient.id,
        });
        const updated = await addLegacyTabService(
          repository,
          pool,
          clinicId,
          tab.id,
          {
            professionalId,
            roomId,
            serviceId,
            startsAt,
            visitType: "regular",
            notes: "",
          },
          18000,
        );
        const appointmentId = updated.services![0]!.appointmentId;
        await repository.closePatientTab(clinicId, actorId, tab.id, {
          settlement: "receivable",
          dueDate: startsAt.slice(0, 10),
        });
        return { patient, tab, appointmentId };
      }

      it("consome o crédito da comanda mesmo havendo outro plano válido para o serviço", async () => {
        const startsAt = "2061-03-10T12:00:00.000Z";
        const { patient, tab, appointmentId } = await closedTabCredit(startsAt);
        const services = [
          { serviceId, totalSessions: 4, totalValueInCents: 20000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          planTemplateInputSchema.parse({
            name: `Pacote ${randomUUID()}`,
            totalValueInCents: 20000,
            services,
          }),
        );
        const other = await repository.createPatientPlan(
          clinicId,
          actorId,
          patientPlanInputSchema.parse({
            patientId: patient.id,
            planTemplateId: template.id,
            name: template.name,
            kind: "fixed_package",
            services: [
              { serviceId, totalSessions: 4, totalValueInCents: 20000 },
            ],
            totalValueInCents: 20000,
            installments: 1,
            validFrom: "2061-03-01",
            validUntil: "2061-03-31",
            firstDueDate: "2061-03-01",
          }),
        );
        const balance = async () =>
          (await repository.listPatientPlans(clinicId, patient.id))
            .filter((plan) => plan.status !== "cancelled")
            .reduce((sum, plan) => sum + plan.remainingSessions, 0);
        expect(await balance()).toBe(5);

        await atInstant("2061-03-10T12:30:00Z", () =>
          repository.updateAppointmentStatus(
            clinicId,
            appointmentId,
            "completed",
          ),
        );

        const plans = await repository.listPatientPlans(clinicId, patient.id);
        const credit = plans.find((plan) => plan.sourceTabId === tab.id)!;
        expect(credit.remainingSessions).toBe(0);
        expect(
          plans.find((plan) => plan.id === other.id)!.remainingSessions,
        ).toBe(4);
        expect(await balance()).toBe(4);
      });

      it("exibe o crédito sem código da comanda e como serviço avulso no histórico", async () => {
        const { patient, tab } = await closedTabCredit(
          "2061-04-10T12:00:00.000Z",
        );
        const [credit] = await repository.listPatientPlans(
          clinicId,
          patient.id,
        );
        const service = (await repository.listServices(clinicId)).find(
          (item) => item.id === serviceId,
        )!;
        expect(credit!.name).toBe(`${service.name} · pago na comanda`);
        expect(credit!.name).not.toContain(tab.id.slice(0, 8).toUpperCase());

        const timeline = await repository.getPatientTimeline(
          clinicId,
          patient.id,
        );
        const entry = timeline!.find(
          (item) => item.id === `plan_created:${credit!.id}`,
        );
        expect(entry?.title).toBe(
          `${tabCreditHistoryLabel}: ${service.name} · pago na comanda`,
        );
        expect(
          timeline!.some((item) => item.title.includes("Plano contratado")),
        ).toBe(false);

        const history = await repository.listAdminAuditPage(
          clinicId,
          undefined,
          { action: "plan.tab_credit" },
        );
        const event = history.items.find(
          (item) => item.entityId === credit!.id,
        );
        expect(event).toMatchObject({
          action: "plan.tab_credit",
          description: tabCreditHistoryLabel,
        });
        const created = await repository.listAdminAuditPage(
          clinicId,
          undefined,
          { action: "plan.created" },
        );
        expect(created.items.some((item) => item.entityId === credit!.id)).toBe(
          false,
        );
      });

      // QM15: a cobrança da comanda não mostra trecho do id; a 0084 corrige as antigas.
      it("descreve a cobrança da comanda por data e cliente", async () => {
        const { patient } = await closedTabCredit("2061-05-10T12:00:00.000Z");
        const firstName = patient.fullName.split(" ")[0]!;
        const invoice = async () =>
          (await repository.getFinancialSummary(clinicId)).receivables.find(
            (item) => item.patientId === patient.id,
          )!;
        expect((await invoice()).description).toMatch(
          new RegExp(`^Comanda de \\d{2}/\\d{2} · ${firstName}$`),
        );
      });
    },
  );
}
