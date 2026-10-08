import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { MemoryClinicRepository } from "./memory-repository.js";
import type { AdminAuditEvent, AdminAuditPage } from "@crm/contracts";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
afterEach(() => vi.useRealTimers());

describe("audit history", () => {
  it("protects both routes and applies grants and revocations without a new login", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    try {
      const user = await repository.createAdminUser(clinicId, ownerId, {
        fullName: "History Reader", email: "history@test.local", role: "user",
        password: "Password123", permissions: ["settings.view"],
      }, "unused-hash");
      const headers = { authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}` };
      const adminHeaders = { authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}` };
      const routes = ["/history/audit-events", "/admin/audit-events"];
      for (const url of routes) {
        expect((await app.inject({ url })).statusCode).toBe(401);
        for (const method of ["GET", "HEAD"] as const) {
          const denied = await app.inject({ method, url, headers });
          expect(denied.statusCode).toBe(403);
          expect((await app.inject({ method, url, headers: adminHeaders })).statusCode).toBe(200);
        }
      }
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName, role: "user", active: true, permissions: ["history.view"],
      });
      for (const url of routes) expect((await app.inject({ url, headers })).statusCode).toBe(200);
      expect(Array.isArray((await app.inject({ url: routes[1]!, headers })).json())).toBe(true);
      for (const cursor of ["invalid", randomUUID()]) {
        expect((await app.inject({ url: `/history/audit-events?cursor=${cursor}`, headers })).statusCode).toBe(400);
      }
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName, role: "user", active: true, permissions: [],
      });
      for (const url of routes) expect((await app.inject({ url, headers })).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("paginates beyond 200 events with ties and ignores newer events between pages", async () => {
    const repository = new MemoryClinicRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    for (let i = 0; i < 235; i++) await repository.recordAdminAuditEvent(clinicId, ownerId, `event.${i}`, "clinic");
    const expected = (await repository.listAdminAuditEvents(clinicId)).sort((a, b) => b.id.localeCompare(a.id));
    const first = await repository.listAdminAuditPage(clinicId);
    expect(first.items).toHaveLength(50);
    expect(first.items).toEqual(expected.slice(0, 50));
    expect(first.nextCursor).toBe(first.items.at(-1)!.id);
    vi.setSystemTime(new Date("2026-10-07T12:00:01Z"));
    await repository.recordAdminAuditEvent(clinicId, ownerId, "newer", "clinic");
    const collected: AdminAuditEvent[] = [...first.items];
    let page: AdminAuditPage = first;
    while (page.nextCursor) {
      page = await repository.listAdminAuditPage(clinicId, page.nextCursor);
      collected.push(...page.items);
    }
    expect(collected).toEqual(expected);
    expect(new Set(collected.map((event) => event.id)).size).toBe(235);
    expect(page.items).toHaveLength(35);
    expect((await repository.listAdminAuditPage(clinicId)).items[0]!.action).toBe("newer");
    expect(await repository.listAdminAuditPage(randomUUID())).toEqual({ items: [], nextCursor: null });
    await expect(repository.listAdminAuditPage(randomUUID(), first.nextCursor!)).rejects.toMatchObject({ statusCode: 400 });
    await expect(repository.listAdminAuditPage(clinicId, randomUUID())).rejects.toMatchObject({ statusCode: 400 });
  });
});
