import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { atInstant } from "../../test-support/clock.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  return { repository, app, headers };
}
describe("mixed tabs and financial classification", () => {
  it("reserves products, adjusts stock once, closes one charge and requires reversal before cancellation", async () => {
    const { repository, app, headers } = await setup();
    const [patient] = await repository.listPatients(clinicId);
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Faixa terapêutica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 1000,
      salePriceInCents: 2000,
      initialStock: 10,
      minimumStock: 2,
    });
    const tab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient!.id,
    });
    const added = await repository.addPatientTabItem(
      clinicId,
      actorId,
      tab.id,
      { productId: product.id, quantity: 3 },
    );
    const item = added!.items[0]!;
    await repository.updatePatientTabItem(clinicId, actorId, tab.id, item.id, {
      quantity: 2,
      unitPriceInCents: 2500,
    });
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (entry) => entry.id === product.id,
      )?.currentStock,
    ).toBe(8);
    const closed = await repository.closePatientTab(clinicId, actorId, tab.id, {
      settlement: "paid",
      paymentMethod: "pix",
      dueDate: "2039-01-10",
    });
    expect(closed!.totalInCents).toBe(5000);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/patient-tabs/${tab.id}/cancel`,
          headers,
        })
      ).statusCode,
    ).toBe(409);
    await expect(
      repository.updatePatientTabItem(clinicId, actorId, tab.id, item.id, null),
    ).rejects.toMatchObject({ statusCode: 409 });
    await repository.reverseReceivablePayment(
      clinicId,
      actorId,
      closed!.receivableId!,
    );
    await repository.cancelPatientTab(clinicId, actorId, tab.id);
    await expect(
      repository.cancelPatientTab(clinicId, actorId, tab.id),
    ).rejects.toMatchObject({ code: "PATIENT_TAB_ALREADY_CANCELLED" });
    const inventory = await repository.getInventoryWorkspace(clinicId);
    expect(
      inventory.products.find((entry) => entry.id === product.id)?.currentStock,
    ).toBe(10);
    expect(
      inventory.movements
        .filter(
          (entry) =>
            entry.patientTabId === tab.id && entry.kind === "sale_reversal",
        )
        .map((entry) => entry.quantity)
        .sort(),
    ).toEqual([1, 2]);
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables.filter(
        (entry) => entry.id === closed!.receivableId,
      ),
    ).toHaveLength(1);
  });
  it("adds a service in the same operation as scheduling and rolls back a conflicting reservation", async () => {
    const { repository } = await setup();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente avulso",
      phone: "11999999999",
      tags: [],
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const tab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    const input = {
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-02-10T12:00:00.000Z",
      visitType: "regular" as const,
      notes: "",
    };
    const updated = await repository.createPatientTabAppointment(
      clinicId,
      actorId,
      tab.id,
      input,
    );
    expect(updated.services).toHaveLength(1);
    expect(updated.totalInCents).toBe(service!.priceInCents);
    const appointmentId = updated.services![0]!.appointmentId;
    await expect(
      atInstant("2039-02-12T12:00:00Z", () =>
        repository.updateAppointmentStatus(
          clinicId,
          appointmentId,
          "completed",
        ),
      ),
    ).rejects.toMatchObject({ code: "NO_SESSION_BALANCE" });
    await expect(
      repository.createPatientTabAppointment(clinicId, actorId, tab.id, input),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    await expect(
      repository.addPatientTabService(clinicId, actorId, tab.id, {
        appointmentId: updated.services![0]!.appointmentId,
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_ALREADY_BILLED" });
    expect(
      (
        await repository.listAppointments(
          clinicId,
          "2039-02-10T00:00:00Z",
          "2039-02-11T00:00:00Z",
        )
      ).filter((entry) => entry.patientId === patient.id),
    ).toHaveLength(1);
    const closed = await repository.closePatientTab(clinicId, actorId, tab.id, {
      settlement: "receivable",
      dueDate: "2039-02-10",
    });
    const [credit] = await repository.listPatientPlans(clinicId, patient.id);
    expect(credit).toMatchObject({
      sourceTabId: tab.id,
      sourceAppointmentId: appointmentId,
      remainingSessions: 1,
    });
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables.filter(
        (item) => item.patientId === patient.id,
      ),
    ).toHaveLength(1);
    await expect(
      repository.closePatientTab(clinicId, actorId, tab.id, {
        settlement: "receivable",
        dueDate: "2039-02-10",
      }),
    ).rejects.toMatchObject({ code: "PATIENT_TAB_CANNOT_CLOSE" });
    await expect(
      repository.updatePatientPlanStatus(
        clinicId,
        actorId,
        credit!.id,
        "cancelled",
      ),
    ).rejects.toMatchObject({ code: "TAB_PLAN_MANAGED" });
    await atInstant("2039-02-12T12:00:00Z", () =>
      repository.updateAppointmentStatus(clinicId, appointmentId, "completed"),
    );
    await atInstant("2039-02-12T12:00:00Z", () =>
      repository.updateAppointmentStatus(clinicId, appointmentId, "completed"),
    );
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(0);
    await expect(
      repository.cancelPatientTab(clinicId, actorId, tab.id),
    ).rejects.toMatchObject({ code: "TAB_SERVICE_CORRECTION_REQUIRED" });
    await atInstant("2039-02-12T12:00:00Z", () =>
      repository.updateAppointmentStatus(
        clinicId,
        appointmentId,
        "excused_absence",
      ),
    );
    expect(
      (await repository.listPatientPlans(clinicId, patient.id))[0]!
        .remainingSessions,
    ).toBe(1);
    const successor = await repository.createAbsenceSuccessor(
      clinicId,
      actorId,
      appointmentId,
      {
        professionalId: professional!.id,
        roomId: room!.id,
        startsAt: "2039-02-11T12:00:00.000Z",
      },
    );
    await expect(
      atInstant("2039-02-12T12:00:00Z", () =>
        repository.updateAppointmentStatus(
          clinicId,
          appointmentId,
          "completed",
        ),
      ),
    ).rejects.toMatchObject({ code: "NO_SESSION_BALANCE" });
    await atInstant("2039-02-12T12:00:00Z", () =>
      repository.updateAppointmentStatus(clinicId, successor.id, "completed"),
    );
    await atInstant("2039-02-12T12:00:00Z", () =>
      repository.updateAppointmentStatus(clinicId, successor.id, "no_show"),
    );
    const ledger = await repository.listSessionMovements(clinicId, credit!.id);
    expect(ledger.filter((m) => m.quantity < 0)).toHaveLength(2);
    expect(ledger.reduce((total, m) => total + m.quantity, 0)).toBe(1);
    await repository.cancelPatientTab(clinicId, actorId, tab.id);
    expect(
      (await repository.listSessionMovements(clinicId, credit!.id)).reduce(
        (total, m) => total + m.quantity,
        0,
      ),
    ).toBe(0);
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables.find(
        (item) => item.id === closed!.receivableId,
      )?.status,
    ).toBe("cancelled");
  });
  it("uses competence independently of due dates and denies foreign references and unpermitted creation", async () => {
    const { repository, app, headers } = await setup();
    const [patient] = await repository.listPatients(clinicId);
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Serviços internos",
      kind: "income",
    });
    await repository.setCategoryDreGroup(
      clinicId,
      actorId,
      category.id,
      "service_revenue",
    );
    const created = await app.inject({
      method: "POST",
      url: "/finance/receivables",
      headers,
      payload: {
        patientId: patient!.id,
        description: "Lançamento manual",
        amountInCents: 12345,
        dueDate: "2039-04-10",
        competence: "2039-01",
        categoryId: category.id,
      },
    });
    expect(created.statusCode).toBe(201);
    const report = await repository.getDreReport(
      clinicId,
      "2039-01-01",
      "2039-01-31",
    );
    expect(report.totals).toEqual({
      revenueInCents: 12345,
      expensesInCents: 0,
      resultInCents: 12345,
    });
    await expect(
      repository.createManualReceivable(
        "99999999-9999-4999-8999-999999999999",
        actorId,
        {
          patientId: patient!.id,
          description: "De outra clínica",
          amountInCents: 100,
          dueDate: "2039-01-10",
        },
      ),
    ).rejects.toMatchObject({ code: "PATIENT_NOT_FOUND" });
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Leitura financeira",
        email: "finance-read@test.local",
        password: "Password123",
        role: "user",
        permissions: ["finance.view"],
      },
      "unused",
    );
    const forbidden = await app.inject({
      method: "POST",
      url: "/finance/receivables",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
