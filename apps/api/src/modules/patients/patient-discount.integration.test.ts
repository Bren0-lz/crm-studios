import { nextTestCpf } from "../../test-support/cpf.js";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("client discount", () => {
  it("saves a percentage or amount discount and removes it with null", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const base = {
      cpf: nextTestCpf(),
      fullName: "Cliente com Desconto",
      phone: "11955552222",
      tags: [],
    };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: { ...base, discount: { type: "percentage", percent: 10 } },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    expect(created.json()).toMatchObject({
      discount: { type: "percentage", percent: 10 },
    });

    const kept = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: base,
    });
    expect(kept.json()).toMatchObject({
      discount: { type: "percentage", percent: 10 },
    });

    const amount = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: { ...base, discount: { type: "amount", amountInCents: 3000 } },
    });
    expect(amount.json()).toMatchObject({
      discount: { type: "amount", amountInCents: 3000 },
    });

    const removed = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: { ...base, discount: null },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().discount).toBeNull();
    await app.close();
  });

  it("rejects an invalid discount", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    for (const discount of [
      { type: "percentage", percent: 120 },
      { type: "percentage", percent: 0 },
      { type: "amount", amountInCents: -100 },
      { type: "other", percent: 10 },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Cliente Inválido",
          phone: "11955553333",
          tags: [],
          discount,
        },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});
