import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("allows either local frontend address during development", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    const local = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(local.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:5173",
    );
    const external = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://example.com" },
    });
    expect(external.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("authenticates the demo owner", async () => {
    const { app, token } = await authenticatedApp();
    expect(token).toBeTypeOf("string");
    await app.close();
  });
});
