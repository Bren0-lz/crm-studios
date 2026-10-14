import { randomUUID } from "node:crypto";
import {
  professionalInputSchema,
  commissionAccountBalances,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());
async function setup(balance = 2) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-01-01T12:00:00Z"));
  const repository = new MemoryClinicRepository();
  const [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId);
  const patient = await repository.createPatient(clinicId, {
    fullName: "Cliente turma",
    phone: "11988887777",
    tags: [],
  });
  const group = await repository.createGroupClass(clinicId, {
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 1,
    weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  });
  await repository.createGroupEnrollment(clinicId, {
    groupId: group.id,
    patientId: patient.id,
  });
  const template = await repository.createPlanTemplate(clinicId, actorId, {
    name: "Pacote turma",
    totalValueInCents: 20000,
    services: [
      {
        serviceId: service!.id,
        totalSessions: balance,
        totalValueInCents: 20000,
      },
    ],
    planType: null,
    kind: "custom",
  });
  const plan = await repository.createPatientPlan(clinicId, actorId, {
    patientId: patient.id,
    planTemplateId: template.id,
    name: "Pacote turma",
    kind: "custom",
    services: [
      {
        serviceId: service!.id,
        totalSessions: balance,
        totalValueInCents: 20000,
      },
    ],
    totalValueInCents: 20000,
    installments: 1,
    firstDueDate: "2039-01-01",
    validFrom: "2039-01-01",
    validUntil: "2039-12-31",
    autoRenew: false,
  });
  const workspace = await repository.getGroupWorkspace(
    clinicId,
    "2039-01-01T00:00:00Z",
    "2039-03-01T00:00:00Z",
  );
  return {
    repository,
    patient,
    plan,
    sessions: workspace.sessions.filter((item) => item.groupId === group.id),
  };
}
describe("group session accounting", () => {
  it("consumes once, reverses corrections and refuses attendance without balance", async () => {
    const { repository, patient, plan, sessions } = await setup(1);
    const first = sessions[0]!,
      second = sessions[1]!;
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      first.id,
      patient.id,
      { status: "present" },
    );
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      first.id,
      patient.id,
      { status: "present" },
    );
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(0);
    await expect(
      repository.recordGroupAttendance(
        clinicId,
        actorId,
        second.id,
        patient.id,
        { status: "present" },
      ),
    ).rejects.toMatchObject({ code: "NO_SESSION_BALANCE" });
    expect(
      (
        await repository.getGroupWorkspace(
          clinicId,
          "2039-01-01T00:00:00Z",
          "2039-03-01T00:00:00Z",
        )
      ).attendance.filter((item) => item.sessionId === second.id),
    ).toEqual([]);
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      first.id,
      patient.id,
      { status: "absent" },
    );
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      first.id,
      patient.id,
      { status: "present" },
    );
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      first.id,
      patient.id,
      { status: "absent" },
    );
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(1);
    expect(
      (await repository.listSessionMovements(clinicId, plan.id))
        .filter((item) => item.groupAttendanceId)
        .reduce((total, item) => total + item.quantity, 0),
    ).toBe(0);
  });
  it("reserves without charging and releases the same credit on a justified replacement absence", async () => {
    const { repository, patient, plan, sessions } = await setup();
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      sessions[0]!.id,
      patient.id,
      { status: "excused_absence" },
    );
    let workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-03-01T00:00:00Z",
    );
    const credit = workspace.replacementCredits.find(
      (item) => item.patientId === patient.id,
    )!;
    const booked = await repository.bookReplacement(clinicId, actorId, {
      creditId: credit.id,
      sessionId: sessions[1]!.id,
    });
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(2);
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credit.id,
        sessionId: sessions[2]!.id,
      }),
    ).rejects.toMatchObject({ code: "REPLACEMENT_NOT_AVAILABLE" });
    await repository.recordReplacementAttendance(
      clinicId,
      actorId,
      booked.attendance.id,
      "excused_absence",
    );
    workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-03-01T00:00:00Z",
    );
    expect(
      workspace.replacementCredits.find((item) => item.id === credit.id)
        ?.status,
    ).toBe("available");
    expect(
      workspace.replacementCredits.filter(
        (item) => item.patientId === patient.id,
      ),
    ).toHaveLength(1);
    const rebooked = await repository.bookReplacement(clinicId, actorId, {
      creditId: credit.id,
      sessionId: sessions[2]!.id,
    });
    await repository.recordReplacementAttendance(
      clinicId,
      actorId,
      rebooked.attendance.id,
      "present",
    );
    await repository.recordReplacementAttendance(
      clinicId,
      actorId,
      rebooked.attendance.id,
      "present",
    );
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(1);
    expect(
      (await repository.listSessionMovements(clinicId, plan.id))
        .filter((item) => item.groupAttendanceId)
        .reduce((total, item) => total + item.quantity, 0),
    ).toBe(-1);
  });
  it("isolates attendance in another clinic", async () => {
    const { repository, patient, sessions } = await setup();
    await expect(
      repository.recordGroupAttendance(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        sessions[0]!.id,
        patient.id,
        { status: "present" },
      ),
    ).rejects.toMatchObject({ code: "GROUP_SESSION_NOT_FOUND" });
  });
  it("does not recalculate or debit historical attendance while correcting its status", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-01-15T18:00:00Z"));
    const repository = new MemoryClinicRepository(true);
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2038-12-01T00:00:00Z",
      "2039-02-01T00:00:00Z",
    );
    const legacy = workspace.attendance.find(
      (item) =>
        item.status === "present" &&
        !item.accountingEnabled &&
        workspace.enrollments.some(
          (enrollment) =>
            enrollment.patientId === item.patientId &&
            enrollment.status === "active" &&
            workspace.sessions.some(
              (session) =>
                session.id === item.sessionId &&
                session.groupId === enrollment.groupId,
            ),
        ),
    );
    expect(legacy).toBeDefined();
    const plans = (await repository.listPatientPlans(clinicId)).filter(
      (item) => item.patientId === legacy!.patientId,
    );
    expect(plans.length).toBeGreaterThan(0);
    const ledger = await Promise.all(
      plans.map((plan) => repository.listSessionMovements(clinicId, plan.id)),
    );
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      legacy!.sessionId,
      legacy!.patientId,
      { status: "absent" },
    );
    const restored = await repository.recordGroupAttendance(
      clinicId,
      actorId,
      legacy!.sessionId,
      legacy!.patientId,
      { status: "present" },
    );
    expect(restored.id).toBe(legacy!.id);
    expect(restored.accountingEnabled).not.toBe(true);
    expect(
      (await repository.listPatientPlans(clinicId)).filter(
        (item) => item.patientId === legacy!.patientId,
      ),
    ).toEqual(plans);
    expect(
      await Promise.all(
        plans.map((plan) => repository.listSessionMovements(clinicId, plan.id)),
      ),
    ).toEqual(ledger);
  });
  it("generates one frozen commission for a presence with user and service precedence", async () => {
    const { repository, patient, plan, sessions } = await setup(3);
    const session = sessions[0]!,
      serviceId = plan.services[0]!.serviceId;
    await repository.createCommissionRule(clinicId, {
      professionalId: session.professionalId,
      percentage: 20,
      effectiveFrom: "2039-01-01",
    });
    await repository.createCommissionRule(clinicId, {
      professionalId: session.professionalId,
      percentage: 70,
      serviceId,
      effectiveFrom: "2039-01-01",
    });
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      session.id,
      patient.id,
      { status: "present" },
    );
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Equipe turma",
        email: "group-commission@test.local",
        password: "Password123",
        role: "user",
        permissions: ["groups.view"],
      },
      "unused",
    );
    await repository.setAdminUserProfessional(
      clinicId,
      actorId,
      user.id,
      session.professionalId,
    );
    await repository.setAdminUserCommission(clinicId, actorId, user.id, {
      percentage: 30,
      effectiveFrom: "2039-01-01",
    });
    await repository.setAdminUserCommission(clinicId, actorId, user.id, {
      kind: "fixed",
      percentage: 0,
      fixedAmountInCents: 1500,
      serviceId,
      effectiveFrom: "2039-01-01",
    });
    const first = await repository.generateCommissions(clinicId, "2039-01"),
      entry = first.find(
        (item) =>
          item.groupAttendanceId &&
          item.professionalId === session.professionalId,
      )!;
    expect(entry).toMatchObject({
      sourceType: "group_attendance",
      amountInCents: 1500,
      ruleSnapshot: { kind: "fixed", serviceId, fixedAmountInCents: 1500 },
    });
    await repository.settleCommission(clinicId, actorId, entry.id);
    await repository.setAdminUserCommission(clinicId, actorId, user.id, {
      kind: "fixed",
      percentage: 0,
      fixedAmountInCents: 2000,
      serviceId,
      effectiveFrom: "2039-01-02",
    });
    const second = await repository.generateCommissions(clinicId, "2039-01");
    expect(second.filter((item) => item.id === entry.id)).toEqual([
      expect.objectContaining({ status: "paid", amountInCents: 1500 }),
    ]);
    expect(second).toHaveLength(first.length);
    const comparison = await repository.getCommissionReconciliationPreview(
      clinicId,
      entry.id,
    );
    expect(comparison.changes).toEqual([
      expect.objectContaining({ amountInCents: 500 }),
    ]);
    await repository.reconcileCommission(clinicId, actorId, entry.id, {
      idempotencyKey: randomUUID(),
      expectedDigest: comparison.digest,
      reason: "Revisão da regra após o pagamento",
    });
    const substitute = await repository.createProfessional(
      clinicId,
      professionalInputSchema.parse({
        fullName: "Profissional de conciliação",
        specialty: "Pilates",
        crefito: "TEST-12345",
        color: "#a855f7",
      }),
    );
    await repository.createCommissionRule(clinicId, {
      professionalId: substitute.id,
      kind: "fixed",
      percentage: 0,
      fixedAmountInCents: 1800,
      serviceId,
      effectiveFrom: "2039-01-01",
    });
    await repository.updateGroupSessionProfessional(
      clinicId,
      actorId,
      session.id,
      substitute.id,
    );
    const moved = await repository.getCommissionReconciliationPreview(
      clinicId,
      entry.id,
    );
    expect(moved.expected?.professionalId).toBe(substitute.id);
    await repository.reconcileCommission(clinicId, actorId, entry.id, {
      idempotencyKey: randomUUID(),
      expectedDigest: moved.digest,
      reason: "Substituição do profissional do encontro",
    });
    const revised = await repository.getCommissionReconciliationPreview(
        clinicId,
        entry.id,
      ),
      balances = commissionAccountBalances(
        revised.commission,
        revised.adjustments,
      );
    expect(balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          professionalId: entry.professionalId,
          amountInCents: -1500,
        }),
        expect.objectContaining({
          professionalId: substitute.id,
          amountInCents: 1800,
        }),
      ]),
    );
    await repository.settleCommissionAccount(
      clinicId,
      actorId,
      entry.id,
      entry.professionalId,
      -1500,
    );
    await repository.settleCommissionAccount(
      clinicId,
      actorId,
      entry.id,
      substitute.id,
      1800,
    );
    expect(
      (await repository.getDailyCash(clinicId, "2039-01-01"))
        .totalOutflowInCents,
    ).toBe(1800);
    expect(
      (await repository.getDreReport(clinicId, "2039-01-01", "2039-01-31"))
        .totals.expensesInCents,
    ).toBe(1800);
    expect(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === entry.id,
      ),
    ).toMatchObject({
      professionalId: entry.professionalId,
      amountInCents: 1500,
      status: "paid",
      ruleSnapshot: { fixedAmountInCents: 1500 },
    });

    await expect(
      repository.setAdminUserCommission(clinicId, actorId, user.id, {
        kind: "fixed",
        percentage: 0,
        fixedAmountInCents: 2500,
        serviceId,
        effectiveFrom: "2039-01-01",
      }),
    ).rejects.toMatchObject({ code: "COMMISSION_RULE_DUPLICATE" });
  });
});
