import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildApp } from "../../app.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});
describe("financial dates", () => {
  it("conciles monthly refunds and separates payment dates from cash availability", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-05-31T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente datas mensais",
        phone: "11988887777",
        tags: [],
      });
    const invoice = await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Receita mensal",
      amountInCents: 10000,
      dueDate: "2039-05-31",
      competence: "2039-05",
    });
    const category = await repository.createFinancialCategory(clinicId, {
        name: "Despesa mensal",
        kind: "expense",
      }),
      center = await repository.createCostCenter(clinicId, {
        name: "Conciliação mensal",
      });
    const payable = await repository.createPayable(clinicId, actorId, {
      description: "Despesa da competência",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 6000,
      dueDate: "2039-05-31",
      dreCompetence: "2039-05",
    });
    await repository.settleReceivable(clinicId, actorId, invoice.id, "card", {
      paidAt: "2039-05-31T18:00:00Z",
      availableAt: "2039-06-02T18:00:00Z",
    });
    await repository.settlePayable(
      clinicId,
      actorId,
      payable.id,
      "bank_transfer",
      { paidAt: "2039-05-31T18:00:00Z", availableAt: "2039-06-03T18:00:00Z" },
    );
    const may = await repository.getFinancialWorkspace(clinicId);
    expect(may.summary.paidThisMonthInCents).toBe(10000);
    expect(may.paidExpensesThisMonthInCents).toBe(6000);
    expect(may.cashBalanceThisMonthInCents).toBe(0);
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    expect(
      (await repository.getFinancialWorkspace(clinicId))
        .cashBalanceThisMonthInCents,
    ).toBe(4000);
    await repository.reverseReceivablePayment(clinicId, actorId, invoice.id);
    await repository.reversePayablePayment(clinicId, actorId, payable.id);
    const june = await repository.getFinancialWorkspace(clinicId);
    expect(june.summary.paidThisMonthInCents).toBe(-10000);
    expect(june.paidExpensesThisMonthInCents).toBe(-6000);
    expect(june.cashBalanceThisMonthInCents).toBe(0);
    expect(
      (await repository.getDreReport(clinicId, "2039-05-01", "2039-05-31"))
        .totals.resultInCents,
    ).toBe(4000);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-02"))
        .totalInflowInCents,
    ).toBe(10000);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-03"))
        .totalOutflowInCents,
    ).toBe(6000);
  });
  it("separates posting, competence, due date, payment and cash availability, auditing corrections", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const [patient] = await repository.listPatients(clinicId),
      headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
      };
    const receivable = await repository.createManualReceivable(
      clinicId,
      actorId,
      {
        patientId: patient!.id,
        description: "Receita de serviço",
        amountInCents: 10000,
        postedOn: "2039-06-01",
        dueDate: "2039-06-15",
        competence: "2039-06",
      },
    );
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: {
        paymentMethod: "card",
        paidAt: "2039-06-05T14:00:00Z",
        availableAt: "2039-06-07T14:00:00Z",
      },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({
      postedOn: "2039-06-01",
      dueDate: "2039-06-15",
      paidAt: "2039-06-05T14:00:00Z",
      cashAvailableAt: "2039-06-07T14:00:00Z",
    });
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalInflowInCents,
    ).toBe(0);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-07"))
        .totalInflowInCents,
    ).toBe(10000);
    const updated = await repository.setFinancialDates(
      clinicId,
      actorId,
      "receivable",
      receivable.id,
      {
        paidAt: "2039-06-06T14:00:00Z",
        availableAt: "2039-06-08T14:00:00Z",
        reason: "Conciliação do extrato",
      },
    );
    expect(updated.createdAt).toBe(receivable.createdAt);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-07"))
        .totalInflowInCents,
    ).toBe(0);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-08"))
        .totalInflowInCents,
    ).toBe(10000);
    expect(
      (
        await repository.listReceivedPayments(
          clinicId,
          "2039-06-01",
          "2039-06-09",
        )
      )[0]?.occurredAt,
    ).toBe("2039-06-06T14:00:00Z");
    await repository.reverseReceivablePayment(clinicId, actorId, receivable.id);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-10"))
        .totalInflowInCents,
    ).toBe(-10000);
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.revenueInCents,
    ).toBe(10000);
    const audit = (await repository.listAdminAuditEvents(clinicId)).find(
      (event) => event.action === "finance.dates_updated",
    );
    expect(audit).toMatchObject({
      clinicId,
      actorUserId: actorId,
      module: "finance",
    });
    expect(audit?.metadata).toMatchObject({
      reason: "Conciliação do extrato",
      previous: { paidAt: "2039-06-05T14:00:00Z" },
    });
  });
  it("keeps paid expenses in the original cash day after reversal and protects unpaid adjustments", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      category = await repository.createFinancialCategory(clinicId, {
        name: "Despesa mensal",
        kind: "expense",
      }),
      center = await repository.createCostCenter(clinicId, {
        name: "Operação",
      });
    const payable = await repository.createPayable(clinicId, actorId, {
      description: "Pagamento de fornecedor",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 7500,
      dueDate: "2039-06-15",
      postedOn: "2039-06-01",
      dreCompetence: "2039-06",
    });
    await expect(
      repository.setFinancialDates(clinicId, actorId, "payable", payable.id, {
        paidAt: "2039-06-05T14:00:00Z",
        dueDate: "2039-07-01",
        reason: "Data inválida",
      }),
    ).rejects.toMatchObject({ code: "FINANCIAL_PAYMENT_REQUIRED" });
    expect(
      (await repository.getFinancialWorkspace(clinicId)).payables.find(
        (item) => item.id === payable.id,
      )?.dueDate,
    ).toBe("2039-06-15");
    await repository.settlePayable(clinicId, actorId, payable.id, "pix", {
      paidAt: "2039-06-05T14:00:00Z",
      availableAt: "2039-06-07T14:00:00Z",
    });
    await repository.reversePayablePayment(clinicId, actorId, payable.id);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-07"))
        .totalOutflowInCents,
    ).toBe(7500);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-10"))
        .totalOutflowInCents,
    ).toBe(-7500);
    await expect(
      repository.setFinancialDates(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        "payable",
        payable.id,
        { reason: "Outra clínica", dueDate: "2039-08-01" },
      ),
    ).rejects.toMatchObject({ code: "FINANCE_ENTRY_NOT_FOUND" });
  });
});
