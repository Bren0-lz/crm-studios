import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import { patchStatusAt } from "../../test-support/clock.js";
import "../../test-support/legacy-setup.js";

describe("recurring plan charges", () => {
  it("creates one receivable per cycle and refuses splitting a recurring plan", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const serviceId = services.json()[0].id as string;
    const base = await configuredPlan(app, {
      patientId: patients.json()[0].id as string,
      serviceId,
      name: "Dançaterapia 2x",
      kind: "recurring" as const,
      totalSessions: 8,
      validFrom: "2026-10-01",
      validUntil: "2026-10-31",
      totalValueInCents: 16_000,
      installments: 3,
      firstDueDate: "2026-10-05",
    });
    const split = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: base,
    });
    expect(split.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...base, installments: 1 },
    });
    expect(created.statusCode).toBe(201);
    const finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const receivables = (
      finance.json().summary.receivables as { planId?: string }[]
    ).filter((item) => item.planId === created.json().id);
    expect(receivables).toHaveLength(1);

    const renewal = {
      services: base.services,
      name: base.name,
      validFrom: "2026-11-01",
      validUntil: "2026-11-30",
      totalValueInCents: 16_000,
      installments: 2,
      firstDueDate: "2026-11-05",
    };
    const refused = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: "RECURRING_SINGLE_CHARGE" });
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: { ...renewal, installments: 1 },
    });
    expect(renewed.statusCode).toBe(201);
    await app.close();
  });

  it("computes the prorated first charge from the class on the server", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all(
      ["/patients", "/services", "/professionals", "/rooms"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    const serviceId = services!.json()[0].id as string;
    const plan = await configuredPlan(app, {
      patientId: patients!.json()[0].id as string,
      serviceId,
      name: "Pilates 2x",
      kind: "recurring" as const,
      totalSessions: 8,
      validFrom: "2026-10-01",
      validUntil: "2026-10-31",
      totalValueInCents: 40_000,
      installments: 1,
      firstDueDate: "2026-10-15",
    });
    const receivablesOf = async (planId: string) =>
      (
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        ).json().summary.receivables as {
          planId?: string;
          dueDate: string;
          amountInCents: number;
        }[]
      ).filter((item) => item.planId === planId);

    // Sem turma, o valor enviado pela tela é ignorado: só a mensalidade cheia.
    const withoutGroup = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...plan, proratedChargeInCents: 100 },
    });
    expect(withoutGroup.statusCode).toBe(201);
    expect(await receivablesOf(withoutGroup.json().id)).toMatchObject([
      { dueDate: "2026-10-15", amountInCents: 40_000 },
    ]);

    // Turma de segunda e quarta: o ciclo de 15/09 a 14/10 tem 9 aulas e de 01/10 a 14/10
    // há 4 (5, 7, 12, 14). Pré-pago: 4/9 do valor no início e a mensalidade cheia em 15/10.
    // Às 20h, fora dos atendimentos demo (semeados a partir de hoje): às 7h a turma
    // conflitava com o atendimento demo das segundas e o teste falhava conforme o dia.
    const group = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: {
        capacity: 1,
        serviceId,
        professionalId: professionals!.json()[0].id,
        roomId: rooms!.json()[0].id,
        // Fora dos horários dos atendimentos demo (06:00 a 14:00 conforme o fuso).
        weeklySlots: [
          { weekday: 1, startTime: "20:00", endTime: "21:00" },
          { weekday: 3, startTime: "20:00", endTime: "21:00" },
        ],
      },
    });
    expect(group.statusCode, group.body).toBe(201);
    const purchase = await app.inject({
      method: "POST",
      url: "/plans/purchases",
      headers,
      payload: {
        idempotencyKey: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
        plan: { ...plan, proratedChargeInCents: 100 },
        groupId: group.json().id,
      },
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    const charges = (await receivablesOf(purchase.json().plan.id)).sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate),
    );
    expect(charges).toMatchObject([
      { dueDate: "2026-10-01", amountInCents: 17_778 },
      { dueDate: "2026-10-15", amountInCents: 40_000 },
    ]);
    await app.close();
  });

  it("lets a recurring plan go past its nominal balance, unlike a package", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms] = await Promise.all(
      ["/patients", "/professionals", "/rooms"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    const patientId = patients!.json()[0].id as string;
    const service = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Pilates em dupla",
        durationMinutes: 50,
        priceInCents: 5_000,
        color: "#547A6B",
      },
    });
    const serviceId = service.json().id as string;
    const completeAt = async (startsAt: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId,
          serviceId,
          professionalId: professionals!.json()[0].id,
          roomId: rooms!.json()[0].id,
          startsAt,
          visitType: "regular",
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      return patchStatusAt(app, headers, startsAt, created.json().id, {
        status: "completed",
      });
    };
    const buy = async (kind: "recurring" | "fixed_package", month: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          patientId,
          serviceId,
          name: `Plano ${kind}`,
          kind,
          totalSessions: 1,
          validFrom: `${month}-01`,
          validUntil: `${month}-28`,
          totalValueInCents: 10_000,
          installments: 1,
          firstDueDate: `${month}-01`,
        }),
      });
      expect(created.statusCode, created.body).toBe(201);
      return created.json().id as string;
    };
    const remaining = async (planId: string) =>
      (
        (
          await app.inject({ method: "GET", url: "/plans", headers })
        ).json() as {
          id: string;
          remainingSessions: number;
        }[]
      ).find((item) => item.id === planId)?.remainingSessions;

    // Recorrente com saldo nominal de 1: a 2ª aula do ciclo passa e o saldo fica negativo.
    const recurring = await buy("recurring", "2030-03");
    expect((await completeAt("2030-03-11T13:00:00.000Z")).statusCode).toBe(200);
    expect((await completeAt("2030-03-13T13:00:00.000Z")).statusCode).toBe(200);
    expect(await remaining(recurring)).toBe(-1);

    // Pacote fechado continua bloqueando sem saldo.
    const fixed = await buy("fixed_package", "2030-04");
    expect((await completeAt("2030-04-08T13:00:00.000Z")).statusCode).toBe(200);
    const refused = await completeAt("2030-04-10T13:00:00.000Z");
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "NO_SESSION_BALANCE" });
    expect(await remaining(fixed)).toBe(0);
    await app.close();
  });
});
