import { addDaysToIsoDate, saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Receivable = {
  id: string;
  planId?: string;
  description: string;
  dueDate: string;
  amountInCents: number;
  status: string;
  installmentNumber: number;
  paymentMethod?: string;
  paymentInstallments?: number;
};

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const [patients, services] = await Promise.all([
    app.inject({ method: "GET", url: "/patients", headers }),
    app.inject({ method: "GET", url: "/services", headers }),
  ]);
  const patient = patients.json()[0];
  const service = services.json()[0];
  const date = saoPauloToday();
  const plan = await app.inject({
    method: "POST",
    url: "/plans",
    headers,
    payload: await configuredPlan(app, {
      services: [
        { serviceId: service.id, totalSessions: 1, totalValueInCents: 10_000 },
      ],
      patientId: patient.id,
      serviceId: service.id,
      name: "Plano da baixa",
      kind: "fixed_package",
      totalSessions: 1,
      validFrom: date,
      totalValueInCents: 10_000,
      installments: 1,
      firstDueDate: date,
    }),
  });
  expect(plan.statusCode).toBe(201);
  const planId = plan.json().id as string;
  const receivables = async () =>
    (await app.inject({ method: "GET", url: "/finance/workspace", headers }))
      .json<{ summary: { receivables: Receivable[] } }>()
      .summary.receivables.filter((item) => item.planId === planId);
  const inflow = async () =>
    (
      await app.inject({
        method: "GET",
        url: `/finance/daily-cash?date=${date}`,
        headers,
      })
    ).json<{ totalInflowInCents: number }>().totalInflowInCents;
  const revenue = async () =>
    (
      await app.inject({
        method: "GET",
        url: `/reports/dre?from=${date.slice(0, 7)}-01&to=${date}`,
        headers,
      })
    ).json<{ totals: { revenueInCents: number } }>().totals.revenueInCents;
  const [receivable] = await receivables();
  return {
    app,
    headers,
    date,
    receivable: receivable!,
    receivables,
    inflow,
    revenue,
  };
}

describe("receivable settlement with discount, interest and partial payment", () => {
  it("records discount and interest, counts only what was received and restores on reversal", async () => {
    const { app, headers, receivable, receivables, inflow, revenue } =
      await setup();
    const [cashBefore, revenueBefore] = await Promise.all([
      inflow(),
      revenue(),
    ]);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: {
        paymentMethod: "pix",
        discountInCents: 1_000,
        interestInCents: 300,
      },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: "paid", amountInCents: 9_300 });
    expect(await receivables()).toHaveLength(1);
    expect((await inflow()) - cashBefore).toBe(9_300);
    expect((await revenue()) - revenueBefore).toBe(-700);
    const receipt = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivable.id}/receipt`,
      headers,
    });
    expect(receipt.json()).toMatchObject({
      amountInCents: 9_300,
      paymentMethod: "pix",
      discountInCents: 1_000,
      interestInCents: 300,
      clinicName: expect.any(String),
      patientPhone: expect.stringMatching(/^\d{10,11}$/),
    });

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.json()).toMatchObject({
      status: "open",
      amountInCents: 10_000,
    });
    expect(await inflow()).toBe(cashBefore);
    expect(await revenue()).toBe(revenueBefore);
    await app.close();
  });

  it("pays part of the installment and turns the balance into a new installment", async () => {
    const { app, headers, date, receivable, receivables, inflow, revenue } =
      await setup();
    const [cashBefore, revenueBefore] = await Promise.all([
      inflow(),
      revenue(),
    ]);
    const tooMuch = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "cash", receivedInCents: 10_001 },
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.json()).toMatchObject({
      code: "INVALID_SETTLEMENT",
      message: "O valor recebido não pode passar do valor final.",
    });

    const balanceDueDate = addDaysToIsoDate(date, 30);
    const partial = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: {
        paymentMethod: "cash",
        receivedInCents: 4_000,
        balanceDueDate,
      },
    });
    expect(partial.json()).toMatchObject({
      status: "paid",
      amountInCents: 4_000,
    });
    const items = await receivables();
    const balance = items.find((item) => item.id !== receivable.id);
    expect(balance).toMatchObject({
      status: "open",
      amountInCents: 6_000,
      dueDate: balanceDueDate,
      description: `${receivable.description} · saldo`,
      installmentNumber: receivable.installmentNumber + 1,
    });
    expect((await inflow()) - cashBefore).toBe(4_000);
    // Competência: 4.000 pagos + 6.000 em aberto = valor original.
    expect(await revenue()).toBe(revenueBefore);

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.json()).toMatchObject({
      status: "open",
      amountInCents: 4_000,
    });
    expect(
      (await receivables())
        .filter((item) => item.status === "open")
        .reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(10_000);
    await app.close();
  });

  it("checks the installments limit of each payment method in the mix", async () => {
    const { app, headers, receivable, receivables } = await setup();
    const settings = await app.inject({
      method: "PUT",
      url: "/admin/payment-methods",
      headers,
      payload: {
        methods: [
          { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
        ],
      },
    });
    expect(settings.statusCode).toBe(200);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: {
        payments: [
          { paymentMethod: "card", amountInCents: 5_000 },
          {
            paymentMethod: "pix",
            amountInCents: 5_000,
            paymentInstallments: 2,
          },
        ],
      },
    });
    expect(paid.statusCode).toBe(400);
    expect((await receivables()).map((item) => item.status)).toEqual(["open"]);
    await app.close();
  });
});
