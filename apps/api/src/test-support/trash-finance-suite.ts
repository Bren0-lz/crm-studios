import { randomUUID } from "node:crypto";
import {
  patientPlanInputSchema,
  planTemplateInputSchema,
} from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";
import { nextTestCpf } from "./cpf.js";

export const trashFinanceClinicId = "11111111-1111-4111-8111-111111111111";
export const trashFinanceActorId = "22222222-2222-4222-8222-222222222222";

/**
 * LX2: o financeiro de um cliente na lixeira sai dos relatórios e do Financeiro e volta igual
 * quando o cliente é restaurado.
 */
export async function verifyTrashFinance(repository: ClinicRepository) {
  const clinicId = trashFinanceClinicId,
    actor = trashFinanceActorId;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const month = today.slice(0, 7);
  const [service] = (await repository.listServices(clinicId)).filter(
    (item) => item.active,
  );
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Fábio Lixeira",
    phone: "11988887777",
    tags: [],
  });
  const plan = async (value: number) => {
    const terms = {
      name: `Plano financeiro ${randomUUID().slice(0, 8)}`,
      totalValueInCents: value,
      kind: "single" as const,
      services: [
        { serviceId: service!.id, totalSessions: 1, totalValueInCents: value },
      ],
    };
    const template = await repository.createPlanTemplate(
      clinicId,
      actor,
      planTemplateInputSchema.parse({ ...terms, planType: "single" }),
    );
    return repository.createPatientPlan(
      clinicId,
      actor,
      patientPlanInputSchema.parse({
        ...terms,
        planTemplateId: template.id,
        patientId: patient.id,
        installments: 1,
        firstDueDate: today,
        validFrom: today,
        validUntil: today,
        autoRenew: false,
      }),
    );
  };
  const paidPlan = await plan(12_300);
  const openPlan = await plan(4_500);
  const ofPatient = async () =>
    (await repository.getFinancialSummary(clinicId)).receivables.filter(
      (item) => item.patientId === patient.id,
    );
  const paidReceivable = (await ofPatient()).find(
    (item) => item.planId === paidPlan.id,
  )!;
  await repository.settleReceivable(clinicId, actor, paidReceivable.id, "pix");

  const snapshot = async () => {
    const [summary, sales, management, dre, cash, dashboard, plans] =
      await Promise.all([
        repository.getFinancialSummary(clinicId),
        repository.getSalesReport(clinicId, month),
        repository.getManagementReport(clinicId, `${month}-01`, today),
        repository.getDreReport(clinicId, `${month}-01`, today),
        repository.listCashMovements(clinicId, today, today),
        repository.getDashboard(clinicId, today),
        repository.listPatientPlans(clinicId),
      ]);
    return {
      receivables: summary.receivables
        .filter((item) => item.patientId === patient.id)
        .map((item) => item.id)
        .sort(),
      openInCents: summary.openInCents,
      paidThisMonthInCents: summary.paidThisMonthInCents,
      sales: sales.sales
        .filter((item) => item.patientId === patient.id)
        .map((item) => item.sourceId)
        .sort(),
      salesTotal: sales.current,
      managementFinance: management.finance,
      activePlans: management.plans.active,
      dreRevenue: dre.totals.revenueInCents,
      cash: cash
        .filter((item) => item.receivableId === paidReceivable.id)
        .map((item) => item.amountInCents),
      patientsActive: dashboard.patientsActive,
      plans: plans
        .filter((item) => item.patientId === patient.id)
        .map((item) => item.id)
        .sort(),
    };
  };

  const before = await snapshot();
  expect(before.receivables).toHaveLength(2);
  expect(before.sales).toEqual([openPlan.id, paidPlan.id].sort());
  expect(before.cash).toEqual([12_300]);
  expect(before.plans).toHaveLength(2);
  expect(before.dreRevenue).toBeGreaterThanOrEqual(16_800);

  await repository.sendToTrash(clinicId, actor, "patients", patient.id);
  const trashed = await snapshot();
  expect(trashed.receivables).toEqual([]);
  expect(trashed.sales).toEqual([]);
  expect(trashed.cash).toEqual([]);
  expect(trashed.plans).toEqual([]);
  expect(trashed.openInCents).toBe(before.openInCents - 4_500);
  expect(trashed.paidThisMonthInCents).toBe(
    before.paidThisMonthInCents - 12_300,
  );
  expect(trashed.managementFinance.openInCents).toBe(
    before.managementFinance.openInCents - 4_500,
  );
  expect(trashed.activePlans).toBe(before.activePlans - 2);
  // DRE por competência: os dois planos do mês saem.
  expect(trashed.dreRevenue).toBe(before.dreRevenue - 16_800);
  expect(trashed.patientsActive).toBe(before.patientsActive - 1);
  expect(await repository.listPatientSales(clinicId, patient.id)).toBeNull();

  await repository.restoreFromTrash(clinicId, actor, "patients", patient.id);
  expect(await snapshot()).toEqual(before);
}
