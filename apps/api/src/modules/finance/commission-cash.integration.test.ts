import { nextTestCpf } from "../../test-support/cpf.js";
import { sellSessionForAppointment } from "../../test-support/commission-billing.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());
describe("commission cash ledger", () => {
  it("preserves the original payout and posts a separate reversal without changing earned cost", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-05T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente comissão caixa",
        phone: "11977778888",
        tags: [],
      }),
      [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createCommissionRule(clinicId, {
      professionalId: professional!.id,
      percentage: 10,
      effectiveFrom: "2039-01-01",
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
    await sellSessionForAppointment(repository, clinicId, actorId, appointment, 15000);
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const [commission] = await repository.generateCommissions(
      clinicId,
      "2039-06",
    );
    expect(commission?.amountInCents).toBe(1500);
    await repository.settleCommission(clinicId, actorId, commission!.id);
    await expect(
      repository.settleCommission(clinicId, actorId, commission!.id),
    ).rejects.toMatchObject({ code: "COMMISSION_NOT_OPEN" });
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(1500);
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    await repository.reverseCommission(clinicId, commission!.id, actorId);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(1500);
    const reversed = await repository.getDailyCash(clinicId, "2039-06-10");
    expect(reversed.totalOutflowInCents).toBe(-1500);
    expect(reversed.movements).toEqual([
      expect.objectContaining({
        kind: "commission",
        amountInCents: -1500,
        description: "Estorno · Comissão 2039-06",
      }),
    ]);
    await expect(
      repository.reverseCommission(clinicId, commission!.id),
    ).rejects.toMatchObject({ code: "COMMISSION_NOT_PAID" });
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.expensesInCents,
    ).toBe(1500);
  });
  it("conciles a linked expense and commission as one cost and one payout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-05T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente comissão despesa",
        phone: "11977778888",
        tags: [],
      }),
      [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createCommissionRule(clinicId, {
      professionalId: professional!.id,
      percentage: 10,
      effectiveFrom: "2039-01-01",
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
    await sellSessionForAppointment(repository, clinicId, actorId, appointment, 15000);
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const [commission] = await repository.generateCommissions(
      clinicId,
      "2039-06",
    );
    const category = await repository.createFinancialCategory(clinicId, {
        name: "Comissões vinculadas",
        kind: "expense",
      }),
      center = await repository.createCostCenter(clinicId, { name: "Equipe" });
    await repository.setCategoryDreGroup(
      clinicId,
      actorId,
      category.id,
      "service_cost",
    );
    const input = {
      description: "Despesa da comissão",
      categoryId: category.id,
      costCenterId: center.id,
      dueDate: "2039-06-05",
      amountInCents: 1500,
      commissionId: commission!.id,
    };
    await expect(
      repository.createPayable(clinicId, actorId, {
        ...input,
        amountInCents: 3000,
      }),
    ).rejects.toMatchObject({ code: "COMMISSION_EXPENSE_INVALID" });
    const payable = await repository.createPayable(clinicId, actorId, input);
    await expect(
      repository.createPayable(clinicId, actorId, input),
    ).rejects.toMatchObject({ code: "COMMISSION_EXPENSE_INVALID" });
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.expensesInCents,
    ).toBe(1500);
    await expect(
      repository.settleCommission(clinicId, actorId, commission!.id),
    ).rejects.toMatchObject({ code: "COMMISSION_EXPENSE_MANAGED" });
    await repository.settlePayable(clinicId, actorId, payable.id, "pix");
    const cash = await repository.getDailyCash(clinicId, "2039-06-05");
    expect(cash.totalOutflowInCents).toBe(1500);
    expect(cash.movements).toHaveLength(1);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === commission!.id,
      )?.status,
    ).toBe("paid");
    await expect(
      repository.reverseCommission(clinicId, commission!.id),
    ).rejects.toMatchObject({ code: "COMMISSION_EXPENSE_MANAGED" });
    await expect(
      repository.classifyFinancialEntry(
        clinicId,
        actorId,
        "payable",
        payable.id,
        { competence: "2039-07" },
      ),
    ).rejects.toMatchObject({ code: "COMMISSION_COMPETENCE_MISMATCH" });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    await repository.reversePayablePayment(clinicId, actorId, payable.id);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === commission!.id,
      )?.status,
    ).toBe("open");
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(1500);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-10"))
        .totalOutflowInCents,
    ).toBe(-1500);
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.expensesInCents,
    ).toBe(1500);
  });
});
