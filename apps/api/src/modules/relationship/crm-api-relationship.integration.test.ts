import { defaultRelationshipSettings } from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
  tokenRole,
  type UserRole,
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

  it("lists every birthday of the dashboard window across the new year, congratulated or not", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-28T15:00:00.000Z"));
    try {
      const { app, token } = await authenticatedApp();
      const headers = { authorization: `Bearer ${token}` };
      await seedRoleUsers(app);
      const roleHeaders = (role: UserRole) => ({
        authorization: `Bearer ${app.jwt.sign({
          sub: roleSub(app, role),
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: tokenRole(role),
        })}`,
      });
      const createPatient = async (fullName: string, birthDate: string) =>
        (
          await app.inject({
            method: "POST",
            url: "/patients",
            headers,
            payload: {
              cpf: nextTestCpf(),
              fullName,
              phone: "11955554444",
              whatsapp: "11966665555",
              emergencyContactName: fullName,
              emergencyContactPhone: "11955554444",
              emergencyContactWhatsapp: "11955554444",
              birthDate,
              tags: [],
            },
          })
        ).json() as { id: string };
      const today = await createPatient("Hoje Aniversário", "1990-12-28");
      const january = await createPatient("Janeiro Aniversário", "1980-01-03");
      const outside = await createPatient("Fora Janela", "1980-01-10");
      const ours = [today.id, january.id, outside.id];
      type Entry = {
        patientId: string;
        date: string;
        referenceKey: string;
        congratulated: boolean;
        daysUntil: number;
        detail: string;
        ageTurning: number;
      };
      const upcoming = async (
        requestHeaders: Record<string, string> = headers,
      ) => {
        const response = await app.inject({
          method: "GET",
          url: "/relationship/birthdays/upcoming",
          headers: requestHeaders,
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as Entry[]).filter((entry) =>
          ours.includes(entry.patientId),
        );
      };
      const suggestionKeys = async () =>
        (
          (
            await app.inject({
              method: "GET",
              url: "/relationship/suggestions",
              headers,
            })
          ).json() as { reason: string; referenceKey: string }[]
        )
          .filter((item) => item.reason === "birthday")
          .map((item) => item.referenceKey)
          .filter((key) => ours.includes(key.split(":")[0]!));

      // birthdayDaysAhead padrão = 7: 28/12 até 04/01.
      expect(await upcoming()).toEqual([
        expect.objectContaining({
          patientId: today.id,
          date: "2026-12-28",
          referenceKey: `${today.id}:2026`,
          daysUntil: 0,
          detail: "Aniversário hoje",
          ageTurning: 36,
          congratulated: false,
        }),
        expect.objectContaining({
          patientId: january.id,
          date: "2027-01-03",
          referenceKey: `${january.id}:2027`,
          daysUntil: 6,
          detail: "Aniversário em 6 dias (03/01)",
          ageTurning: 47,
          congratulated: false,
        }),
      ]);
      expect(await upcoming(roleHeaders("reception"))).toHaveLength(2);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/relationship/birthdays/upcoming",
            headers: roleHeaders("physiotherapist"),
          })
        ).statusCode,
      ).toBe(403);

      const record = async (
        patientId: string,
        referenceKey: string,
        outcome: string,
      ) =>
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/relationship/activities",
              headers,
              payload: { patientId, reason: "birthday", referenceKey, outcome },
            })
          ).statusCode,
        ).toBe(201);

      // "Não atendeu" fica no histórico e deixa a sugestão na lista.
      await record(january.id, `${january.id}:2027`, "no_answer");
      expect(await suggestionKeys()).toEqual([
        `${today.id}:2026`,
        `${january.id}:2027`,
      ]);
      const history = (
        await app.inject({
          method: "GET",
          url: `/relationship/activities?patientId=${january.id}`,
          headers,
        })
      ).json() as { outcome: string }[];
      expect(history.map((item) => item.outcome)).toEqual(["no_answer"]);

      // Parabéns enviado: sai das sugestões, mas continua no card marcado.
      await record(today.id, `${today.id}:2026`, "contacted");
      expect(await suggestionKeys()).toEqual([`${january.id}:2027`]);
      expect(
        (await upcoming()).map((entry) => [
          entry.patientId,
          entry.congratulated,
        ]),
      ).toEqual([
        [today.id, true],
        [january.id, false],
      ]);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
