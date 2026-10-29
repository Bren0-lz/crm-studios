import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clinicalResourceInputSchema,
  type ClientDetailsReport,
} from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});
describe("client detail reports", () => {
  it("uses encounter dates, training executions and closed sales with identical export filters", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente relatório detalhado",
      phone: "11988887777",
      tags: [],
      city: "Campinas",
      gender: "female",
      interests: ["Pilates"],
    });
    await repository.createPatient("99999999-9999-4999-8999-999999999999", {
      cpf: nextTestCpf(),
      fullName: "Cliente relatório detalhado externo",
      phone: "11988887777",
      tags: [],
      city: "Campinas",
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const create = async (data: unknown) =>
      repository.saveClinicalResource(
        clinicId,
        actorId,
        clinicalResourceInputSchema.parse(data),
      );
    const equipment = await create({
      kind: "equipment",
      name: "Reformer de relatório",
    });
    const exercise = await create({
      kind: "exercise",
      name: "Mobilização de relatório",
      equipmentId: equipment.id,
    });
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-05-31T14:00:00Z",
      visitType: "regular",
      notes: "",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    await create({
      kind: "evolution",
      name: "Evolução de maio criada em junho",
      patientId: patient.id,
      professionalId: professional!.id,
      sourceId: appointment.id,
      sourceType: "appointment",
      format: "text",
      body: "Evolução clínica",
      equipmentIds: [equipment.id],
    });
    const training = await create({
      kind: "training",
      name: "Treino acompanhado",
      patientId: patient.id,
      professionalId: professional!.id,
      validFrom: "2039-06-01",
      exercises: [{ exerciseId: exercise.id, sets: 2, repetitions: "10" }],
    });
    await create({
      kind: "training_execution",
      name: "Execução pela equipe",
      patientId: patient.id,
      trainingId: training.id,
      startedAt: "2039-06-05T14:00:00Z",
    });
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Faixa de relatório",
      sku: "REPORT",
      unit: "un",
      costInCents: 500,
      salePriceInCents: 1000,
      initialStock: 10,
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
    const openTab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient.id,
    });
    await repository.addPatientTabItem(clinicId, actorId, openTab.id, {
      productId: product.id,
      quantity: 3,
    });
    const filters =
      "search=Cliente%20relat%C3%B3rio%20detalhado&city=Campinas&columns=fullName,gender,attendanceCount,equipment,productQuantity,pendingReceivables";
    const may = (
      await app.inject({
        url: `/reports/clients/details?from=2039-05-01&to=2039-05-31&${filters}`,
        headers,
      })
    ).json<ClientDetailsReport>();
    expect(may.rows).toHaveLength(1);
    expect(may.rows[0]!.values).toMatchObject({
      gender: "Feminino",
      attendanceCount: 1,
      equipment: equipment.name,
      productQuantity: 0,
    });
    const path = `?from=2039-06-01&to=2039-06-30&${filters}`;
    const june = (
        await app.inject({ url: `/reports/clients/details${path}`, headers })
      ).json<ClientDetailsReport>(),
      exported = (
        await app.inject({
          url: `/reports/clients/details/export${path}`,
          headers,
        })
      ).json<ClientDetailsReport>();
    expect(june.rows[0]!.values).toMatchObject({
      attendanceCount: 0,
      equipment: equipment.name,
      productQuantity: 2,
      pendingReceivables: 1,
    });
    expect(exported).toEqual(june);
    expect(await repository.listAdminAuditEvents(clinicId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reports.clients_exported",
          actorUserId: actorId,
          module: "reports",
          metadata: expect.objectContaining({ count: 1 }),
        }),
      ]),
    );
    expect(
      await repository.listClinicalAccessEvents(clinicId, patient.id),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "export" })]),
    );
  });
  it("requires explicit financial and clinical access for sensitive filters and columns", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Relatório sem financeiro",
        email: "report-only@test.local",
        password: "Password123",
        role: "user",
        permissions: ["reports.view", "reports.clients"],
      },
      "unused",
    );
    const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
      path = "/reports/clients/details?from=2039-06-01&to=2039-06-30";
    const response = await app.inject({ url: path, headers });
    expect(response.statusCode).toBe(200);
    const data = response.json<ClientDetailsReport>();
    expect(data.availableColumns).not.toContain("pendingReceivables");
    expect(data.availableColumns).not.toContain("equipment");
    expect(
      data.rows.every(
        (row) =>
          !("pendingReceivables" in row.values) && !("equipment" in row.values),
      ),
    ).toBe(true);
    for (const filter of [
      "columns=pendingReceivables",
      "columns=equipment",
      "segment=overdue",
    ])
      expect(
        (await app.inject({ url: `${path}&${filter}`, headers })).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          url: path.replace("/details?", "/details/export?"),
          headers,
        })
      ).statusCode,
    ).toBe(403);
  });
});
