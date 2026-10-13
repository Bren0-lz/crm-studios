import type { AdminAuditEvent, AdminAuditPage } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());

describe("audit history", () => {
  it("records successful commands without their bodies and filters on the server", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
    };
    try {
      const create = await app.inject({
        method: "POST",
        url: "/rooms",
        headers,
        payload: {
          name: "Sala de teste",
          capacity: 2,
          secret: "BODY_MUST_NOT_BE_LOGGED",
        },
      });
      expect(create.statusCode).toBe(201);
      const query = `/history/audit-events?module=agenda&action=operation.agenda.rooms_create&actorUserId=${ownerId}&search=sala`;
      const page = (
        await app.inject({ url: query, headers })
      ).json<AdminAuditPage>();
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        actorUserId: ownerId,
        module: "agenda",
        action: "operation.agenda.rooms_create",
      });
      expect(JSON.stringify(page)).not.toContain("BODY_MUST_NOT_BE_LOGGED");
      expect(
        (
          await app.inject({
            url: `${query}&from=2000-01-01&to=2000-01-01`,
            headers,
          })
        ).json<AdminAuditPage>().items,
      ).toEqual([]);
      const count = (await repository.listAdminAuditEvents(clinicId)).length;
      await app.inject({ url: query, headers });
      await app.inject({ method: "POST", url: "/rooms", headers, payload: {} });
      expect((await repository.listAdminAuditEvents(clinicId)).length).toBe(
        count,
      );
      for (const filter of [
        "from=not-a-date",
        "from=2026-10-10&to=2026-10-01",
        `search=${"x".repeat(161)}`,
        "actorUserId=invalid",
        "module=invalid",
      ])
        expect(
          (
            await app.inject({
              url: `/history/audit-events?${filter}`,
              headers,
            })
          ).statusCode,
        ).toBe(400);
      const actors = (
        await app.inject({ url: "/history/actors", headers })
      ).json<Array<{ id: string; name: string }>>();
      expect(actors).toContainEqual({ id: ownerId, name: "Aryana Dutra" });
      expect(JSON.stringify(actors)).not.toContain("password");
    } finally {
      await app.close();
    }
  });

  it("protects clinical identifiers and details in both history routes and search", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    try {
      const patientId = randomUUID();
      await repository.recordAdminAuditEvent(
        clinicId,
        ownerId,
        "clinical.access.read",
        "workspace",
        { patientId },
      );
      const user = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "History Viewer",
          email: "historyclinical@test.local",
          role: "user",
          password: "Password123",
          permissions: ["history.view"],
        },
        "unused-hash",
      );
      const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      for (const url of ["/history/audit-events", "/admin/audit-events"]) {
        const response = await app.inject({ url, headers });
        const body = response.json<AdminAuditPage | AdminAuditEvent[]>();
        const events = Array.isArray(body) ? body : body.items;
        const clinical = events.find(
          (event) => event.action === "clinical.access.read",
        )!;
        expect(clinical).toMatchObject({
          detailsRestricted: true,
          metadata: {},
        });
        expect(JSON.stringify(clinical)).not.toContain(patientId);
      }
      expect(
        (
          await app.inject({
            url: `/history/audit-events?search=${patientId}`,
            headers,
          })
        ).json<AdminAuditPage>().items,
      ).toEqual([]);
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        active: true,
        role: "user",
        permissions: ["history.view", "clinical.view"],
      });
      let page = (
        await app.inject({
          url: "/history/audit-events?module=clinical",
          headers,
        })
      ).json<AdminAuditPage>();
      expect(
        page.items.find((event) => event.action === "clinical.access.read"),
      ).toHaveProperty("detailsRestricted", true);
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        active: true,
        role: "user",
        permissions: [
          "history.view",
          "clinical.view",
          "clinical.access_events",
        ],
      });
      page = (
        await app.inject({
          url: "/history/audit-events?module=clinical",
          headers,
        })
      ).json<AdminAuditPage>();
      expect(
        page.items.find((event) => event.action === "clinical.access.read")
          ?.metadata,
      ).toMatchObject({ patientId });
    } finally {
      await app.close();
    }
  });

  it("protects both routes and applies grants and revocations without a new login", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    try {
      const user = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "History Reader",
          email: "history@test.local",
          role: "user",
          password: "Password123",
          permissions: ["settings.view"],
        },
        "unused-hash",
      );
      const headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
      const adminHeaders = {
        authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
      };
      const routes = ["/history/audit-events", "/admin/audit-events"];
      for (const url of routes) {
        expect((await app.inject({ url })).statusCode).toBe(401);
        for (const method of ["GET", "HEAD"] as const) {
          const denied = await app.inject({ method, url, headers });
          expect(denied.statusCode).toBe(403);
          expect(
            (await app.inject({ method, url, headers: adminHeaders }))
              .statusCode,
          ).toBe(200);
        }
      }
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        role: "user",
        active: true,
        permissions: ["history.view"],
      });
      for (const url of routes)
        expect((await app.inject({ url, headers })).statusCode).toBe(200);
      const page = (
        await app.inject({ url: routes[0]!, headers })
      ).json<AdminAuditPage>();
      expect(page.items.length).toBeGreaterThan(0);
      for (const event of page.items.filter(
        (item) => item.module === "settings",
      )) {
        expect(event).toMatchObject({ clinicId, actorUserId: ownerId });
        expect(event).not.toHaveProperty("ipAddress");
      }
      expect(
        Array.isArray((await app.inject({ url: routes[1]!, headers })).json()),
      ).toBe(true);
      for (const cursor of ["invalid", randomUUID()]) {
        expect(
          (
            await app.inject({
              url: `/history/audit-events?cursor=${cursor}`,
              headers,
            })
          ).statusCode,
        ).toBe(400);
      }
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        role: "user",
        active: true,
        permissions: [],
      });
      for (const url of routes)
        expect((await app.inject({ url, headers })).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("paginates beyond 200 events with ties and ignores newer events between pages", async () => {
    const repository = new MemoryClinicRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    for (let i = 0; i < 235; i++)
      await repository.recordAdminAuditEvent(
        clinicId,
        ownerId,
        `event.${i}`,
        "clinic",
      );
    const expected = (await repository.listAdminAuditEvents(clinicId)).sort(
      (a, b) => b.id.localeCompare(a.id),
    );
    const first = await repository.listAdminAuditPage(clinicId, undefined, {
      module: "settings",
    });
    expect(first.items).toHaveLength(50);
    expect(first.items).toEqual(expected.slice(0, 50));
    expect(first.nextCursor).toBe(first.items.at(-1)!.id);
    vi.setSystemTime(new Date("2026-10-07T12:00:01Z"));
    await repository.recordAdminAuditEvent(
      clinicId,
      ownerId,
      "newer",
      "clinic",
    );
    const collected: AdminAuditEvent[] = [...first.items];
    let page: AdminAuditPage = first;
    while (page.nextCursor) {
      page = await repository.listAdminAuditPage(clinicId, page.nextCursor, {
        module: "settings",
      });
      collected.push(...page.items);
    }
    expect(collected).toEqual(expected);
    expect(new Set(collected.map((event) => event.id)).size).toBe(235);
    expect(page.items).toHaveLength(35);
    expect(
      (
        await repository.listAdminAuditPage(clinicId, undefined, {
          module: "settings",
        })
      ).items[0]!.action,
    ).toBe("newer");
    expect(await repository.listAdminAuditPage(randomUUID())).toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      repository.listAdminAuditPage(randomUUID(), first.nextCursor!),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      repository.listAdminAuditPage(clinicId, randomUUID()),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
