import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { broadcastInputSchema } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { buildBroadcast } from "./broadcast.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});
describe("manual relationship work", () => {
  it("queues birthdays and NPS once, respects preferences, and records only manual completion", async () => {
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
      fullName: "Cliente aniversariante",
      phone: "11988887777",
      birthDate: "1990-06-10",
      tags: [],
    });
    const declined = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente sem autorização",
      phone: "11955554444",
      birthDate: "1990-06-10",
      tags: [],
    });
    await repository.setCommunicationPreference(clinicId, {
      patientId: declined.id,
      channel: "whatsapp",
      allowed: false,
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-06-10T16:00:00Z",
      visitType: "trial",
      notes: "",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const payload = {
      referenceDate: "2039-06-10",
      appointments: false,
      payments: false,
      birthdays: true,
      satisfaction: true,
    };
    const results = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          url: "/communications/reminders/generate",
          headers,
          payload,
        }),
      ),
    );
    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    expect(results.map((result) => result.json().queued).sort()[0]).toBe(0);
    const center = await repository.getCommunicationCenter(clinicId);
    expect(
      center.messages.some((message) => message.patientId === declined.id),
    ).toBe(false);
    expect(results.reduce((sum, result) => sum + result.json().queued, 0)).toBe(
      center.messages.length,
    );
    const messages = center.messages.filter(
      (message) => message.patientId === patient.id,
    );
    expect(messages).toHaveLength(2);
    expect(
      messages.every(
        (message) =>
          message.patientId === patient.id && message.status === "queued",
      ),
    ).toBe(true);
    expect(messages.map((message) => message.kind).sort()).toEqual([
      "birthday_reminder",
      "satisfaction_followup",
    ]);
    const surveyMessage = messages.find(
      (message) => message.kind === "satisfaction_followup",
    )!;
    await repository.completeManualMessage(
      clinicId,
      actorId,
      surveyMessage.id,
      "sent",
    );
    expect(
      (await repository.getCommunicationCenter(clinicId)).messages.find(
        (message) => message.id === surveyMessage.id,
      ),
    ).toMatchObject({ manualCompletion: { actorId, status: "sent" } });
    expect(
      await repository.listSatisfactionSurveys(clinicId, {
        from: "2039-06-01",
        to: "2039-06-30",
      }),
    ).toEqual([]);
    await repository.createSatisfactionSurvey(clinicId, actorId, {
      patientId: patient.id,
      appointmentId: appointment.id,
      sourceMessageId: surveyMessage.id,
      score: 9,
      comment: "Resposta informada à equipe",
    });
    expect(
      (await repository.getCommunicationCenter(clinicId)).messages.find(
        (message) => message.id === surveyMessage.id,
      )?.satisfactionSurveyId,
    ).toBeTruthy();
    await expect(
      repository.createSatisfactionSurvey(clinicId, actorId, {
        patientId: patient.id,
        sourceMessageId: surveyMessage.id,
        score: 8,
      }),
    ).rejects.toMatchObject({ code: "SATISFACTION_DUPLICATE" });
    expect(
      (
        await repository.generateReminders(clinicId, "2039-06-10", {
          appointments: false,
          payments: false,
          satisfaction: true,
        })
      ).queued,
    ).toBe(0);
    expect(
      (
        await repository.generateReminders(
          "99999999-9999-4999-8999-999999999999",
          "2039-06-10",
          payload,
        )
      ).queued,
    ).toBe(0);
  });
  it("uses the same demographic and interest segment for broadcast preview and queuing", async () => {
    const repository = new MemoryClinicRepository();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do segmento",
      phone: "11988887777",
      tags: [],
      city: "Campinas",
      gender: "female",
      interests: ["Pilates"],
      level: "Iniciante",
    });
    await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Outra cidade",
      phone: "11955554444",
      tags: [],
      city: "Santos",
      interests: ["Pilates"],
    });
    const input = broadcastInputSchema.parse({
      segment: {
        city: "Campinas",
        gender: "female",
        interest: "Pilates",
        level: "Iniciante",
      },
      channel: "whatsapp",
      body: "Olá, {{nome}}. Comunicado da equipe.",
    });
    const plan = buildBroadcast(
      await repository.listPatients(clinicId),
      [],
      [],
      input,
      "2039-06-10",
    );
    expect(plan.matched).toBe(1);
    expect(plan.drafts[0]?.patientId).toBe(patient.id);
    expect(await repository.queueBroadcastMessages(clinicId, plan.drafts)).toBe(
      1,
    );
    expect(
      (await repository.getCommunicationCenter(clinicId)).messages[0]?.body,
    ).toBe(plan.drafts[0]?.body);
    await repository.setCommunicationPreference(clinicId, {
      patientId: patient.id,
      channel: "whatsapp",
      allowed: false,
    });
    const before = (await repository.getCommunicationCenter(clinicId)).messages;
    await expect(
      repository.queueBroadcastMessages(clinicId, plan.drafts),
    ).rejects.toMatchObject({ code: "COMMUNICATION_OPT_OUT" });
    expect(
      (await repository.getCommunicationCenter(clinicId)).messages,
    ).toEqual(before);
  });
  it("requires financial access for payment work while allowing birthday work", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Comunicação sem financeiro",
        email: "manual-communications@test.local",
        password: "Password123",
        role: "user",
        permissions: ["communications.view", "communications.reminders"],
      },
      "unused",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/communications/reminders/generate",
          headers,
          payload: { referenceDate: "2039-06-10" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/communications/reminders/generate",
          headers,
          payload: {
            referenceDate: "2039-06-10",
            appointments: false,
            payments: false,
            birthdays: true,
          },
        })
      ).statusCode,
    ).toBe(200);
  });
});
