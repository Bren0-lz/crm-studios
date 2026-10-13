import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { roleSub, seedRoleUsers } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("denies clinical records to reception profiles", async () => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(),
      logger: false,
    });
    await seedRoleUsers(app);
    const token = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const response = await app.inject({
      method: "GET",
      url: "/clinical-records",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "CLINICAL_ACCESS_DENIED" });
    await app.close();
  });
});
