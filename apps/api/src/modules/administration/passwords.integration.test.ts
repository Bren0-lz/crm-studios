import { expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";

it("creates and resets short passwords that can be used to log in", async () => {
  const { app, token } = await authenticatedApp();
  const email = "ana@teste.local";
  const headers = { authorization: `Bearer ${token}` };
  const login = (password: string) =>
    app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: { fullName: "Ana Lima", email, role: "user", password: "Aa1" },
    });
    expect(created.statusCode).toBe(201);
    expect((await login("Aa1")).statusCode).toBe(200);

    const reset = await app.inject({
      method: "POST",
      url: `/admin/users/${created.json().id as string}/reset-password`,
      headers,
      payload: { password: "Bb2" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ updated: true });
    expect((await login("Bb2")).statusCode).toBe(200);
    expect((await login("Aa1")).statusCode).toBe(401);
  } finally {
    await app.close();
  }
});
