import { describe, expect, it } from "vitest";
import { packageScheduleStarts } from "@crm/contracts";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("single package sold with fixed weekdays", () => {
  it("books every Tuesday of the package and replaces only the missed session", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all(
      ["/patients", "/services", "/professionals", "/rooms"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    const serviceId = services!.json()[0].id as string;
    const professionalId = professionals!.json()[0].id as string;
    const roomId = rooms!.json()[0].id as string;
    const plan = await configuredPlan(app, {
      patientId: patients!.json()[0].id as string,
      serviceId,
      name: "Pacote avulso 10 sessões",
      kind: "single" as const,
      totalSessions: 10,
      validFrom: "2039-03-01",
      totalValueInCents: 100_000,
      installments: 1,
      firstDueDate: "2039-03-01",
    });
    // 2039-03-01 é terça-feira: as 10 terças seguidas, às 09:00 de São Paulo.
    const tuesdays = packageScheduleStarts({
      fromDate: "2039-03-01",
      slots: [{ weekday: 2, time: "09:00" }],
      count: 10,
    }).map((local) => new Date(`${local}:00-03:00`).toISOString());
    expect(tuesdays).toHaveLength(10);
    const purchase = await app.inject({
      method: "POST",
      url: "/plans/purchases",
      headers,
      payload: {
        idempotencyKey: "4c1d2e3f-0a1b-4c2d-8e3f-1a2b3c4d5e6f",
        plan,
        appointments: tuesdays.map((startsAt) => ({
          professionalId,
          roomId,
          serviceId,
          startsAt,
          visitType: "regular",
          notes: "",
        })),
      },
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    const booked = purchase.json().appointments as {
      id: string;
      startsAt: string;
    }[];
    expect(booked.map((item) => item.startsAt).sort()).toEqual(tuesdays);

    // A cliente falta na 3ª terça: só ela vira ausência e ganha a reposição.
    const missed = booked.find((item) => item.startsAt === tuesdays[2])!;
    const absence = await app.inject({
      method: "PATCH",
      url: `/appointments/${missed.id}/status`,
      headers,
      payload: { status: "excused_absence", absenceReason: "Viagem" },
    });
    expect(absence.statusCode, absence.body).toBe(200);
    const makeupStartsAt = new Date("2039-03-17T09:00:00-03:00").toISOString();
    const makeup = await app.inject({
      method: "POST",
      url: `/appointments/${missed.id}/successor`,
      headers,
      payload: { professionalId, roomId, startsAt: makeupStartsAt },
    });
    expect(makeup.statusCode, makeup.body).toBe(201);
    expect(makeup.json()).toMatchObject({
      predecessorId: missed.id,
      startsAt: makeupStartsAt,
      status: "scheduled",
      serviceId,
    });

    const agenda = await app.inject({
      method: "GET",
      url: `/appointments?from=2039-02-28T00:00:00Z&to=2039-05-31T00:00:00Z`,
      headers,
    });
    expect(agenda.statusCode, agenda.body).toBe(200);
    const ofPackage = (
      agenda.json() as { id: string; startsAt: string; status: string }[]
    ).filter(
      (item) =>
        booked.some((entry) => entry.id === item.id) ||
        item.id === makeup.json().id,
    );
    // As outras 9 terças continuam marcadas no mesmo horário.
    expect(
      ofPackage
        .filter((item) => item.status === "scheduled")
        .map((item) => item.startsAt)
        .sort(),
    ).toEqual(
      [...tuesdays.filter((_, index) => index !== 2), makeupStartsAt].sort(),
    );
    expect(ofPackage.find((item) => item.id === missed.id)).toMatchObject({
      status: "excused_absence",
      startsAt: tuesdays[2],
    });
    // A falta não consome sessão: o pacote segue com as 10 para as 10 sessões marcadas.
    const plans = await app.inject({ method: "GET", url: "/plans", headers });
    expect(
      (plans.json() as { id: string; remainingSessions: number }[]).find(
        (item) => item.id === purchase.json().plan.id,
      ),
    ).toMatchObject({ remainingSessions: 10 });
    await app.close();
  });
});
