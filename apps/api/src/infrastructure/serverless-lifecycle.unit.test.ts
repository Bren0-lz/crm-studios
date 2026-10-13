import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => {
  const pool = { query: vi.fn(), end: vi.fn() };
  const app = { ready: vi.fn(), addHook: vi.fn(), server: { emit: vi.fn() } };
  return { pool, app, createDatabasePool: vi.fn(), buildApp: vi.fn() };
});

vi.mock("../config.js", () => ({
  config: {
    STORAGE_MODE: "postgres",
    JWT_SECRET: "private-test-secret-with-more-than-32-characters",
    DATABASE_URL: "postgresql://test:test@localhost:5432/crm_test",
  },
}));
vi.mock("../database.js", () => ({
  createDatabasePool: dependencies.createDatabasePool,
}));
vi.mock("../app.js", () => ({ buildApp: dependencies.buildApp }));
vi.mock("../postgres-repository.js", () => ({
  PostgresClinicRepository: class {},
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  dependencies.pool.query.mockResolvedValue({ rows: [{ one: 1 }] });
  dependencies.pool.end.mockResolvedValue(undefined);
  dependencies.app.ready.mockResolvedValue(undefined);
  dependencies.createDatabasePool.mockReturnValue(dependencies.pool);
  dependencies.buildApp.mockResolvedValue(dependencies.app);
});

async function invoke(url?: string) {
  const { default: handler } = await import("./serverless-app.js");
  const req = { ...(url ? { url } : {}) } as IncomingMessage;
  const res = {} as ServerResponse;
  await handler(req, res);
  return { req, res };
}

describe("serverless application lifecycle", () => {
  it("shares startup between concurrent requests and forwards the original HTTP objects", async () => {
    const [first, second] = await Promise.all([
      invoke("/api/patients?search=ana"),
      invoke("/api/health"),
    ]);
    expect(dependencies.createDatabasePool).toHaveBeenCalledTimes(1);
    expect(dependencies.createDatabasePool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 1, idleTimeoutMillis: 5000 }),
    );
    expect(dependencies.buildApp).toHaveBeenCalledTimes(1);
    expect(first.req.url).toBe("/patients?search=ana");
    expect(second.req.url).toBe("/health");
    expect(dependencies.app.server.emit).toHaveBeenCalledWith(
      "request",
      first.req,
      first.res,
    );
  });

  it("closes the database pool when Fastify closes and accepts a missing URL", async () => {
    const { req } = await invoke();
    expect(req.url).toBe("/");
    const [hook, close] = dependencies.app.addHook.mock.calls[0]!;
    expect(hook).toBe("onClose");
    await close();
    expect(dependencies.pool.end).toHaveBeenCalledTimes(1);
  });

  it("closes a failed connection and retries startup on the next request", async () => {
    dependencies.pool.query.mockRejectedValueOnce(
      new Error("connection unavailable"),
    );
    await expect(invoke("/api/health")).rejects.toThrow(
      "connection unavailable",
    );
    expect(dependencies.pool.end).toHaveBeenCalledTimes(1);
    await invoke("/api/health");
    expect(dependencies.createDatabasePool).toHaveBeenCalledTimes(2);
    expect(dependencies.app.server.emit).toHaveBeenCalledTimes(1);
  });

  it("preserves the connection failure even if pool cleanup also fails", async () => {
    dependencies.pool.query.mockRejectedValueOnce("database offline");
    dependencies.pool.end.mockRejectedValueOnce(new Error("cleanup failed"));
    await expect(invoke("/api/health")).rejects.toThrow("database offline");
    expect(dependencies.buildApp).not.toHaveBeenCalled();
  });
});
