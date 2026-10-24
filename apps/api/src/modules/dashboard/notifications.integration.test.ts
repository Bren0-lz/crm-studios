import { nextTestCpf } from "../../test-support/cpf.js";
import {
  patientPlanInputSchema,
  type NotificationsSummary,
} from "@crm/contracts";
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
  // 15:00 em São Paulo, 10/06/2039.
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  async function notifications(requestHeaders = headers) {
    const response = await app.inject({
      method: "GET",
      url: "/notifications",
      headers: requestHeaders,
    });
    expect(response.statusCode).toBe(200);
    return response.json<NotificationsSummary>();
  }
  async function userWith(modules: string[]) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Usuária restrita",
        email: `restrita.${modules.join("-") || "nenhum"}@teste.local`,
        role: "user",
        password: "SenhaForte123",
        modules,
        editModules: [],
      },
    });
    expect(created.statusCode).toBe(201);
    return {
      authorization: `Bearer ${app.jwt.sign({
        sub: created.json<{ id: string }>().id,
        clinicId,
        role: "user",
      })}`,
    };
  }
  return { app, repository, headers, notifications, userWith };
}

describe("GET /notifications", () => {
  it("counts today's birthdays, overdue installments and appointments to finalize", async () => {
    const { app, repository, headers, notifications } = await setup();
    const before = await notifications();
    expect(before.date).toBe("2039-06-10");

    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Rita Sino",
          phone: "11955554444",
          birthDate: "1990-06-10",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    // Aniversário amanhã não entra.
    await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Bruno Amanhã",
        phone: "11955553333",
        birthDate: "1990-06-11",
        tags: [],
      },
    });
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Parcela vencida",
      amountInCents: 10000,
      dueDate: "2039-06-01",
    });
    // Vence hoje: ainda não está atrasada.
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Parcela de hoje",
      amountInCents: 10000,
      dueDate: "2039-06-10",
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-06-09T12:00:00Z",
      visitType: "regular",
      notes: "",
    });

    const after = await notifications();
    expect(after).toEqual({
      date: "2039-06-10",
      birthdaysToday: (before.birthdaysToday ?? 0) + 1,
      overdueReceivables: (before.overdueReceivables ?? 0) + 1,
      pendingFinalization: (before.pendingFinalization ?? 0) + 1,
      overdueLeadTasks: before.overdueLeadTasks,
      snoozedContactsDue: before.snoozedContactsDue,
      pauseReturnsDue: before.pauseReturnsDue,
    });

    // Parabéns registrados tiram o aniversariante do sino.
    const congratulated = await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "birthday",
        referenceKey: `${patient.id}:2039`,
        outcome: "contacted",
      },
    });
    expect(congratulated.statusCode).toBe(201);
    expect((await notifications()).birthdaysToday).toBe(
      before.birthdaysToday ?? 0,
    );
  });

  it("reminds the team of scheduled callbacks: lead tasks, snoozed contacts and pause returns", async () => {
    const { app, repository, headers, notifications } = await setup();
    const before = await notifications();

    // Tarefa comercial: só entra depois do horário marcado.
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Retorno",
        phone: "11944443333",
        source: "Instagram",
        interest: "Pilates",
        tags: [],
      },
    });
    expect(lead.statusCode).toBe(201);
    const leadId = lead.json<{ id: string }>().id;
    for (const dueAt of ["2039-06-10T12:00:00Z", "2039-06-11T12:00:00Z"])
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/leads/${leadId}/tasks`,
            headers,
            payload: { title: "Retornar contato", dueAt },
          })
        ).statusCode,
      ).toBe(201);

    // Contato adiado até amanhã: volta para a lista (e para o sino) no dia seguinte.
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Clara Adiada",
          phone: "11944442222",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    const receivable = await repository.createManualReceivable(
      clinicId,
      actorId,
      {
        patientId: patient.id,
        description: "Parcela vencida",
        amountInCents: 10000,
        dueDate: "2039-06-01",
      },
    );
    const snoozed = await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "overdue_payment",
        referenceKey: receivable.id,
        outcome: "snoozed",
        snoozeUntil: "2039-06-11",
      },
    });
    expect(snoozed.statusCode).toBe(201);

    // Plano pausado com retorno previsto para amanhã.
    const [service] = await repository.listServices(clinicId);
    const services = [
      { serviceId: service!.id, totalSessions: 4, totalValueInCents: 400 },
    ];
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Plano com pausa",
      totalValueInCents: 400,
      services,
    });
    const plan = await repository.createPatientPlan(
      clinicId,
      actorId,
      patientPlanInputSchema.parse({
        name: "Plano com pausa",
        patientId: patient.id,
        planTemplateId: template.id,
        kind: "fixed_package",
        services,
        totalValueInCents: 400,
        validFrom: "2039-06-01",
        validUntil: "2039-12-31",
        firstDueDate: "2039-06-01",
        installments: 1,
      }),
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      actorId,
      plan.id,
      "paused",
      { expectedReturn: "2039-06-11" },
    );

    const today = await notifications();
    expect(today.overdueLeadTasks).toBe((before.overdueLeadTasks ?? 0) + 1);
    expect(today.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
    expect(today.pauseReturnsDue).toBe(before.pauseReturnsDue ?? 0);

    vi.setSystemTime(new Date("2039-06-11T18:00:00Z"));
    const tomorrow = await notifications();
    expect(tomorrow.overdueLeadTasks).toBe((before.overdueLeadTasks ?? 0) + 2);
    expect(tomorrow.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
    expect(tomorrow.pauseReturnsDue).toBe((before.pauseReturnsDue ?? 0) + 1);

    vi.setSystemTime(new Date("2039-06-12T18:00:00Z"));
    expect((await notifications()).snoozedContactsDue).toBe(
      (before.snoozedContactsDue ?? 0) + 1,
    );

    // Lead perdido sai do sino; contato registrado tira o cliente da lista.
    const lost = await app.inject({
      method: "PATCH",
      url: `/leads/${leadId}/stage`,
      headers,
      payload: { stage: "lost", lostReason: "Sem interesse" },
    });
    expect(lost.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "overdue_payment",
        referenceKey: receivable.id,
        outcome: "contacted",
      },
    });
    const handled = await notifications();
    expect(handled.overdueLeadTasks).toBe(before.overdueLeadTasks ?? 0);
    expect(handled.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
  });

  it("only returns the groups of the modules the user can see", async () => {
    const { notifications, userWith } = await setup();
    expect(
      Object.keys(await notifications(await userWith(["finance"]))),
    ).toEqual(["date", "overdueReceivables"]);
    expect(
      Object.keys(await notifications(await userWith(["agenda"]))),
    ).toEqual(["date", "pendingFinalization"]);
    expect(
      Object.keys(await notifications(await userWith(["relationship"]))),
    ).toEqual(["date", "birthdaysToday", "snoozedContactsDue"]);
    expect(Object.keys(await notifications(await userWith(["crm"])))).toEqual([
      "date",
      "overdueLeadTasks",
    ]);
    expect(Object.keys(await notifications(await userWith(["plans"])))).toEqual(
      ["date", "pauseReturnsDue"],
    );
    expect(
      Object.keys(await notifications(await userWith(["patients"]))),
    ).toEqual(["date"]);
  });

  it("requires login", async () => {
    const { app } = await setup();
    const response = await app.inject({ method: "GET", url: "/notifications" });
    expect(response.statusCode).toBe(401);
  });
});
