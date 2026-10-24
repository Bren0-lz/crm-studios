import { nextTestCpf } from "../../test-support/cpf.js";
import type { AdminAuditPage } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { mergeOperationEvents } from "./merge-operation-events.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

describe("history without duplicates", () => {
  it("shows one entry per command, with the domain label and the responsible user", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
    };
    try {
      const created = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Teste Histórico",
          phone: "11955554444",
          tags: [],
        },
      });
      expect(created.statusCode).toBe(201);
      const page = (
        await app.inject({ url: "/history/audit-events", headers })
      ).json<AdminAuditPage>();
      const entries = page.items.filter(
        (item) => item.entityId === created.json().id,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: "patient.created",
        actorUserId: ownerId,
      });
      expect(entries[0]!.metadata).not.toHaveProperty("actorUnavailable");
    } finally {
      await app.close();
    }
  });

  it("leaves future-dated events out of the history", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
    };
    try {
      await repository.recordAdminAuditEvent(
        clinicId,
        ownerId,
        "patient.created",
        "patients",
        { marker: "future" },
      );
      const event = (await repository.listAdminAuditEvents(clinicId)).find(
        (item) => item.metadata.marker === "future",
      )!;
      event.createdAt = "2028-07-27T12:00:00.000Z";
      const page = (
        await app.inject({ url: "/history/audit-events", headers })
      ).json<AdminAuditPage>();
      expect(page.items.some((item) => item.id === event.id)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describe("mergeOperationEvents", () => {
  const base = { entityType: "patients", metadata: {} };
  it("keeps operations without a matching domain entry and pairs only close events", () => {
    const result = mergeOperationEvents([
      {
        ...base,
        id: "op-1",
        action: "operation.patients.create",
        entityId: "a",
        actorUserId: ownerId,
        actorName: "Aryana Dutra",
        createdAt: "2026-10-16T12:00:01.000Z",
      },
      {
        ...base,
        id: "domain-1",
        action: "patient.created",
        entityId: "a",
        metadata: { actorUnavailable: true },
        createdAt: "2026-10-16T12:00:00.500Z",
      },
      {
        ...base,
        id: "domain-old",
        action: "patients.updated",
        entityId: "a",
        createdAt: "2026-10-15T12:00:00.000Z",
      },
      {
        ...base,
        id: "op-2",
        action: "operation.rooms.create",
        entityId: "b",
        createdAt: "2026-10-16T12:00:00.000Z",
      },
    ]);
    expect(result.map((item) => item.id)).toEqual([
      "domain-1",
      "domain-old",
      "op-2",
    ]);
    expect(result[0]).toMatchObject({
      actorUserId: ownerId,
      actorName: "Aryana Dutra",
      metadata: {},
    });
    expect(result[1]).not.toHaveProperty("actorUserId");
  });
});
