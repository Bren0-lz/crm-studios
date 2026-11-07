import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("plan purchase with a full group (TW1/TW3)", () => {
  it("gives the last seat to the first buyer and refuses selling the next one", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all(
      ["/patients", "/services", "/professionals", "/rooms"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    const serviceId = services!.json()[0].id as string;
    const group = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: {
        capacity: 1,
        serviceId,
        professionalId: professionals!.json()[0].id,
        roomId: rooms!.json()[0].id,
        // Fora dos horários dos atendimentos demo.
        weeklySlots: [{ weekday: 0, startTime: "21:00", endTime: "22:00" }],
      },
    });
    expect(group.statusCode, group.body).toBe(201);
    const [firstId, secondId] = (
      patients!.json() as { id: string; status: string }[]
    )
      .filter((patient) => patient.status === "active")
      .map((patient) => patient.id);
    const purchase = async (patientId: string, idempotencyKey: string) =>
      app.inject({
        method: "POST",
        url: "/plans/purchases",
        headers,
        payload: {
          idempotencyKey,
          plan: await configuredPlan(app, {
            patientId,
            serviceId,
            name: `Pilates turma ${idempotencyKey.slice(0, 4)}`,
            kind: "recurring" as const,
            totalSessions: 4,
            validFrom: "2026-10-01",
            validUntil: "2026-10-31",
            totalValueInCents: 20_000,
            installments: 1,
            firstDueDate: "2026-10-15",
          }),
          groupId: group.json().id,
        },
      });

    const first = await purchase(
      firstId!,
      "3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a",
    );
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().enrollment).toMatchObject({
      patientId: firstId,
      status: "active",
    });
    const second = await purchase(
      secondId!,
      "4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b",
    );
    // Sem vaga não há venda: nem plano, nem cobrança, nem matrícula na espera.
    expect(second.statusCode, second.body).toBe(409);
    expect(second.json()).toMatchObject({ code: "GROUP_FULL" });
    const plans = await app.inject({
      method: "GET",
      url: "/plans",
      headers,
    });
    expect(plans.statusCode, plans.body).toBe(200);
    expect(
      (plans.json() as { patientId: string; name: string }[]).filter(
        (plan) =>
          plan.patientId === secondId && plan.name.startsWith("Pilates turma"),
      ),
    ).toEqual([]);
    await app.close();
  });
});
