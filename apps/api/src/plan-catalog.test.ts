import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionKey } from "@crm/contracts";
import { buildApp } from "./app.js";
import { MemoryClinicRepository } from "./memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const otherClinic = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let repository: MemoryClinicRepository;
let app: Awaited<ReturnType<typeof buildApp>>;
let headers: { authorization: string };
const input = { name: "Mensalidade Pilates", totalValueInCents: 40000 };

beforeEach(async () => {
  repository = new MemoryClinicRepository();
  app = await buildApp({ repository, logger: false });
  headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
});
afterEach(async () => {
  await app.close();
});
async function userHeaders(permissions: PermissionKey[]) {
  const user = await repository.createAdminUser(
    clinicId,
    ownerId,
    {
      fullName: "Catalog User",
      email: `${randomUUID()}@test.local`,
      role: "user",
      password: "Password123",
      permissions,
    },
    "unused-hash",
  );
  return {
    authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
  };
}

describe("plan catalog API", () => {
  it("starts empty, validates input, and manages catalog entries with audit", async () => {
    expect(
      (
        await app.inject({ method: "GET", url: "/plan-catalog", headers })
      ).json(),
    ).toEqual([]);
    for (const payload of [
      { ...input, name: " " },
      { ...input, totalValueInCents: -1 },
      { ...input, totalValueInCents: 0.5 },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/plan-catalog",
            headers,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    const created = await app.inject({
      method: "POST",
      url: "/plan-catalog",
      headers,
      payload: { ...input, name: "  Mensalidade Pilates  " },
    });
    expect(created.statusCode).toBe(201);
    const entry = created.json();
    expect(entry).toMatchObject({ ...input, clinicId });
    const updated = await app.inject({
      method: "PUT",
      url: `/plan-catalog/${entry.id}`,
      headers,
      payload: { name: "Pilates gratuito", totalValueInCents: 0 },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      (
        await app.inject({ method: "GET", url: "/plan-catalog", headers })
      ).json(),
    ).toEqual([updated.json()]);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/plan-catalog/${entry.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/plan-catalog/${entry.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await repository.listAdminAuditEvents(clinicId)).map(
        (item) => item.action,
      ),
    ).toEqual(
      expect.arrayContaining([
        "plan_catalog.created",
        "plan_catalog.updated",
        "plan_catalog.deleted",
      ]),
    );
  });

  it("keeps sold terms and negotiated installments after editing or deleting catalog entries", async () => {
    const entry = await repository.createPlanCatalogEntry(
      clinicId,
      ownerId,
      input,
    );
    const template = await repository.createPlanTemplate(clinicId, ownerId, { ...input, services: [{ serviceId: "77777777-7777-4777-8777-777777777777", totalSessions: 10, totalValueInCents: input.totalValueInCents }] });
    const response = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        planTemplateId: template.id,
        services: [{ serviceId: "77777777-7777-4777-8777-777777777777", totalSessions: 10, totalValueInCents: 12345 }],
        patientId: "99999999-9999-4999-8999-999999999999",
        serviceId: "77777777-7777-4777-8777-777777777777",
        name: entry.name,
        totalValueInCents: 12345,
        kind: "fixed_package",
        totalSessions: 10,
        validFrom: "2026-10-07",
        validUntil: "2026-11-07",
        installments: 3,
        firstDueDate: "2026-10-07",
        autoRenew: false,
      },
    });
    expect(response.statusCode).toBe(201);
    const sold = response.json();
    await repository.updatePlanCatalogEntry(clinicId, ownerId, entry.id, {
      name: "Novo pre?o Pilates",
      totalValueInCents: 50000,
    });
    await repository.deletePlanCatalogEntry(clinicId, ownerId, entry.id);
    expect(
      (await repository.listPatientPlans(clinicId)).find(
        (plan) => plan.id === sold.id,
      ),
    ).toMatchObject({ name: input.name, totalValueInCents: 12345 });
    const finance = await repository.getFinancialWorkspace(clinicId);
    const installments = finance.summary.receivables.filter(
      (item) => item.planId === sold.id,
    );
    expect(installments).toHaveLength(3);
    expect(
      installments.reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(12345);
  });

  it("isolates catalog entries and returns 404 for invalid or inaccessible ids", async () => {
    const entry = await repository.createPlanCatalogEntry(
      otherClinic,
      ownerId,
      input,
    );
    expect(
      (
        await app.inject({ method: "GET", url: "/plan-catalog", headers })
      ).json(),
    ).toEqual([]);
    for (const id of [entry.id, "invalid", randomUUID()]) {
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/plan-catalog/${id}`,
            headers,
            payload: input,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/plan-catalog/${id}`,
            headers,
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(await repository.listPlanCatalog(otherClinic)).toEqual([entry]);
  });

  it("allows settings or plans viewers to read but enforces operation permissions for writes", async () => {
    const entry = await repository.createPlanCatalogEntry(
      clinicId,
      ownerId,
      input,
    );
    for (const permissions of [
      ["settings.view"],
      ["plans.view"],
    ] as PermissionKey[][]) {
      const viewer = await userHeaders(permissions);
      for (const method of ["GET", "HEAD"] as const)
        expect(
          (await app.inject({ method, url: "/plan-catalog", headers: viewer }))
            .statusCode,
        ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/plan-catalog",
            headers: viewer,
            payload: input,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/plan-catalog/${entry.id}`,
            headers: viewer,
            payload: input,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/plan-catalog/${entry.id}`,
            headers: viewer,
          })
        ).statusCode,
      ).toBe(403);
    }
    const editor = await userHeaders([
      "settings.view",
      "settings.plans_update",
    ]);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/plan-catalog/${entry.id}`,
          headers: editor,
          payload: input,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/plan-catalog",
          headers: editor,
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    const creator = await userHeaders([
      "settings.view",
      "settings.plans_create",
    ]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/plan-catalog",
          headers: creator,
          payload: input,
        })
      ).statusCode,
    ).toBe(201);
    const deleter = await userHeaders([
      "settings.view",
      "settings.plans_delete",
    ]);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/plan-catalog/${entry.id}`,
          headers: deleter,
        })
      ).statusCode,
    ).toBe(204);
    const noAccess = await userHeaders([]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/plan-catalog",
          headers: noAccess,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "GET", url: "/plan-catalog" })).statusCode,
    ).toBe(401);
  });
});
