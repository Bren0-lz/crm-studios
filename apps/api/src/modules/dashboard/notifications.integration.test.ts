import type { NotificationsSummary } from "@crm/contracts";
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

  it("only returns the groups of the modules the user can see", async () => {
    const { notifications, userWith } = await setup();
    expect(Object.keys(await notifications(await userWith(["finance"])))).toEqual(
      ["date", "overdueReceivables"],
    );
    expect(Object.keys(await notifications(await userWith(["agenda"])))).toEqual(
      ["date", "pendingFinalization"],
    );
    expect(
      Object.keys(await notifications(await userWith(["relationship"]))),
    ).toEqual(["date", "birthdaysToday"]);
    expect(Object.keys(await notifications(await userWith(["patients"])))).toEqual(
      ["date"],
    );
  });

  it("requires login", async () => {
    const { app } = await setup();
    const response = await app.inject({ method: "GET", url: "/notifications" });
    expect(response.statusCode).toBe(401);
  });
});
