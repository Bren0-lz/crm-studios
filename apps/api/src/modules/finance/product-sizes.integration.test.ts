import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type SizeStock = { size: string | null; currentStock: number };
type ProductBody = {
  id: string;
  sizes: string[];
  sizeStock: SizeStock[];
  currentStock: number;
};

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const patients = await app.inject({
    method: "GET",
    url: "/patients",
    headers,
  });
  const patientId = patients.json()[0].id as string;
  const fields = {
    name: "Camiseta do estúdio",
    sku: "CAM-01",
    unit: "un",
    costInCents: 2_000,
    salePriceInCents: 5_000,
  };
  const product = async (id: string) =>
    (await app.inject({ method: "GET", url: "/inventory/workspace", headers }))
      .json<{ products: ProductBody[] }>()
      .products.find((item) => item.id === id)!;
  const move = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: { notes: "Conferência", quantity: 1, ...payload },
    });
  const sell = (items: Record<string, unknown>[]) =>
    app.inject({
      method: "POST",
      url: "/product-sales",
      headers,
      payload: {
        patientId,
        items,
        settlement: "receivable",
        dueDate: saoPauloToday(),
      },
    });
  return { app, headers, fields, product, move, sell };
}

describe("product sizes", () => {
  it("saves the sizes of a product category and uses them on products", async () => {
    const { app, headers, fields, product } = await setup();
    const category = await app.inject({
      method: "POST",
      url: "/clinic-catalogs/product_category",
      headers,
      payload: { name: "Óleos", sizes: ["250 ml", "500 ml", "1 litro"] },
    });
    expect(category.statusCode).toBe(201);
    expect(category.json().sizes).toEqual(["250 ml", "500 ml", "1 litro"]);
    const repeated = await app.inject({
      method: "POST",
      url: "/clinic-catalogs/product_category",
      headers,
      payload: { name: "Toalhas", sizes: ["Rosto", "rosto"] },
    });
    expect(repeated.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        ...fields,
        categoryId: category.json().id,
        sizes: ["500 ml", "1 litro"],
        initialSizeStock: [{ size: "1 litro", quantity: 2 }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect((await product(created.json().id)).sizeStock).toEqual([
      { size: "500 ml", currentStock: 0 },
      { size: "1 litro", currentStock: 2 },
    ]);
  });

  it("saves, keeps and clears the sizes of a product", async () => {
    const { app, headers, fields } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, sizes: ["gg", "unique", "pp"] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().sizes).toEqual(["gg", "unique", "pp"]);
    const id = created.json().id as string;

    const duplicated = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, sku: "CAM-02", sizes: ["m", "m"] },
    });
    expect(duplicated.statusCode).toBe(400);

    const kept = await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, salePriceInCents: 5_500 },
    });
    expect(kept.json()).toMatchObject({
      salePriceInCents: 5_500,
      sizes: ["gg", "unique", "pp"],
    });

    const changed = await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, sizes: ["baby_look_p", "baby_look_m"] },
    });
    expect(changed.json().sizes).toEqual(["baby_look_p", "baby_look_m"]);

    const cleared = await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, sizes: [] },
    });
    expect(cleared.json()).toMatchObject({ sizes: [], sizeStock: [] });
    await app.close();
  });

  it("keeps stock per size from the initial stock to adjustments", async () => {
    const { app, headers, fields, product, move } = await setup();
    const rejected = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, sizes: ["p", "m"], initialStock: 3 },
    });
    expect(rejected.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        ...fields,
        sizes: ["p", "m", "g"],
        initialSizeStock: [
          { size: "p", quantity: 2 },
          { size: "m", quantity: 5 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<ProductBody>().id;
    expect(created.json<ProductBody>()).toMatchObject({
      currentStock: 7,
      sizeStock: [
        { size: "p", currentStock: 2 },
        { size: "m", currentStock: 5 },
        { size: "g", currentStock: 0 },
      ],
    });

    const withoutSize = await move({ productId: id, kind: "purchase" });
    expect(withoutSize.statusCode).toBe(400);
    expect(withoutSize.json().code).toBe("PRODUCT_SIZE_REQUIRED");
    const otherSize = await move({
      productId: id,
      kind: "purchase",
      size: "gg",
    });
    expect(otherSize.json().code).toBe("PRODUCT_SIZE_INVALID");

    const purchase = await move({
      productId: id,
      kind: "purchase",
      size: "g",
      quantity: 4,
    });
    expect(purchase.statusCode).toBe(201);
    expect(purchase.json()).toMatchObject({
      size: "g",
      quantity: 4,
      balanceAfter: 4,
    });
    const tooMuch = await move({
      productId: id,
      kind: "loss",
      size: "p",
      quantity: 3,
    });
    expect(tooMuch.statusCode).toBe(409);
    expect((await product(id)).currentStock).toBe(11);

    // Tamanho desmarcado com saldo vira sobra: só sai por ajuste.
    await app.inject({
      method: "PUT",
      url: `/inventory/products/${id}`,
      headers,
      payload: { ...fields, sizes: ["m", "g"] },
    });
    expect((await product(id)).sizeStock).toEqual([
      { size: "m", currentStock: 5 },
      { size: "g", currentStock: 4 },
      { size: "p", currentStock: 2 },
    ]);
    expect(
      (await move({ productId: id, kind: "purchase", size: "p" })).statusCode,
    ).toBe(400);
    expect(
      (
        await move({
          productId: id,
          kind: "adjustment_out",
          size: "p",
          quantity: 2,
        })
      ).statusCode,
    ).toBe(201);
    expect(await product(id)).toMatchObject({
      currentStock: 9,
      sizeStock: [
        { size: "m", currentStock: 5 },
        { size: "g", currentStock: 4 },
      ],
    });

    const plain = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, sku: "OLEO", initialStock: 2 },
    });
    expect(plain.json()).toMatchObject({ currentStock: 2, sizeStock: [] });
    expect(
      (
        await move({
          productId: plain.json().id,
          kind: "purchase",
          size: "m",
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });

  it("sets the stock of each size when the product is edited", async () => {
    const { app, headers, fields, product } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, initialStock: 3 },
    });
    const id = created.json<ProductBody>().id;
    const update = (payload: Record<string, unknown>) =>
      app.inject({
        method: "PUT",
        url: `/inventory/products/${id}`,
        headers,
        payload: { ...fields, ...payload },
      });

    // Quantidade de tamanho fora dos tamanhos do produto é recusada sem mudar nada.
    const outside = await update({
      sizes: ["p"],
      sizeQuantities: [{ size: "m", quantity: 2 }],
    });
    expect(outside.statusCode).toBe(400);
    expect((await product(id)).sizes).toEqual([]);

    const sized = await update({
      sizes: ["p", "m"],
      sizeQuantities: [
        { size: "p", quantity: 4 },
        { size: "m", quantity: 1 },
      ],
    });
    expect(sized.statusCode).toBe(200);
    expect(sized.json<ProductBody>()).toMatchObject({
      currentStock: 8,
      sizeStock: [
        { size: "p", currentStock: 4 },
        { size: "m", currentStock: 1 },
        { size: null, currentStock: 3 },
      ],
    });

    const lowered = await update({
      sizes: ["p", "m"],
      sizeQuantities: [{ size: "p", quantity: 1 }],
    });
    expect(lowered.json<ProductBody>()).toMatchObject({ currentStock: 5 });
    const movements = (
      await app.inject({ method: "GET", url: "/inventory/workspace", headers })
    ).json<{
      movements: {
        kind: string;
        size?: string;
        quantity: number;
        balanceAfter: number;
        notes: string;
      }[];
    }>().movements;
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "adjustment_in",
          size: "p",
          quantity: 4,
          balanceAfter: 4,
          notes: "Quantidade ajustada no cadastro do produto",
        }),
        expect.objectContaining({
          kind: "adjustment_in",
          size: "m",
          quantity: 1,
        }),
        expect.objectContaining({
          kind: "adjustment_out",
          size: "p",
          quantity: -3,
          balanceAfter: 1,
        }),
      ]),
    );
    await app.close();
  });

  it("sells by size and returns the size stock when the sale is cancelled", async () => {
    const { app, headers, fields, product, sell } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        ...fields,
        sizes: ["p", "baby_look_m"],
        initialSizeStock: [
          { size: "p", quantity: 3 },
          { size: "baby_look_m", quantity: 1 },
        ],
      },
    });
    const id = created.json<ProductBody>().id;

    const withoutSize = await sell([{ productId: id, quantity: 1 }]);
    expect(withoutSize.json().code).toBe("PRODUCT_SIZE_REQUIRED");
    const beyondSize = await sell([
      { productId: id, size: "baby_look_m", quantity: 2 },
    ]);
    expect(beyondSize.statusCode).toBe(409);

    const sale = await sell([
      { productId: id, size: "p", quantity: 2 },
      { productId: id, size: "baby_look_m", quantity: 1 },
    ]);
    expect(sale.statusCode).toBe(201);
    expect(sale.json().items).toEqual([
      expect.objectContaining({ size: "p", quantity: 2 }),
      expect.objectContaining({ size: "baby_look_m", quantity: 1 }),
    ]);
    expect(await product(id)).toMatchObject({
      currentStock: 1,
      sizeStock: [
        { size: "p", currentStock: 1 },
        { size: "baby_look_m", currentStock: 0 },
      ],
    });

    const cancelled = await app.inject({
      method: "POST",
      url: `/patient-tabs/${sale.json().id}/cancel`,
      headers,
    });
    expect(cancelled.statusCode).toBe(200);
    expect((await product(id)).sizeStock).toEqual([
      { size: "p", currentStock: 3 },
      { size: "baby_look_m", currentStock: 1 },
    ]);
    const workspace = (
      await app.inject({ method: "GET", url: "/inventory/workspace", headers })
    ).json<{
      movements: { kind: string; size?: string; quantity: number }[];
    }>();
    expect(
      workspace.movements.filter((item) => item.kind === "sale_reversal"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ size: "p", quantity: 2 }),
        expect.objectContaining({ size: "baby_look_m", quantity: 1 }),
      ]),
    );
    await app.close();
  });
});
