import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaleMovement, SalesPeriodReport } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { roleSub, seedRoleUsers } from "../../test-support/legacy-fixtures.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

describe("clientes sem retorno: contato e histórico de contratações", () => {
  it("traz o telefone na lista e lista tudo o que o cliente já contratou", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    await seedRoleUsers(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente sem retorno",
      phone: "11988887777",
      whatsapp: "11977776666",
      tags: [],
    });
    const other = await repository.createPatient(
      "99999999-9999-4999-8999-999999999999",
      { fullName: "Cliente de outra clínica", phone: "11911112222", tags: [] },
    );
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-05-28T14:00:00Z",
      visitType: "regular",
      notes: "",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Faixa elástica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 500,
      salePriceInCents: 1000,
      initialStock: 10,
      minimumStock: 1,
    });
    const tab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    await repository.addPatientTabItem(clinicId, actorId, tab.id, {
      productId: product.id,
      quantity: 2,
    });
    await repository.closePatientTab(clinicId, actorId, tab.id, {
      settlement: "receivable",
      dueDate: "2039-06-20",
    });

    const report = await app.inject({
      url: "/reports/sales/period?from=2039-06-01&to=2039-06-10",
      headers,
    });
    expect(report.statusCode).toBe(200);
    expect(
      (report.json() as SalesPeriodReport).patientsWithoutReturn,
    ).toMatchObject([
      {
        patientId: patient.id,
        phone: "11988887777",
        whatsapp: "11977776666",
      },
    ]);

    const history = await app.inject({
      url: `/reports/sales/patients/${patient.id}`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json() as SaleMovement[]).toMatchObject([
      {
        patientId: patient.id,
        sourceType: "product",
        kind: "sale",
        itemName: "Faixa elástica",
        quantity: 2,
        amountInCents: 2000,
      },
    ]);

    for (const id of [other.id, "nao-e-uuid"]) {
      const missing = await app.inject({
        url: `/reports/sales/patients/${id}`,
        headers,
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: "PATIENT_NOT_FOUND" });
    }
    const denied = await app.inject({
      url: `/reports/sales/patients/${patient.id}`,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(
      (await app.inject({ url: `/reports/sales/patients/${patient.id}` }))
        .statusCode,
    ).toBe(401);
  });
});
