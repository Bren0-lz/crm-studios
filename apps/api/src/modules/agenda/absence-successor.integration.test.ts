import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildApp } from "../../app.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe("linked absence rescheduling", () => {
  it("keeps the original attendance, creates one linked successor and refuses concurrent duplicates", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente remarcação",
        phone: "11988888888",
        tags: [],
      }),
      [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-05-10T12:00:00Z",
      visitType: "regular",
      notes: "Agendamento original",
    });
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const absence = await app.inject({
      method: "PATCH",
      url: `/appointments/${appointment.id}/status`,
      headers,
      payload: {
        status: "excused_absence",
        absenceReason: "Compromisso familiar",
      },
    });
    expect(absence.statusCode).toBe(200);
    expect(absence.json()).toMatchObject({
      status: "excused_absence",
      absenceReason: "Compromisso familiar",
    });
    const input = {
        professionalId: professional!.id,
        roomId: room!.id,
        startsAt: "2039-05-11T12:00:00Z",
      },
      results = await Promise.all(
        [
          repository.createAbsenceSuccessor(
            clinicId,
            actorId,
            appointment.id,
            input,
          ),
          repository.createAbsenceSuccessor(
            clinicId,
            actorId,
            appointment.id,
            input,
          ),
        ].map((promise) =>
          promise.then(
            (value) => ({ value }),
            (error) => ({ error: error as { code: string } }),
          ),
        ),
      );
    expect(results.filter((item) => "value" in item)).toHaveLength(1);
    expect(results.find((item) => "error" in item)).toMatchObject({
      error: { code: "APPOINTMENT_SUCCESSOR_EXISTS" },
    });
    const appointments = await repository.listAppointments(
      clinicId,
      "2039-05-10T00:00:00Z",
      "2039-05-12T00:00:00Z",
    );
    expect(
      appointments.find((item) => item.id === appointment.id),
    ).toMatchObject({
      status: "excused_absence",
      startsAt: "2039-05-10T12:00:00Z",
      absenceReason: "Compromisso familiar",
    });
    expect(
      appointments.find((item) => item.predecessorId === appointment.id),
    ).toMatchObject({
      status: "scheduled",
      patientId: patient.id,
      notes: "Agendamento original",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/appointments/${appointment.id}/successor`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
  });
});
