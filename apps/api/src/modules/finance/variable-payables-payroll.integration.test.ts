import { nextTestCpf } from "../../test-support/cpf.js";
import type {
  FinancialWorkspace,
  Payable,
  PayrollEmployee,
  PayrollSummary,
  RecurringPayable,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  async function workspace() {
    const response = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json<FinancialWorkspace>();
  }
  async function userWith(permissions: string[]) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Usuária financeiro",
        email: `financeiro.${permissions.length}@teste.local`,
        role: "user",
        password: "SenhaForte123",
        permissions,
      },
    });
    expect(created.statusCode).toBe(201);
    return {
      authorization: `Bearer ${app.jwt.sign({
        sub: created.json<{ id: string }>().id,
        clinicId,
        role: "user",
      })}`,
    };
  }
  return { app, repository, headers, workspace, userWith };
}

describe("despesas fixas de valor variável", () => {
  it("gera a conta com o valor estimado e aceita o valor real do mês", async () => {
    const { app, headers, workspace } = await setup();
    const initial = await workspace();
    const created = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: {
        description: "Conta de luz",
        categoryId: initial.categories.find((item) => item.kind === "expense")!
          .id,
        costCenterId: initial.costCenters[0]!.id,
        amountInCents: 30_000,
        variableAmount: true,
        reminderDaysBefore: 5,
        dayOfMonth: 20,
        startMonth: "2039-06",
      },
    });
    expect(created.statusCode).toBe(201);
    const model = created.json<RecurringPayable>();
    expect(model).toMatchObject({
      variableAmount: true,
      reminderDaysBefore: 5,
    });

    const generated = (await workspace()).payables.find(
      (item) => item.recurringPayableId === model.id,
    )!;
    expect(generated).toMatchObject({
      amountInCents: 30_000,
      amountEstimated: true,
      competence: "2039-06",
    });

    const informed = await app.inject({
      method: "PUT",
      url: `/finance/payables/${generated.id}/amount`,
      headers,
      payload: { amountInCents: 27_450 },
    });
    expect(informed.statusCode).toBe(200);
    expect(informed.json<Payable>().amountInCents).toBe(27_450);
    expect(informed.json<Payable>().amountEstimated).toBeUndefined();

    // Paga, a conta não muda mais de valor.
    await app.inject({
      method: "POST",
      url: `/finance/payables/${generated.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    const afterPaid = await app.inject({
      method: "PUT",
      url: `/finance/payables/${generated.id}/amount`,
      headers,
      payload: { amountInCents: 1_000 },
    });
    expect(afterPaid.statusCode).toBe(409);
    expect(afterPaid.json()).toMatchObject({ code: "PAYABLE_NOT_OPEN" });

    // Edição liga/desliga o aviso e o valor variável.
    const updated = await app.inject({
      method: "PUT",
      url: `/finance/recurring-payables/${model.id}`,
      headers,
      payload: {
        description: model.description,
        categoryId: model.categoryId,
        costCenterId: model.costCenterId,
        amountInCents: model.amountInCents,
        variableAmount: false,
        dayOfMonth: model.dayOfMonth,
        startMonth: model.startMonth,
        active: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<RecurringPayable>().variableAmount).toBe(false);
    expect(updated.json<RecurringPayable>().reminderDaysBefore).toBeUndefined();
  });

  it("recusa informar valor em conta que não é de despesa variável", async () => {
    const { app, headers, workspace } = await setup();
    const initial = await workspace();
    const fixed = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Material de escritório",
        categoryId: initial.categories.find((item) => item.kind === "expense")!
          .id,
        dueDate: "2039-06-15",
        amountInCents: 5_000,
      },
    });
    expect(fixed.statusCode).toBe(201);
    const response = await app.inject({
      method: "PUT",
      url: `/finance/payables/${fixed.json<Payable>().id}/amount`,
      headers,
      payload: { amountInCents: 6_000 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "PAYABLE_NOT_VARIABLE" });
    const missing = await app.inject({
      method: "PUT",
      url: "/finance/payables/00000000-0000-4000-8000-000000000000/amount",
      headers,
      payload: { amountInCents: 6_000 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("valida a antecedência do aviso", async () => {
    const { app, headers, workspace } = await setup();
    const initial = await workspace();
    const response = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: {
        description: "Conta de água",
        categoryId: initial.categories.find((item) => item.kind === "expense")!
          .id,
        costCenterId: initial.costCenters[0]!.id,
        amountInCents: 9_000,
        reminderDaysBefore: 40,
        dayOfMonth: 5,
        startMonth: "2039-06",
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("folha de pagamento", () => {
  it("soma o salário fixo às comissões da competência do profissional ligado", async () => {
    const { app, repository, headers } = await setup();
    const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente folha",
        phone: "11977776666",
        tags: [],
      }),
      [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createCommissionRule(clinicId, {
      professionalId: professional!.id,
      kind: "fixed",
      fixedAmountInCents: 1_500,
      percentage: 0,
      effectiveFrom: "2039-01-01",
      serviceId: service!.id,
    });
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-06-04T12:00:00Z",
      visitType: "regular",
      notes: "",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    await repository.generateCommissions(clinicId, "2039-06");

    const therapist = await app.inject({
      method: "POST",
      url: "/finance/payroll/employees",
      headers,
      payload: {
        name: "Ana Fisioterapeuta",
        role: "Fisioterapeuta",
        professionalId: professional!.id,
        baseSalaryInCents: 250_000,
      },
    });
    expect(therapist.statusCode).toBe(201);
    expect(therapist.json<PayrollEmployee>().professionalName).toBe(
      professional!.fullName,
    );
    const reception = await app.inject({
      method: "POST",
      url: "/finance/payroll/employees",
      headers,
      payload: {
        name: "Bia Recepção",
        role: "Recepcionista",
        baseSalaryInCents: 180_000,
      },
    });
    expect(reception.statusCode).toBe(201);

    // O mesmo profissional não entra duas vezes na folha.
    const duplicated = await app.inject({
      method: "POST",
      url: "/finance/payroll/employees",
      headers,
      payload: {
        name: "Ana de novo",
        professionalId: professional!.id,
        baseSalaryInCents: 0,
      },
    });
    expect(duplicated.statusCode).toBe(409);

    const june = await app.inject({
      method: "GET",
      url: "/finance/payroll?competence=2039-06",
      headers,
    });
    expect(june.statusCode).toBe(200);
    expect(june.json<PayrollSummary>()).toMatchObject({
      competence: "2039-06",
      baseSalaryInCents: 430_000,
      commissionInCents: 1_500,
      totalInCents: 431_500,
      lines: [
        {
          employee: { name: "Ana Fisioterapeuta" },
          baseSalaryInCents: 250_000,
          commissionInCents: 1_500,
          commissionCount: 1,
          totalInCents: 251_500,
        },
        {
          employee: { name: "Bia Recepção" },
          commissionInCents: 0,
          totalInCents: 180_000,
        },
      ],
    });
    // Sem competência, vale o mês atual; em julho não há comissão.
    expect(
      (
        await app.inject({ method: "GET", url: "/finance/payroll", headers })
      ).json<PayrollSummary>().competence,
    ).toBe("2039-06");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/finance/payroll?competence=2039-07",
          headers,
        })
      ).json<PayrollSummary>().commissionInCents,
    ).toBe(0);

    // Inativo sai da folha, mas continua cadastrado.
    const deactivated = await app.inject({
      method: "PUT",
      url: `/finance/payroll/employees/${reception.json<PayrollEmployee>().id}`,
      headers,
      payload: {
        name: "Bia Recepção",
        baseSalaryInCents: 180_000,
        active: false,
      },
    });
    expect(deactivated.statusCode).toBe(200);
    const after = (
      await app.inject({
        method: "GET",
        url: "/finance/payroll?competence=2039-06",
        headers,
      })
    ).json<PayrollSummary>();
    expect(after.lines).toHaveLength(1);
    expect(after.totalInCents).toBe(251_500);
    const employees = await app.inject({
      method: "GET",
      url: "/finance/payroll/employees",
      headers,
    });
    expect(employees.json<PayrollEmployee[]>()).toHaveLength(2);
  });

  it("exige permissão própria da folha, além do financeiro", async () => {
    const { app, userWith } = await setup();
    const financeOnly = await userWith(["finance.view"]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/finance/payroll",
          headers: financeOnly,
        })
      ).statusCode,
    ).toBe(403);
    const viewer = await userWith(["finance.view", "finance.payroll_view"]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/finance/payroll",
          headers: viewer,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/finance/payroll/employees",
          headers: viewer,
          payload: { name: "Sem permissão", baseSalaryInCents: 100 },
        })
      ).statusCode,
    ).toBe(403);
  });
});
