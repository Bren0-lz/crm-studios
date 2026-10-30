import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Product = {
  id: string;
  name: string;
  sku: string;
  salePriceInCents: number | null;
  costInCents: number;
  currentStock: number;
};

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const supplier = await app.inject({
    method: "POST",
    url: "/finance/suppliers",
    headers,
    payload: { name: "Distribuidora Bem-Estar", kind: "company" },
  });
  expect(supplier.statusCode).toBe(201);
  const workspace = async () =>
    (
      await app.inject({ method: "GET", url: "/inventory/workspace", headers })
    ).json<{
      products: Product[];
      movements: { productId: string; kind: string; notes: string }[];
    }>();
  return {
    app,
    headers,
    supplierId: supplier.json<{ id: string }>().id,
    workspace,
  };
}

describe("supplier orders", () => {
  it("records the order, creates the new items without price and stocks everything", async () => {
    const { app, headers, supplierId, workspace } = await setup();
    const existing = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name: "Faixa elástica",
        sku: "FX-1",
        costInCents: 1_000,
        salePriceInCents: 2_500,
        initialStock: 2,
      },
    });
    const existingId = existing.json<{ id: string }>().id;
    const response = await app.inject({
      method: "POST",
      url: `/finance/suppliers/${supplierId}/orders`,
      headers,
      payload: {
        orderedOn: "2026-10-20",
        number: "123",
        totalInCents: 18_000,
        items: [
          { productId: existingId, quantity: 3, unitCostInCents: 1_000 },
          {
            productName: "Óleo de massagem",
            quantity: 5,
            unitCostInCents: 3_000,
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      supplierId,
      orderedOn: "2026-10-20",
      number: "123",
      totalInCents: 18_000,
      items: [
        { productId: existingId, quantity: 3, createdProduct: false },
        {
          productName: "Óleo de massagem",
          quantity: 5,
          unitCostInCents: 3_000,
          createdProduct: true,
        },
      ],
    });
    const data = await workspace();
    const oil = data.products.find((item) => item.name === "Óleo de massagem")!;
    expect(oil).toMatchObject({
      salePriceInCents: null,
      costInCents: 3_000,
      currentStock: 5,
    });
    expect(oil.sku).toMatch(/^PED-/);
    expect(
      data.products.find((item) => item.id === existingId)?.currentStock,
    ).toBe(5);
    expect(data.movements.filter((item) => item.kind === "purchase")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: oil.id,
          notes: "Pedido nº 123 de Distribuidora Bem-Estar",
        }),
      ]),
    );

    // Pedido seguinte com o mesmo nome reaproveita o produto em vez de duplicar.
    const again = await app.inject({
      method: "POST",
      url: `/finance/suppliers/${supplierId}/orders`,
      headers,
      payload: {
        orderedOn: "2026-10-25",
        totalInCents: 6_000,
        items: [{ productName: "óleo de massagem", quantity: 2 }],
      },
    });
    expect(again.statusCode).toBe(201);
    expect(again.json()).toMatchObject({
      items: [{ productId: oil.id, createdProduct: false }],
    });

    const history = await app.inject({
      method: "GET",
      url: `/finance/suppliers/${supplierId}/orders`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(
      history.json<{ orderedOn: string }[]>().map((item) => item.orderedOn),
    ).toEqual(["2026-10-25", "2026-10-20"]);
  });

  it("blocks selling a product until its sale price is set", async () => {
    const { app, headers, supplierId, workspace } = await setup();
    await app.inject({
      method: "POST",
      url: `/finance/suppliers/${supplierId}/orders`,
      headers,
      payload: {
        orderedOn: "2026-10-20",
        totalInCents: 5_000,
        items: [{ productName: "Bola suíça", quantity: 2 }],
      },
    });
    const ball = (await workspace()).products.find(
      (item) => item.name === "Bola suíça",
    )!;
    const patientId = (
      await app.inject({ method: "GET", url: "/patients", headers })
    ).json<{ id: string }[]>()[0]!.id;
    const sale = {
      patientId,
      items: [{ productId: ball.id, quantity: 1, unitPriceInCents: 9_000 }],
      settlement: "paid",
      paymentMethod: "pix",
      dueDate: saoPauloToday(),
    };
    const blocked = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: sale,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "PRODUCT_PRICE_MISSING" });
    expect(
      (await workspace()).products.find((item) => item.id === ball.id)
        ?.currentStock,
    ).toBe(2);

    const tab = await app.inject({
      method: "POST",
      url: "/patient-tabs",
      headers,
      payload: { patientId },
    });
    const tabItem = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json<{ id: string }>().id}/items`,
      headers,
      payload: { productId: ball.id, quantity: 1 },
    });
    expect(tabItem.statusCode).toBe(409);

    const priced = await app.inject({
      method: "PUT",
      url: `/inventory/products/${ball.id}`,
      headers,
      payload: { ...ball, salePriceInCents: 9_000, active: true },
    });
    expect(priced.statusCode).toBe(200);
    const sold = await app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: sale,
    });
    expect(sold.statusCode).toBe(201);
  });

  it("rejects an unknown supplier and an item without product", async () => {
    const { app, headers, supplierId } = await setup();
    const missing = await app.inject({
      method: "POST",
      url: "/finance/suppliers/00000000-0000-4000-8000-000000000000/orders",
      headers,
      payload: {
        orderedOn: "2026-10-20",
        totalInCents: 100,
        items: [{ productName: "Item", quantity: 1 }],
      },
    });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "POST",
      url: `/finance/suppliers/${supplierId}/orders`,
      headers,
      payload: {
        orderedOn: "2026-10-20",
        totalInCents: 100,
        items: [{ quantity: 1 }],
      },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
