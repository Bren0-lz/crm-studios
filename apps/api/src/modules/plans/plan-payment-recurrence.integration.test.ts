import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const now = new Date();
const monthStart = (offset: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
const monthEnd = (offset: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))
    .toISOString()
    .slice(0, 10);

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const [patients, services] = await Promise.all([
    app.inject({ method: "GET", url: "/patients", headers }),
    app.inject({ method: "GET", url: "/services", headers }),
  ]);
  const patientId = patients.json()[0].id as string;
  const serviceId = services.json()[0].id as string;
  const plan = (
    paymentParts: {
      paymentMethod: string;
      amountInCents: number;
      installments: number;
      recurring?: boolean;
    }[],
    autoRenew: boolean,
    offset = 0,
  ) =>
    configuredPlan(app, {
      services: [{ serviceId, totalSessions: 8, totalValueInCents: 40000 }],
      patientId,
      serviceId,
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      validFrom: monthStart(offset),
      validUntil: monthEnd(offset),
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: monthStart(offset),
      paymentMethod: paymentParts[0]!.paymentMethod,
      paymentParts,
      autoRenew,
    });
  return { app, headers, patientId, plan };
}

describe("formas de pagamento do plano: só da primeira vez ou recorrente", () => {
  it("exige a marcação em cada forma e uma recorrente na renovação automática", async () => {
    const { app, headers, plan } = await setup();
    const unmarked = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await plan(
        [
          { paymentMethod: "pix", amountInCents: 10000, installments: 1 },
          { paymentMethod: "card", amountInCents: 30000, installments: 1 },
        ],
        false,
      ),
    });
    expect(unmarked.statusCode).toBe(400);
    expect(unmarked.body).toContain("só da primeira vez ou recorrente");

    const noneRecurring = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await plan(
        [
          {
            paymentMethod: "pix",
            amountInCents: 10000,
            installments: 1,
            recurring: false,
          },
          {
            paymentMethod: "card",
            amountInCents: 30000,
            installments: 1,
            recurring: false,
          },
        ],
        true,
      ),
    });
    expect(noneRecurring.statusCode).toBe(400);
    expect(noneRecurring.body).toContain("ao menos uma forma");

    // Sem renovação automática pode; ligar depois exige uma forma recorrente.
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await plan(
        [
          {
            paymentMethod: "pix",
            amountInCents: 10000,
            installments: 1,
            recurring: false,
          },
          {
            paymentMethod: "card",
            amountInCents: 30000,
            installments: 1,
            recurring: false,
          },
        ],
        false,
      ),
    });
    expect(created.statusCode).toBe(201);
    const enable = await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/auto-renew`,
      headers,
      payload: { autoRenew: true },
    });
    expect(enable.statusCode).toBe(400);
    expect(enable.json().code).toBe("AUTO_RENEW_NEEDS_RECURRING_PAYMENT");
    await app.close();
  });

  it("renova só com as formas recorrentes, com o valor cheio", async () => {
    const { app, headers, patientId, plan } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await plan(
        [
          {
            paymentMethod: "pix",
            amountInCents: 10000,
            installments: 1,
            recurring: false,
          },
          {
            paymentMethod: "card",
            amountInCents: 30000,
            installments: 1,
            recurring: true,
          },
        ],
        true,
        -1,
      ),
    });
    expect(created.statusCode).toBe(201);
    const plans = (
      await app.inject({
        method: "GET",
        url: `/plans?patientId=${patientId}`,
        headers,
      })
    ).json() as {
      id: string;
      validFrom: string;
      paymentMethod?: string;
      paymentParts?: unknown[];
    }[];
    const renewed = plans.find((item) => item.validFrom === monthStart(0))!;
    expect(renewed.paymentMethod).toBe("card");
    expect(renewed.paymentParts).toBeUndefined();

    const receivables = (
      await app.inject({ method: "GET", url: "/finance/summary", headers })
    )
      .json()
      .receivables.filter(
        (item: { patientId: string }) => item.patientId === patientId,
      ) as {
      dueDate: string;
      amountInCents: number;
    }[];
    const byMonth = (date: string) =>
      receivables
        .filter((item) => item.dueDate === date)
        .map((item) => item.amountInCents)
        .sort((a, b) => a - b);
    expect(byMonth(monthStart(-1))).toEqual([10000, 30000]);
    expect(byMonth(monthStart(0))).toEqual([40000]);
    await app.close();
  });
});
