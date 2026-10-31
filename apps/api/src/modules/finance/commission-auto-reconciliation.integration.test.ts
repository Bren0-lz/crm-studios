import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildApp } from "../../app.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());
async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-01-04T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente conciliação automática",
      phone: "11988887777",
      tags: [],
    }),
    [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId);
  await repository.createCommissionRule(clinicId, {
    professionalId: professional!.id,
    kind: "fixed",
    fixedAmountInCents: 1500,
    percentage: 0,
    effectiveFrom: "2039-01-01",
    serviceId: service!.id,
  });
  const app = await buildApp({ repository, logger: false });
  return {
    repository,
    app,
    patient,
    professional: professional!,
    room: room!,
    service: service!,
    headers: {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    },
  };
}
async function autoReconciliations(
  repository: MemoryClinicRepository,
  commissionId: string,
) {
  return (await repository.listAdminAuditEvents(clinicId)).filter(
    (event) =>
      event.action === "commission.auto_reconciled" &&
      event.entityId === commissionId,
  );
}
describe("automatic commission reconciliation", () => {
  it("adjusts the commission when the appointment stops counting and records who did it and when", async () => {
    const { repository, app, patient, professional, room, service, headers } =
      await setup();
    try {
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patient.id,
        professionalId: professional.id,
        roomId: room.id,
        serviceId: service.id,
        startsAt: "2039-01-04T12:00:00Z",
        visitType: "regular",
        notes: "",
      });
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "completed",
      );
      const [commission] = await repository.generateCommissions(
        clinicId,
        "2039-01",
      );
      vi.setSystemTime(new Date("2039-01-05T15:30:00Z"));
      for (let attempt = 0; attempt < 2; attempt += 1)
        expect(
          (
            await app.inject({
              method: "PATCH",
              url: `/appointments/${appointment.id}/status`,
              headers,
              payload: { status: "confirmed" },
            })
          ).statusCode,
        ).toBe(200);
      const preview = await repository.getCommissionReconciliationPreview(
        clinicId,
        commission!.id,
      );
      expect(preview.changes).toEqual([]);
      expect(preview.commission.amountInCents).toBe(1500);
      expect(preview.reconciliations).toHaveLength(1);
      expect(preview.reconciliations[0]).toMatchObject({
        actorId,
        actorName: "Aryana Dutra",
        createdAt: "2039-01-05T15:30:00.000Z",
        reason: "Conciliação automática: situação do atendimento alterada.",
      });
      expect(preview.adjustments).toMatchObject([
        { amountInCents: -1500, actorId, status: "open" },
      ]);
      const history = await autoReconciliations(repository, commission!.id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        actorUserId: actorId,
        actorName: "Aryana Dutra",
        createdAt: "2039-01-05T15:30:00.000Z",
        module: "finance",
        description:
          "Comissão conciliada automaticamente após mudança na origem",
      });
      const listed = (
        await app.inject({ method: "GET", url: "/admin/audit-events", headers })
      ).json() as { action: string; actorName?: string; createdAt: string }[];
      expect(listed).toContainEqual(
        expect.objectContaining({
          action: "commission.auto_reconciled",
          actorName: "Aryana Dutra",
          createdAt: "2039-01-05T15:30:00.000Z",
        }),
      );
    } finally {
      await app.close();
    }
  });
  it("leaves current commissions untouched", async () => {
    const { repository, app, patient, professional, room, service, headers } =
      await setup();
    try {
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patient.id,
        professionalId: professional.id,
        roomId: room.id,
        serviceId: service.id,
        startsAt: "2039-01-04T12:00:00Z",
        visitType: "regular",
        notes: "",
      });
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "completed",
      );
      const [commission] = await repository.generateCommissions(
        clinicId,
        "2039-01",
      );
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/appointments/${appointment.id}/status`,
            headers,
            payload: { status: "completed" },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        await repository.autoReconcileCommissions(
          clinicId,
          actorId,
          { appointmentIds: [appointment.id] },
          "conferência.",
        ),
      ).toBe(0);
      expect(
        (
          await repository.getCommissionReconciliationPreview(
            clinicId,
            commission!.id,
          )
        ).reconciliations,
      ).toEqual([]);
      expect(await autoReconciliations(repository, commission!.id)).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
