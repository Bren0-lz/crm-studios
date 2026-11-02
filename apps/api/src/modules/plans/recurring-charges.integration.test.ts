import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
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

    // Sem turma, o valor enviado pela tela é ignorado: vale o valor cheio.
    const withoutGroup = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...plan, firstInstallmentInCents: 100 },
    });
    expect(withoutGroup.statusCode).toBe(201);
    expect(await receivablesOf(withoutGroup.json().id)).toMatchObject([
      { dueDate: "2026-10-15", amountInCents: 40_000 },
    ]);

    // Turma de segunda e quarta: 4 de 8 aulas do ciclo até 15/10 = metade.
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
        plan: { ...plan, firstInstallmentInCents: 100 },
        groupId: group.json().id,
      },
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    expect(await receivablesOf(purchase.json().plan.id)).toMatchObject([
      { dueDate: "2026-10-15", amountInCents: 20_000 },
    ]);
    await app.close();
  });
});
