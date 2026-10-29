import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type ProductBody = {
  id: string;
  currentStock: number;
  restockAlertAt: number | null;
  lowStock: boolean;
};

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const fields = {
    name: "Faixa elástica",
    sku: "FAIXA-01",
    unit: "un",
    costInCents: 500,
    salePriceInCents: 1_500,
  };
  const product = async (id: string) =>
    (await app.inject({ method: "GET", url: "/inventory/workspace", headers }))
      .json<{ products: ProductBody[]; lowStockCount: number }>()
      .products.find((item) => item.id === id)!;
  const lowStockCount = async () => {
    const today = saoPauloToday();
    return (
      await app.inject({
        method: "GET",
        url: `/reports/management?from=${today}&to=${today}`,
        headers,
      })
    ).json<{ profitability: { operational: { lowStockCount: number } } }>()
      .profitability.operational.lowStockCount;
  };
  return { app, headers, fields, product, lowStockCount };
}

describe("product restock alert", () => {
  it("is optional: without it, only an empty stock asks for restock", async () => {
    const { app, headers, fields, product, lowStockCount } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, initialStock: 1 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      restockAlertAt: null,
      lowStock: false,
    });
    const id = created.json().id as string;
    const baseline = await lowStockCount();

    await app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: {
        productId: id,
        kind: "loss",
        quantity: 1,
        notes: "Rasgou",
      },
    });
    expect(await product(id)).toMatchObject({
      currentStock: 0,
      lowStock: true,
    });
    expect(await lowStockCount()).toBe(baseline + 1);
    await app.close();
  });

  it("asks for restock at the chosen quantity, keeps it on edit and can be turned off", async () => {
    const { app, headers, fields, product, lowStockCount } = await setup();
    const rejected = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, initialStock: 6, restockAlertAt: 0 },
    });
    expect(rejected.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, initialStock: 6, restockAlertAt: 5 },
    });
    expect(created.json()).toMatchObject({
      restockAlertAt: 5,
      lowStock: false,
    });
    const id = created.json().id as string;
    const baseline = await lowStockCount();

    await app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: { productId: id, kind: "loss", quantity: 1, notes: "Rasgou" },
    });
    expect(await product(id)).toMatchObject({
      currentStock: 5,
      lowStock: true,
    });
    expect(await lowStockCount()).toBe(baseline + 1);

    // Edição sem o campo mantém o aviso; `null` desliga.
    const kept = await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, salePriceInCents: 1_800 },
    });
    expect(kept.json()).toMatchObject({ restockAlertAt: 5, lowStock: true });
    const off = await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, restockAlertAt: null },
    });
    expect(off.json()).toMatchObject({ restockAlertAt: null, lowStock: false });
    expect(await lowStockCount()).toBe(baseline);
    await app.close();
  });
});
