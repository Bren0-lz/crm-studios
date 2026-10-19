import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

afterEach(() => vi.useRealTimers());

describe("plan pause", () => {
  it("records reason and expected return, and extends the validity by the paused days on reactivation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        patientId: patients.json()[0].id as string,
        serviceId: services.json()[0].id as string,
        name: "Pilates 2x",
        kind: "fixed_package" as const,
        totalSessions: 8,
        validFrom: "2026-10-01",
        validUntil: "2026-10-31",
        totalValueInCents: 40_000,
        installments: 1,
        firstDueDate: "2026-10-05",
      }),
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const paused = await app.inject({
      method: "PATCH",
      url: `/plans/${id}/status`,
      headers,
      payload: {
        status: "paused",
        pause: { reason: "Viagem", expectedReturn: "2026-10-20" },
      },
    });
    expect(paused.json()).toMatchObject({
      status: "paused",
      pauseReason: "Viagem",
      pauseExpectedReturn: "2026-10-20",
      validUntil: "2026-10-31",
    });
    expect(paused.json().pausedAt).toBeDefined();

    vi.setSystemTime(new Date("2026-10-22T15:00:00.000Z"));
    // 12 dias depois o token anterior expirou: entra de novo.
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@movimenta.local", password: "Admin@123" },
    });
    const resumed = await app.inject({
      method: "PATCH",
      url: `/plans/${id}/status`,
      headers: { authorization: `Bearer ${login.json().token as string}` },
      payload: { status: "active" },
    });
    expect(resumed.json()).toMatchObject({
      status: "active",
      validUntil: "2026-11-12",
    });
    expect(resumed.json()).not.toHaveProperty("pausedAt");
    expect(resumed.json()).not.toHaveProperty("pauseReason");
    await app.close();
  });
});
