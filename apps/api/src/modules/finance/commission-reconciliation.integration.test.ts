import { nextTestCpf } from "../../test-support/cpf.js";
import { sellSessionForAppointment } from "../../test-support/commission-billing.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  commissionAccountBalances,
  type CommissionReconciliationInput,
} from "@crm/contracts";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildApp } from "../../app.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());
async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-06-05T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente conciliação",
      phone: "11988887777",
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
  return {
    repository,
    appointment,
    commission: commission!,
    professional: professional!,
  };
}
async function reconcile(
  repository: MemoryClinicRepository,
  id: string,
  reason = "Correção de presença informada",
) {
  const preview = await repository.getCommissionReconciliationPreview(
      clinicId,
      id,
    ),
    input: CommissionReconciliationInput = {
      idempotencyKey: randomUUID(),
      expectedDigest: preview.digest,
      reason,
    };
  return {
    preview,
    input,
    result: await repository.reconcileCommission(clinicId, actorId, id, input),
  };
}
describe("commission reconciliation", () => {
  it("requires explicit reconciliation and reversal access and checks the confirmed amount atomically", async () => {
    const { repository, appointment, commission, professional } = await setup();
    const app = await buildApp({ repository, logger: false });
    try {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Pagamento sem conciliação",
          email: "commission-payment@test.local",
          password: "Password123",
          role: "user",
          permissions: ["finance.view", "finance.commissions_pay"],
        },
        "unused",
      );
      const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      await repository.settleCommission(clinicId, actorId, commission.id);
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "confirmed",
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/finance/commissions/${commission.id}/reconciliation`,
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      await reconcile(repository, commission.id);
      // O saldo conciliado agora é pago pela folha de pagamento.
      const url = `/finance/commissions/${commission.id}/accounts/${professional.id}/pay`;
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { expectedAmountInCents: -1500 },
          })
        ).json().code,
      ).toBe("COMMISSION_PAID_BY_PAYROLL");
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { expectedAmountInCents: 0 },
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await repository.getCommissionReconciliationPreview(
            clinicId,
            commission.id,
          )
        ).adjustments[0]?.status,
      ).toBe("open");
      expect(
        (await repository.getDailyCash(clinicId, "2039-06-05"))
          .totalOutflowInCents,
      ).toBe(1500);
    } finally {
      await app.close();
    }
  });
  it("compensates an unpaid canceled origin without creating a phantom payout", async () => {
    const { repository, appointment, commission, professional } = await setup();
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "confirmed",
    );
    const { input, result } = await reconcile(repository, commission.id);
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        amountInCents: -1500,
        professionalId: professional.id,
        status: "open",
      }),
    ]);
    expect(
      await repository.reconcileCommission(
        clinicId,
        actorId,
        commission.id,
        input,
      ),
    ).toEqual(result);
    const preview = await repository.getCommissionReconciliationPreview(
      clinicId,
      commission.id,
    );
    expect(preview.changes).toEqual([]);
    expect(
      commissionAccountBalances(preview.commission, preview.adjustments),
    ).toEqual([
      expect.objectContaining({ amountInCents: 0, originalIncluded: true }),
    ]);
    await expect(
      repository.settleCommission(clinicId, actorId, commission.id),
    ).rejects.toMatchObject({ code: "COMMISSION_ACCOUNT_MANAGED" });
    const payment = await repository.settleCommissionAccount(
      clinicId,
      actorId,
      commission.id,
      professional.id,
      0,
    );
    expect(payment.amountInCents).toBe(0);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(0);
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.expensesInCents,
    ).toBe(0);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissionOpenInCents,
    ).toBe(0);
    await expect(
      repository.settleCommissionAccount(
        clinicId,
        actorId,
        commission.id,
        professional.id,
        0,
      ),
    ).rejects.toMatchObject({ code: "COMMISSION_ACCOUNT_SETTLED" });
    await repository.reverseCommissionAccountPayment(
      clinicId,
      actorId,
      payment.id,
    );
    await expect(
      repository.reverseCommissionAccountPayment(clinicId, actorId, payment.id),
    ).rejects.toMatchObject({ code: "COMMISSION_ACCOUNT_PAYMENT_REVERSED" });
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(0);
  });
  it("preserves a paid entry, records a real recovery, and retains the original cash day", async () => {
    const { repository, appointment, commission, professional } = await setup();
    await repository.settleCommission(clinicId, actorId, commission.id);
    const original = (
      await repository.getFinancialWorkspace(clinicId)
    ).commissions.find((item) => item.id === commission.id);
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "confirmed",
    );
    await reconcile(repository, commission.id);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === commission.id,
      ),
    ).toEqual(original);
    expect(
      (await repository.getDreReport(clinicId, "2039-06-01", "2039-06-30"))
        .totals.expensesInCents,
    ).toBe(0);
    const preview = await repository.getCommissionReconciliationPreview(
      clinicId,
      commission.id,
    );
    expect(
      commissionAccountBalances(preview.commission, preview.adjustments)[0]
        ?.amountInCents,
    ).toBe(-1500);
    await expect(
      repository.settleCommissionAccount(
        clinicId,
        actorId,
        commission.id,
        professional.id,
        -1000,
      ),
    ).rejects.toMatchObject({ code: "COMMISSION_ACCOUNT_STALE" });
    await repository.settleCommissionAccount(
      clinicId,
      actorId,
      commission.id,
      professional.id,
      -1500,
    );
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-05"))
        .totalOutflowInCents,
    ).toBe(1500);
    expect(
      (await repository.getDailyCash(clinicId, "2039-06-10"))
        .totalOutflowInCents,
    ).toBe(-1500);
    expect(
      (await repository.getFinancialWorkspace(clinicId))
        .paidCommissionsThisMonthInCents,
    ).toBe(0);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === commission.id,
      ),
    ).toEqual(original);
  });
  it("rejects stale previews and foreign references before writing adjustments", async () => {
    const { repository, appointment, commission } = await setup();
    const preview = await repository.getCommissionReconciliationPreview(
      clinicId,
      commission.id,
    );
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "confirmed",
    );
    await expect(
      repository.reconcileCommission(clinicId, actorId, commission.id, {
        idempotencyKey: randomUUID(),
        reason: "Prévia anterior à correção",
        expectedDigest: preview.digest,
      }),
    ).rejects.toMatchObject({ code: "COMMISSION_RECONCILIATION_STALE" });
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissionAdjustments,
    ).toBeUndefined();
    await expect(
      repository.getCommissionReconciliationPreview(
        randomUUID(),
        commission.id,
      ),
    ).rejects.toMatchObject({ code: "COMMISSION_NOT_FOUND" });
  });
});
