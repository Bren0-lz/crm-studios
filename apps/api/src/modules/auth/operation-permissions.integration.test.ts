import { nextTestCpf } from "../../test-support/cpf.js";
import {
  permissionCatalog,
  togglePermissions,
  type PermissionKey,
} from "@crm/contracts";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { ROUTE_ACCESS } from "../../infrastructure/route-access.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup(permissions: PermissionKey[] = []) {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const user = await repository.createAdminUser(
    clinicId,
    ownerId,
    {
      fullName: "Limited User",
      email: "limited@example.com",
      password: "Password123",
      role: "user",
      permissions,
    },
    "unused-hash",
  );
  const token = app.jwt.sign({ sub: user.id, clinicId, role: "user" });
  const headers = { authorization: `Bearer ${token}` };
  const update = (next: PermissionKey[]) =>
    repository.updateAdminUser(clinicId, ownerId, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: next,
    });
  return { app, repository, user, headers, update };
}

describe("per-operation API authorization", () => {
  it("distinguishes creating an evolution from updating an existing draft", async () => {
    const { app, repository, headers, update } = await setup([
      "clinical.view",
      "clinical.records_update",
    ]);
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: "2025-01-10T12:00:00.000Z",
      visitType: "regular",
      notes: "",
    });
    const payload = {
      appointmentId: appointment.id,
      subjective: "Original",
      objective: "",
      assessment: "",
      plan: "",
    };
    const range = "from=2025-01-10T00:00:00.000Z&to=2025-01-11T00:00:00.000Z";
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/appointments?${range}`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
    const options = await app.inject({
      method: "GET",
      url: `/appointments/options?${range}`,
      headers,
    });
    expect(options.statusCode).toBe(200);
    expect(options.json()).toHaveLength(1);
    // Só o necessário para escolher a sessão; `patientId` liga a sessão ao prontuário do cliente.
    expect(Object.keys(options.json()[0]).sort()).toEqual([
      "id",
      "patientId",
      "patientName",
      "professionalName",
      "startsAt",
      "status",
    ]);
    const save = () =>
      app.inject({
        method: "POST",
        url: "/clinical-records",
        headers,
        payload,
      });
    expect((await save()).json().details.permission).toBe(
      "clinical.records_create",
    );
    await update(["clinical.view", "clinical.records_create"]);
    expect((await save()).statusCode).toBe(201);
    payload.subjective = "Changed";
    expect((await save()).json().details.permission).toBe(
      "clinical.records_update",
    );
    expect(
      (await repository.listClinicalRecords(clinicId))[0]?.subjective,
    ).toBe("Original");
    await update(["clinical.view", "clinical.records_update"]);
    expect((await save()).statusCode).toBe(201);
    expect(
      (await repository.listClinicalRecords(clinicId))[0]?.subjective,
    ).toBe("Changed");
  });
  it("denies every protected route to a user without permissions, including HEAD", async () => {
    const { app, headers } = await setup();
    for (const [key, policy] of Object.entries(ROUTE_ACCESS)) {
      if (policy === "public" || policy === "login") continue;
      const [method, pattern] = key.split(" ") as [string, string];
      const url = pattern.replace(/:[\w]+/g, ownerId);
      const response = await app.inject({
        method: method as "GET",
        url,
        headers,
      });
      expect(response.statusCode, key).toBe(403);
      if (method === "GET")
        expect(
          (await app.inject({ method: "HEAD", url, headers })).statusCode,
          key,
        ).toBe(403);
    }
  });
  it("each route requires its exact operation rather than legacy edit flags", async () => {
    const { app, headers, update } = await setup();
    for (const [key, policy] of Object.entries(ROUTE_ACCESS)) {
      if (typeof policy === "string") continue;
      const requirements = Array.isArray(policy) ? policy : policy.anyOf;
      const operations = requirements.filter(
        (item) => !item.permission!.endsWith(".view"),
      );
      if (!operations.length) continue;
      await update(
        togglePermissions(
          [],
          requirements.map((item) => `${item.module}.view` as PermissionKey),
          true,
        ),
      );
      const [method, pattern] = key.split(" ") as [string, string];
      const response = await app.inject({
        method: method as "GET",
        url: pattern.replace(/:[\w]+/g, ownerId),
        headers,
      });
      expect(response.statusCode, key).toBe(403);
      const permission = response.json().details;
      expect(permission, key).toBeDefined();
    }
  });
  it("validates cancellation separately from attendance, before side effects", async () => {
    const { app, repository, headers, update } = await setup([
      "agenda.view",
      "agenda.attendance",
    ]);
    const write = vi.spyOn(repository, "updateAppointmentStatus");
    const url = `/appointments/${ownerId}/status`;
    const denied = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { status: "cancelled" },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().details.permission).toBe("agenda.cancel");
    expect(write).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { status: "completed" },
        })
      ).statusCode,
    ).toBe(404);
    await update(["agenda.view", "agenda.cancel"]);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { status: "completed" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { status: "cancelled" },
        })
      ).statusCode,
    ).toBe(404);
  });
  it("authorizes each spreadsheet export and import with its own permission", async () => {
    const { app, headers, update } = await setup([
      "reports.view",
      "reports.dre",
      "reports.sales",
      "reports.management",
      "reports.clients",
      "reports.campaigns",
      "patients.view",
    ]);
    const range = "from=2025-01-01&to=2025-01-31";
    const routes: [string, PermissionKey][] = [
      [`/reports/sales/period.xlsx?${range}`, "reports.sales_export"],
      ["/reports/sales.xlsx?month=2025-01", "reports.sales_export"],
      [`/reports/management.csv?${range}`, "reports.management_export"],
      [`/reports/clients/details/export?${range}`, "reports.clients_export"],
      [`/reports/campaigns.xlsx?${range}`, "reports.campaigns_export"],
      ["/patients/export?format=csv&columns=fullName", "patients.export"],
      [`/reports/dre/export?${range}`, "reports.dre_export"],
      [
        "/reports/financial/export?periodFrom=2025-01-01&periodTo=2025-01-31",
        "reports.financial_export",
      ],
    ];
    const status = async (url: string) =>
      (await app.inject({ method: "GET", url, headers })).statusCode;
    for (const [url] of routes) expect(await status(url)).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/patients/import/preview",
          headers,
          payload: { csv: "nome\nCliente" },
        })
      ).statusCode,
    ).toBe(403);
    for (const [, permission] of routes) {
      await update(
        togglePermissions(
          [
            "reports.view",
            "reports.dre",
            "reports.sales",
            "reports.management",
            "reports.clients",
            "reports.campaigns",
            "patients.view",
          ],
          [permission],
          true,
        ),
      );
      for (const [otherUrl, other] of routes)
        expect(await status(otherUrl), `${permission} → ${otherUrl}`).toBe(
          other === permission ? 200 : 403,
        );
    }
    expect(
      permissionCatalog.find((item) => item.key === "reports.dre_export")
        ?.dependencies,
    ).toEqual(["reports.view", "reports.dre"]);
  });
  it("revokes access using the same token and audits exact before/after permissions", async () => {
    const { app, headers, update, repository, user } = await setup([
      "patients.view",
      "patients.export",
    ]);
    expect(
      (await app.inject({ method: "GET", url: "/patients", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/patients/export?format=csv&columns=fullName",
          headers,
        })
      ).statusCode,
    ).toBe(200);
    await update([]);
    expect(
      (await app.inject({ method: "GET", url: "/patients", headers }))
        .statusCode,
    ).toBe(403);
    const events = await repository.listAdminAuditEvents(clinicId);
    expect(
      events.find(
        (event) =>
          event.entityId === user.id &&
          event.action === "users.permissions_updated" &&
          Array.isArray(event.metadata.permissions) &&
          event.metadata.permissions.length === 0,
      )?.metadata,
    ).toMatchObject({
      previousPermissions: ["patients.view", "patients.export"],
      permissions: [],
    });
  });
  it("omits restricted dashboard fields rather than leaking or returning fake zeroes", async () => {
    const { app, headers, update } = await setup();
    const get = async () =>
      (await app.inject({ method: "GET", url: "/dashboard", headers })).json();
    expect(Object.keys(await get())).toEqual(["date"]);
    await update(["patients.view"]);
    expect(Object.keys(await get()).sort()).toEqual(["date", "patientsActive"]);
    await update(["agenda.view"]);
    const agenda = await get();
    expect(agenda).toHaveProperty("nextAppointments");
    expect(agenda).toHaveProperty("nonCancelledAppointmentsToday");
    expect(agenda).toHaveProperty("pendingToday");
    expect(agenda).toHaveProperty("awaitingConfirmationToday");
    expect(agenda).not.toHaveProperty("patientsActive");
  });
  it("checks combined lead conversion before creating a patient", async () => {
    const { app, repository, headers, update } = await setup([
      "crm.view",
      "crm.convert",
    ]);
    const lead = await repository.createLead(clinicId, {
      fullName: "Lead Test",
      phone: "11999998888",
      source: "test",
      interest: "Pilates",
      tags: [],
    });
    const convert = vi.spyOn(repository, "convertLead");
    expect(
      (
        await app.inject({
          payload: { cpf: nextTestCpf() },
          method: "POST",
          url: `/leads/${lead.id}/convert`,
          headers,
        })
      ).statusCode,
    ).toBe(403);
    expect(convert).not.toHaveBeenCalled();
    await update([
      "crm.view",
      "crm.convert",
      "patients.view",
      "patients.create",
    ]);
    expect(
      (
        await app.inject({
          payload: { cpf: nextTestCpf() },
          method: "POST",
          url: `/leads/${lead.id}/convert`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("migrations grant one spreadsheet export per report and template deletion", () => {
    const migration = (name: string) =>
      readFileSync(
        new URL(`../../../migrations/${name}`, import.meta.url),
        "utf8",
      );
    const split = migration("0008_spreadsheet_export_permissions.sql");
    for (const key of [
      "reports.dre_export",
      "reports.financial_export",
      "reports.management_export",
      "reports.clients_export",
      "reports.sales_export",
    ] as const) {
      const report = permissionCatalog.find((item) => item.key === key)!
        .dependencies[1];
      expect(split).toContain(
        `JSON_CONTAINS(permissions, '"${report}"')\n  AND NOT JSON_CONTAINS(permissions, '"${key}"')`,
      );
    }
    expect(split).toContain(
      "JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'reports.export')))",
    );
    expect(migration("0017_document_template_delete.sql")).toContain(
      `WHERE JSON_CONTAINS(permissions, '"contracts.templates_create"')`,
    );
  });
});
