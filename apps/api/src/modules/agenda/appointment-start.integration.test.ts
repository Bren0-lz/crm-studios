import type { ClinicalAppointmentOption } from "@crm/contracts";
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
  // 15:00 em São Paulo, domingo 19/06/2039.
  vi.setSystemTime(new Date("2039-06-19T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = () => ({
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  });
  const [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId),
    [patient] = await repository.listPatients(clinicId);
  const base = {
    professionalId: professional!.id,
    roomId: room!.id,
    serviceId: service!.id,
    visitType: "regular" as const,
    notes: "",
  };
  async function appointmentAt(startsAt: string) {
    const created = await repository.createAppointment(clinicId, {
      ...base,
      patientId: patient!.id,
      startsAt,
    });
    return created.id;
  }
  const setStatus = (id: string, status: string, absenceReason?: string) =>
    app.inject({
      method: "PATCH",
      url: `/appointments/${id}/status`,
      headers: headers(),
      payload: { status, ...(absenceReason ? { absenceReason } : {}) },
    });
  const saveRecord = (appointmentId: string) =>
    app.inject({
      method: "POST",
      url: "/clinical-records",
      headers: headers(),
      payload: {
        appointmentId,
        subjective: "Relato",
        objective: "Exame",
        assessment: "Avaliação",
        plan: "Plano",
      },
    });
  return {
    app,
    repository,
    headers,
    base,
    patientId: patient!.id,
    appointmentAt,
    setStatus,
    saveRecord,
  };
}

describe("clinical actions only after the appointment starts", () => {
  it("refuses completed and no-show before start − 15 min, with the release time in the clinic zone", async () => {
    const { setStatus, appointmentAt, repository } = await setup();
    // 26/06 10:00 em São Paulo: libera às 09:45.
    const tomorrow = await appointmentAt("2039-06-26T13:00:00Z");
    for (const [status, reason] of [
      ["completed", undefined],
      ["no_show", "Não compareceu"],
    ] as const) {
      const refused = await setStatus(tomorrow, status, reason);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({
        code: "APPOINTMENT_NOT_STARTED",
        message: "Disponível a partir de 26/06 às 09:45.",
      });
    }
    const [stored] = (
      await repository.listAppointments(
        clinicId,
        "2039-06-26T00:00:00Z",
        "2039-06-27T00:00:00Z",
      )
    ).filter((item) => item.id === tomorrow);
    expect(stored?.status).toBe("scheduled");
    // Confirmar e cancelar continuam livres no futuro.
    expect((await setStatus(tomorrow, "confirmed")).statusCode).toBe(200);
    expect((await setStatus(tomorrow, "cancelled")).statusCode).toBe(200);
  });

  it("accepts the outcome from 15 minutes before the start", async () => {
    const { setStatus, appointmentAt } = await setup();
    // 15:16 em São Paulo: libera às 15:01 (agora são 15:00).
    const at1016 = await appointmentAt("2039-06-19T18:16:00Z");
    expect((await setStatus(at1016, "completed")).statusCode).toBe(409);
    vi.setSystemTime(new Date("2039-06-19T18:01:00Z"));
    const done = await setStatus(at1016, "completed");
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: "completed" });
    const past = await appointmentAt("2039-06-12T13:00:00Z");
    const missed = await setStatus(past, "no_show", "Não compareceu");
    expect(missed.statusCode).toBe(200);
  });

  it("lists and accepts clinical evolutions only for started appointments", async () => {
    const { app, headers, appointmentAt, saveRecord } = await setup();
    const started = await appointmentAt("2039-06-19T18:10:00Z");
    const later = await appointmentAt("2039-06-19T20:00:00Z");
    const options = await app.inject({
      method: "GET",
      url: "/appointments/options?from=2039-06-19T00:00:00Z&to=2039-06-20T00:00:00Z",
      headers: headers(),
    });
    expect(options.statusCode).toBe(200);
    const ids = options
      .json<ClinicalAppointmentOption[]>()
      .map((item) => item.id);
    expect(ids).toContain(started);
    expect(ids).not.toContain(later);

    const refused = await saveRecord(later);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      code: "APPOINTMENT_NOT_STARTED",
      message: "Disponível a partir de 19/06 às 16:45.",
    });
    expect((await saveRecord(started)).statusCode).toBe(201);
  });
});
