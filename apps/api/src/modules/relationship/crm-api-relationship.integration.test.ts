import { defaultRelationshipSettings } from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("CRM API", () => {
  it("reads relationship settings with defaults and lets only the owner update them", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const initial = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual(defaultRelationshipSettings);

    const updatedSettings = {
      ...defaultRelationshipSettings,
      birthdayDaysAhead: 3,
      planExpiringDays: 10,
      formerClientMinDays: 15,
      formerClientMaxDays: 45,
      messages: {
        ...defaultRelationshipSettings.messages,
        birthday: "Parabéns, {{nome}}!",
      },
    };
    const updated = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: updatedSettings,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual(updatedSettings);
    const reread = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers,
    });
    expect(reread.json()).toEqual(updatedSettings);

    const invalid = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers,
      payload: {
        ...updatedSettings,
        formerClientMinDays: 90,
        formerClientMaxDays: 30,
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const receptionHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId, role: "user" })}`,
    };
    const receptionRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: receptionHeaders,
    });
    expect(receptionRead.statusCode).toBe(200);
    expect(receptionRead.json()).toEqual(updatedSettings);
    const receptionWrite = await app.inject({
      method: "PUT",
      url: "/relationship/settings",
      headers: receptionHeaders,
      payload: defaultRelationshipSettings,
    });
    expect(receptionWrite.statusCode).toBe(403);
    expect(receptionWrite.json()).toMatchObject({
      code: "ADMIN_ACCESS_REQUIRED",
    });

    const physiotherapistRead = await app.inject({
      method: "GET",
      url: "/relationship/settings",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "physiotherapist"), clinicId, role: "user" })}`,
      },
    });
    expect(physiotherapistRead.statusCode).toBe(403);
    expect(physiotherapistRead.json()).toMatchObject({
      code: "COMMERCIAL_ACCESS_DENIED",
    });
    await app.close();
  });

  it("filters satisfaction surveys by the clinic date and defaults to the current month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 31/10 às 23h30 em São Paulo = 01/11 02h30 UTC: conta em outubro.
      vi.setSystemTime(new Date("2026-11-01T02:30:00.000Z"));
      const app = await buildApp({
        repository: new MemoryClinicRepository(),
        logger: false,
      });
      const clinicId = "11111111-1111-4111-8111-111111111111";
      const sub = "22222222-2222-4222-8222-222222222222";
      const headers = () => ({
        authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role: "admin" })}`,
      });
      const list = (query = "") =>
        app.inject({
          method: "GET",
          url: `/satisfaction${query}`,
          headers: headers(),
        });

      const empty = await list();
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({
        from: "2026-10-01",
        to: "2026-10-31",
        surveys: [],
        summary: {
          total: 0,
          promoters: 0,
          passives: 0,
          detractors: 0,
          nps: null,
        },
      });

      for (const score of [9, 10, 7]) {
        const created = await app.inject({
          method: "POST",
          url: "/satisfaction",
          headers: headers(),
          payload: { patientId: "99999999-9999-4999-8999-999999999999", score },
        });
        expect(created.statusCode).toBe(201);
      }
      const october = await list();
      expect(october.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-10-31",
        summary: {
          total: 3,
          promoters: 2,
          passives: 1,
          detractors: 0,
          nps: 67,
        },
      });

      vi.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
      const november = await list();
      expect(november.json()).toMatchObject({
        from: "2026-11-01",
        to: "2026-11-01",
        surveys: [],
        summary: { total: 0, nps: null },
      });

      const explicit = await list("?from=2026-10-31&to=2026-10-31");
      expect(explicit.statusCode).toBe(200);
      expect(explicit.json().summary.total).toBe(3);
      const onlyTo = await list("?to=2026-10-15");
      expect(onlyTo.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-10-15",
        summary: { total: 0 },
      });
      const onlyFrom = await list("?from=2026-10-01");
      expect(onlyFrom.json()).toMatchObject({
        from: "2026-10-01",
        to: "2026-11-01",
        summary: { total: 3 },
      });

      for (const query of [
        "?from=2026-11-01&to=2026-10-01",
        "?from=31/10/2026",
        "?to=2026-13-01",
      ]) {
        const invalid = await list(query);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
