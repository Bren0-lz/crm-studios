import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

describe("login protection", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    app = await buildApp({
      repository: new MemoryClinicRepository(false),
      logger: false,
    });
  });
  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  const login = (password: string) => ({
    method: "POST" as const,
    url: "/auth/login",
    payload: { email: "admin@movimenta.local", password },
  });

  it("temporarily blocks repeated invalid logins and allows a new attempt after the delay", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let attempt = 0; attempt < 4; attempt++)
      expect((await app.inject(login("Wrong@123"))).statusCode).toBe(401);
    const blocked = await app.inject(login("Wrong@123"));
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe("LOGIN_TEMPORARILY_BLOCKED");
    expect((await app.inject(login("Admin@123"))).statusCode).toBe(429);
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    const allowed = await app.inject(login("Admin@123"));
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      token: expect.any(String),
      user: { role: "admin" },
    });
  });

  it("resets the failed-attempt counter after a successful login", async () => {
    for (let attempt = 0; attempt < 4; attempt++)
      await app.inject(login("Wrong@123"));
    expect((await app.inject(login("Admin@123"))).statusCode).toBe(200);
    expect((await app.inject(login("Wrong@123"))).statusCode).toBe(401);
  });

  it("rejects malformed login payloads without revealing an internal error", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "invalid" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
