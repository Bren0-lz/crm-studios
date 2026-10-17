import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("patient tag categories", () => {
  it("creates, changes and clears the optional category without touching the color", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/patient-tags",
      headers,
      payload: { name: "Mensalidade em atraso", category: "financial" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: "Mensalidade em atraso",
      category: "financial",
    });
    const id = created.json().id as string;
    const invalid = await app.inject({
      method: "PATCH",
      url: `/patient-tags/${id}`,
      headers,
      payload: { category: "outro" },
    });
    expect(invalid.statusCode).toBe(400);
    const status = await app.inject({
      method: "PATCH",
      url: `/patient-tags/${id}`,
      headers,
      payload: { category: "status" },
    });
    expect(status.json()).toMatchObject({ category: "status" });
    const cleared = await app.inject({
      method: "PATCH",
      url: `/patient-tags/${id}`,
      headers,
      payload: { category: null },
    });
    expect(cleared.json()).not.toHaveProperty("category");
    expect(cleared.json().color).toBe(created.json().color);
    await app.close();
  });
});
