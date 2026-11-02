import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Receivable = {
  id: string;
  planId?: string;
  status: string;
  amountInCents: number;
  customerDiscountInCents?: number;
  settlementDiscountInCents?: number;
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
  const monthStart = `${date.slice(0, 7)}-01`;
  const get = async <T>(url: string) =>
    (await app.inject({ method: "GET", url, headers })).json<T>();
  const receivables = async () =>
    (
      await get<{ summary: { receivables: Receivable[] } }>(
        "/finance/workspace",
      )
    ).summary.receivables;
  const dre = () =>
    get<{
      totals: {
        customerDiscountInCents?: number;
        settlementDiscountInCents?: number;
      };
    }>(`/reports/dre?from=${monthStart}&to=${date}`);
  const dailyCash = () =>
    get<{
      totalDiscountInCents?: number;
      movements: { kind: string; discountInCents?: number }[];
    }>(`/finance/daily-cash?date=${date}`);
  return {
    app,
    headers,
    date,
    monthStart,
    patientId: patient.id as string,
    serviceId: service.id as string,
    get,
    receivables,
    dre,
    dailyCash,
  };
}

describe("descontos no Financeiro e nos relatórios", () => {
  it("mostra o desconto na baixa na parcela, no caixa, no extrato, na DRE e nas vendas; o estorno tira", async () => {
    const ctx = await setup();
    const { app, headers, date, monthStart } = ctx;
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          {
            serviceId: ctx.serviceId,
            totalSessions: 1,
            totalValueInCents: 10_000,
          },
        ],
        patientId: ctx.patientId,
        serviceId: ctx.serviceId,
        name: "Plano com desconto na baixa",
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
    const receivable = (await ctx.receivables()).find(
      (item) => item.planId === planId,
    )!;
    const [dreBefore, cashBefore] = await Promise.all([
      ctx.dre(),
      ctx.dailyCash(),
    ]);

    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "pix", discountInCents: 1_500 },
    });
    expect(paid.statusCode).toBe(200);
    expect(
      (await ctx.receivables()).find((item) => item.id === receivable.id),
    ).toMatchObject({
      status: "paid",
      amountInCents: 8_500,
      settlementDiscountInCents: 1_500,
    });
    const cash = await ctx.dailyCash();
    expect(
      (cash.totalDiscountInCents ?? 0) - (cashBefore.totalDiscountInCents ?? 0),
    ).toBe(1_500);
    expect(
      cash.movements.filter((item) => item.discountInCents === 1_500),
    ).toHaveLength(1);
    expect(
      ((await ctx.dre()).totals.settlementDiscountInCents ?? 0) -
        (dreBefore.totals.settlementDiscountInCents ?? 0),
    ).toBe(1_500);
    const financial = await ctx.get<{
      entries: { id: string; discountInCents?: number }[];
    }>(`/reports/financial?from=${monthStart}&to=${date}`);
    expect(
      financial.entries.filter((item) => item.discountInCents === 1_500),
    ).toHaveLength(1);
    const sales = await ctx.get<{
      summary: { settlementDiscountInCents?: number };
    }>(`/reports/sales/period?from=${date}&to=${date}`);
    expect(sales.summary.settlementDiscountInCents).toBe(1_500);

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/reverse`,
      headers,
    });
    expect(reversed.statusCode).toBe(200);
    const after = (await ctx.receivables()).find(
      (item) => item.id === receivable.id,
    )!;
    expect(after.status).toBe("open");
    expect(after.settlementDiscountInCents).toBeUndefined();
    expect((await ctx.dre()).totals.settlementDiscountInCents ?? 0).toBe(
      dreBefore.totals.settlementDiscountInCents ?? 0,
    );
    await app.close();
  });

  it("grava o desconto da venda de produtos na cobrança e o rateia entre os produtos", async () => {
    const ctx = await setup();
    const { app, headers, date } = ctx;
    const product = async (sku: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/inventory/products",
        headers,
        payload: {
          name: `Produto ${sku}`,
          sku,
          unit: "un",
          costInCents: 1_000,
          salePriceInCents: 4_000,
          initialStock: 5,
        },
      });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    };
    const [cream, oil] = await Promise.all([
      product("DSC-1"),
      product("DSC-2"),
    ]);
    const dreBefore = await ctx.dre();
    // Preço cheio 4.000 + 2 × 4.000 = 12.000; com 1.200 de desconto, cobra 10.800.
    const sale = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId: ctx.patientId,
        items: [
          { productId: cream, quantity: 1, unitPriceInCents: 3_600 },
          { productId: oil, quantity: 2, unitPriceInCents: 3_600 },
        ],
        settlement: "paid",
        paymentMethod: "pix",
        dueDate: date,
        discountInCents: 1_200,
      },
    });
    expect(sale.statusCode, sale.body).toBe(201);
    const receivableId = sale.json().receivableId as string;
    expect(
      (await ctx.receivables()).find((item) => item.id === receivableId),
    ).toMatchObject({ amountInCents: 10_800, customerDiscountInCents: 1_200 });
    expect(
      ((await ctx.dre()).totals.customerDiscountInCents ?? 0) -
        (dreBefore.totals.customerDiscountInCents ?? 0),
    ).toBe(1_200);
    const report = await ctx.get<{
      summary: { customerDiscountInCents?: number };
      sales: {
        sourceType: string;
        kind: string;
        receivableId?: string;
        amountInCents: number;
        customerDiscountInCents?: number;
      }[];
    }>(`/reports/sales/period?from=${date}&to=${date}`);
    const lines = report.sales.filter(
      (item) => item.kind === "sale" && item.receivableId === receivableId,
    );
    expect(
      lines.map((item) => [item.amountInCents, item.customerDiscountInCents]),
    ).toEqual(
      expect.arrayContaining([
        [3_600, 400],
        [7_200, 800],
      ]),
    );
    expect(report.summary.customerDiscountInCents).toBeGreaterThanOrEqual(
      1_200,
    );
    await app.close();
  });
});
