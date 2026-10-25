import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("product sizes", () => {
  it("saves, keeps and clears the sizes of a product", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const fields = {
      name: "Camiseta do estúdio",
      sku: "CAM-01",
      unit: "un",
      costInCents: 2_000,
      salePriceInCents: 5_000,
      minimumStock: 1,
    };
    const created = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: { ...fields, initialStock: 3, sizes: ["gg", "unique", "pp"] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().sizes).toEqual(["pp", "gg", "unique"]);
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
      sizes: ["pp", "gg", "unique"],
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
    expect(cleared.json().sizes).toEqual([]);
    await app.close();
  });
});
