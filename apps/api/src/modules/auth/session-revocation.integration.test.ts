import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe("session revocation", () => {
  it("invalidates every old token and accepts a fresh login", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const token = app.jwt.sign({ sub: actorId, clinicId, role: "admin" });
    const headers = { authorization: `Bearer ${token}` };
    expect(
      (await app.inject({ method: "POST", url: "/auth/logout-all", headers }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "GET", url: "/me", headers })).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@movimenta.local", password: "Admin@123" },
    });
    expect(login.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/me",
          headers: { authorization: `Bearer ${login.json().token}` },
        })
      ).statusCode,
    ).toBe(200);
  });
});
