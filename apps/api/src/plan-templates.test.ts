import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  planTemplateInputSchema,
  planTemplateUpdateSchema,
  patientPlanInputSchema,
  guidedPatientInputSchema,
} from "@crm/contracts";
import { buildApp } from "./app.js";
import { MemoryClinicRepository } from "./memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const serviceId = "77777777-7777-4777-8777-777777777777";
const patientId = "99999999-9999-4999-8999-999999999999";
const terms = {
  services: [{ serviceId: serviceId, totalSessions: 8, totalValueInCents: 10001 }],
  name: "Nome enviado",
  patientId,
  serviceId,
  kind: "fixed_package" as const,
  totalSessions: 8,
  totalValueInCents: 10001,
  installments: 3,
  validFrom: "2035-01-01",
  firstDueDate: "2035-01-05",
};
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
  return { app, repository, headers };
}

describe("plan catalog", () => {
  it("automatically renews a deactivated catalog item with its original terms and reference", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2035-02-08T12:00:00Z"));
    const { repository } = await setup();
    const template = await repository.createPlanTemplate(clinicId, ownerId, {
      name: "Mensalidade original",
      totalValueInCents: 45000,
      services: [{ serviceId, totalSessions: 8, totalValueInCents: 45000 }],
    });
    const original = await repository.createPatientPlan(clinicId, ownerId, {
      ...terms,
      planTemplateId: template.id,
      kind: "recurring",
      autoRenew: true,
      validFrom: "2035-01-01",
      validUntil: "2035-01-31",
    });
    await repository.updatePlanTemplate(clinicId, ownerId, template.id, {
      active: false,
      name: "Preço novo",
      totalValueInCents: 55000,
      services: [{ serviceId, totalSessions: 8, totalValueInCents: 55000 }],
    });
    await repository.renewDuePatientPlans(clinicId);
    const next = (await repository.listPatientPlans(clinicId)).filter(
      (item) => item.renewedFromPlanId === original.id,
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      name: "Mensalidade original",
      planTemplateId: template.id,
      totalValueInCents: terms.totalValueInCents,
      validFrom: "2035-02-01",
      validUntil: "2035-02-28",
    });
    await repository.renewDuePatientPlans(clinicId);
    expect(
      (await repository.listPatientPlans(clinicId)).filter(
        (item) => item.renewedFromPlanId === original.id,
      ),
    ).toHaveLength(1);
  });
  it("validates required and optional fields and requires selection for both new-sale contracts", () => {
    expect(
      planTemplateInputSchema.parse({ name: "Gratuito", totalValueInCents: 0, services: [{ serviceId, totalSessions: 1, totalValueInCents: 0 }] }),
    ).toMatchObject({ name: "Gratuito", totalValueInCents: 0 });
    for (const input of [
      { name: "Plano" },
      { totalValueInCents: 100 },
      { name: "Plano", totalValueInCents: -1 },
      { name: "Plano", totalValueInCents: 1.5 },
      { name: "Plano", totalValueInCents: 1, totalSessions: 0 },
      { name: "Plano", totalValueInCents: 1, serviceId: "invalid" },
      { name: "Plano", totalValueInCents: 1, kind: "invalid" },
    ]) {
      expect(planTemplateInputSchema.safeParse(input).success).toBe(false);
    }
    expect(planTemplateUpdateSchema.safeParse({}).success).toBe(false);
    expect(planTemplateUpdateSchema.parse({ kind: null })).toEqual({ kind: null });
    expect(patientPlanInputSchema.safeParse(terms).success).toBe(false);
    for (const next of ["plan", "single"])
      expect(
        guidedPatientInputSchema.safeParse({
          next,
          patient: { fullName: "Cliente teste", phone: "11988887777" },
          plan: terms,
        }).success,
      ).toBe(false);
  });

  it("manages optional defaults, keeps negotiated snapshots, journals changes and renews deactivated templates", async () => {
    const { app, repository, headers } = await setup();
    expect(
      (await app.inject({ url: "/plan-templates", headers })).json(),
    ).toEqual([]);
    const created = await app.inject({
      method: "POST",
      url: "/plan-templates",
      headers,
      payload: {

        name: "Pacote configurado",
        totalValueInCents: 180000,
        services: [{ serviceId, totalSessions: 12, totalValueInCents: 180000 }],
        kind: "recurring",
      },
    });
    expect(created.statusCode).toBe(201);
    const templateId = created.json().id as string;
    const sale = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...terms, planTemplateId: templateId },
    });
    expect(sale.statusCode, sale.body).toBe(201);
    expect(sale.json()).toMatchObject({
      name: "Pacote configurado",
      planTemplateId: templateId,
      totalValueInCents: 10001,
      totalSessions: 8,
      kind: "fixed_package",
    });
    const receivables = (
      await repository.getFinancialWorkspace(clinicId)
    ).summary.receivables.filter((item) => item.planId === sale.json().id);
    expect(receivables).toHaveLength(3);
    expect(receivables.reduce((sum, item) => sum + item.amountInCents, 0)).toBe(
      10001,
    );
    const updated = await app.inject({
      method: "PATCH",
      url: `/plan-templates/${templateId}`,
      headers,
      payload: {

        name: "Outro nome",
        totalValueInCents: 250000,
        services: [{ serviceId, totalSessions: 12, totalValueInCents: 250000 }],
        kind: null,
        active: false,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      active: false,
      kind: null,
    });
    expect(
      (await repository.listPatientPlans(clinicId)).find(
        (item) => item.id === sale.json().id,
      ),
    ).toMatchObject({ name: "Pacote configurado", totalValueInCents: 10001 });
    const rejected = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...terms, planTemplateId: templateId },
    });
    expect(rejected.statusCode).toBe(404);
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${sale.json().id}/renew`,
      headers,
      payload: {
        ...terms,
        name: "Pacote configurado",
        validFrom: "2035-02-01",
        firstDueDate: "2035-02-05",
      },
    });
    expect(renewed.statusCode, renewed.body).toBe(201);
    expect(renewed.json()).toMatchObject({
      planTemplateId: templateId,
      totalValueInCents: 10001,
    });
    const events = (
      await repository.listAdminAuditPage(clinicId, undefined, {
        module: "settings",
      })
    ).items;
    expect(
      events
        .filter((item) => item.entityId === templateId)
        .map((item) => item.action)
        .sort(),
    ).toEqual(["plan_template.created", "plan_template.updated"]);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/plan-templates/${templateId}`,
          headers,
          payload: { active: true },
        })
      ).json().active,
    ).toBe(true);
  });

  it("rejects missing and foreign selections and rolls back guided creation without partial records", async () => {
    const { app, repository, headers } = await setup();
    const foreignClinic = randomUUID();
    const foreignService = await repository.createService(foreignClinic, { name: "Serviço externo", durationMinutes: 60, priceInCents: 0, color: "#64748b" });
    const foreign = await repository.createPlanTemplate(
      foreignClinic,
      ownerId,
      { name: "Plano outra clínica", totalValueInCents: 0, services: [{ serviceId: foreignService.id, totalSessions: 1, totalValueInCents: 0 }] },
    );
    expect(
      (await repository.listAdminAuditPage(clinicId)).items.every(
        (event) => event.clinicId === clinicId,
      ),
    ).toBe(true);
    expect(
      (await repository.listAdminAuditPage(foreignClinic)).items,
    ).toContainEqual(
      expect.objectContaining({
        entityId: foreign.id,
        clinicId: foreignClinic,
      }),
    );
    expect(await repository.listPlanTemplates(clinicId)).toEqual([]);
    expect(
      await repository.updatePlanTemplate(clinicId, ownerId, foreign.id, {
        active: false,
      }),
    ).toBeNull();
    await expect(
      repository.createPlanTemplate(foreignClinic, ownerId, {
        name: "Serviço indevido",
        totalValueInCents: 0,
        services: [{ serviceId, totalSessions: 1, totalValueInCents: 0 }],
      }),
    ).rejects.toMatchObject({ code: "PLAN_TEMPLATE_SERVICE_NOT_FOUND" });
    const before = (await repository.listPatientPlans(clinicId)).length;
    for (const payload of [
      terms,
      { ...terms, planTemplateId: foreign.id },
      { ...terms, planTemplateId: randomUUID() },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload,
      });
      expect(response.statusCode).toBe("planTemplateId" in payload ? 404 : 400);
    }
    const response = await app.inject({
      method: "POST",
      url: "/patients/guided",
      headers,
      payload: {
        next: "plan",
        patient: { fullName: "Cliente sem plano válido", phone: "11987651234" },
        plan: { ...terms, planTemplateId: foreign.id },
      },
    });
    expect(response.statusCode).toBe(404);
    expect(await repository.listPatients(clinicId, "11987651234")).toEqual([]);
    expect(await repository.listPatientPlans(clinicId)).toHaveLength(before);
    const valid = await repository.createPlanTemplate(clinicId, ownerId, {
      name: "Plano válido",
      totalValueInCents: 0,
      services: [{ serviceId, totalSessions: 1, totalValueInCents: 0 }],
    });
    await expect(
      repository.createPatientWithNextStep(clinicId, ownerId, {
        next: "single",
        patient: {
          fullName: "Cliente sem serviço",
          phone: "11987651235",
          tags: [],
        },
        plan: { ...terms, planTemplateId: valid.id, services: [{ serviceId: randomUUID(), totalSessions: 8, totalValueInCents: 10001 }] },
      }),
    ).rejects.toMatchObject({ code: "PLAN_SERVICE_COMPOSITION_MISMATCH" });
    expect(await repository.listPatients(clinicId, "11987651235")).toEqual([]);
  });

  it("permits catalog and service reads in settings but requires explicit operation grants for writes", async () => {
    const { app, repository } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Usuário configurações",
        email: "catalog@test.local",
        password: "Password123",
        role: "user",
        permissions: ["settings.view"],
      },
      "unused",
    );
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    expect(
      (await app.inject({ url: "/plan-templates", headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "HEAD", url: "/plan-templates", headers }))
        .statusCode,
    ).toBe(200);
    expect((await app.inject({ url: "/services", headers })).statusCode).toBe(
      200,
    );
    const write = () =>
      app.inject({
        method: "POST",
        url: "/plan-templates",
        headers,
        payload: { name: "Plano teste", totalValueInCents: 0, services: [{ serviceId, totalSessions: 1, totalValueInCents: 0 }] },
      });
    expect((await write()).statusCode).toBe(403);
    await repository.updateAdminUser(clinicId, ownerId, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: ["settings.view", "settings.plans_create"],
    });
    const template = await write();
    expect(template.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/plan-templates/${template.json().id}`,
          headers,
          payload: { active: false },
        })
      ).statusCode,
    ).toBe(403);
    await repository.updateAdminUser(clinicId, ownerId, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: ["plans.view"],
    });
    expect(
      (await app.inject({ url: "/plan-templates", headers })).statusCode,
    ).toBe(200);
    await repository.updateAdminUser(clinicId, ownerId, user.id, {
      fullName: user.fullName,
      role: "user",
      active: true,
      permissions: [],
    });
    expect(
      (await app.inject({ url: "/plan-templates", headers })).statusCode,
    ).toBe(403);
  });
});

describe("periodic plan templates", () => {
  it("persists weekly sessions, rejects inconsistent quantities and preserves sold balances", async () => {
    const { app, repository, headers } = await setup();
    const payload = { name: "Dançaterapia semestral", planType: "semiannual", kind: "fixed_package", totalValueInCents: 16000,
      services: [{ serviceId, sessionsPerWeek: 2, totalSessions: 48, totalValueInCents: 16000 }] };
    const created = await app.inject({ method: "POST", url: "/plan-templates", headers, payload });
    expect(created.statusCode).toBe(201);
    const template = created.json();
    expect((await repository.listPlanTemplates(clinicId)).find(item => item.id === template.id)).toMatchObject(payload);
    const sale = await app.inject({ method: "POST", url: "/plans", headers, payload: { ...terms, name: payload.name, planTemplateId: template.id,
      services: payload.services, totalValueInCents: 16000, validFrom: "2035-01-01", validUntil: "2035-06-30" } });
    expect(sale.statusCode).toBe(201);
    expect(sale.json().totalSessions).toBe(48);
    const bad = await app.inject({ method: "PATCH", url: `/plan-templates/${template.id}`, headers, payload: { services: [{ serviceId, sessionsPerWeek: 3, totalSessions: 48, totalValueInCents: 16000 }] } });
    expect(bad.statusCode).toBe(400);
    const update = await app.inject({ method: "PATCH", url: `/plan-templates/${template.id}`, headers, payload: { services: [{ serviceId, sessionsPerWeek: 3, totalSessions: 72, totalValueInCents: 16000 }] } });
    expect(update.statusCode).toBe(200);
    expect((await repository.listPatientPlans(clinicId)).find(item => item.id === sale.json().id)).toMatchObject({ totalSessions: 48, remainingSessions: 48, totalValueInCents: 16000 });
  });
});
