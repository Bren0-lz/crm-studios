import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { INTEGRATION_RATE_LIMIT } from "../../infrastructure/route-context.js";
import { ROUTE_ACCESS } from "../../infrastructure/route-access.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  configuredPlan,
  OWNER_ID,
  roleSub,
  seedRoleUsers,
} from "../../test-support/legacy-fixtures.js";
import { hashIntegrationToken } from "../integrations/tokens.js";
import { externalEndpoints } from "./endpoints.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  const admin = {
    authorization: `Bearer ${app.jwt.sign({ sub: OWNER_ID, clinicId, role: "admin" })}`,
  };
  const createKey = async (scopes: string[] = ["sales:read", "sales:write"]) => {
    const created = await app.inject({
      method: "POST",
      url: "/integration-keys",
      headers: admin,
      payload: { name: "Dashboard de vendas", scopes },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { key, token } = created.json() as {
      key: { id: string };
      token: string;
    };
    return { id: key.id, headers: { authorization: `Bearer ${token}` } };
  };
  return { app, repository, admin, createKey };
}

describe("API externa de vendas", () => {
  it("every external route is mapped and listed in the index", async () => {
    const { app, createKey } = await setup();
    const external = Object.keys(ROUTE_ACCESS).filter((key) =>
      key.includes(" /external/"),
    );
    expect(
      externalEndpoints.map((item) => `${item.method} ${item.path}`).sort(),
    ).toEqual(external.sort());
    const { headers } = await createKey(["sales:read"]);
    const index = await app.inject({ url: "/external/v1", headers });
    expect(index.statusCode, index.body).toBe(200);
    expect(index.json()).toMatchObject({
      version: "v1",
      clinic: { id: clinicId },
      key: { name: "Dashboard de vendas", scopes: ["sales:read"] },
    });
    expect(index.json().endpoints).toHaveLength(external.length);
    await app.close();
  });

  it("stores only the token hash and refuses missing, wrong, revoked and JWT credentials", async () => {
    const { app, repository, admin, createKey } = await setup();
    const { id, headers } = await createKey();
    const token = headers.authorization.slice(7);
    const listed = await app.inject({ url: "/integration-keys", headers: admin });
    expect(listed.body).not.toContain(token);
    expect(listed.json()[0]).toMatchObject({
      id,
      prefix: token.split("_").slice(0, 2).join("_"),
      createdByName: expect.any(String),
    });
    expect(
      (await repository.findIntegrationKeyByTokenHash(hashIntegrationToken(token)))
        ?.key.id,
    ).toBe(id);
    expect((await app.inject({ url: "/external/v1" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/external/v1",
          headers: { authorization: `${headers.authorization}x` },
        })
      ).json().code,
    ).toBe("INTEGRATION_KEY_INVALID");
    // Token de usuário não abre a API externa, e a chave não abre as rotas internas.
    expect(
      (await app.inject({ url: "/external/v1", headers: admin })).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: "/leads", headers })).statusCode).toBe(401);
    expect(
      (await app.inject({ url: "/external/v1", headers })).json().key.id,
    ).toBe(id);
    expect(
      (await app.inject({ url: "/integration-keys", headers })).statusCode,
    ).toBe(401);
    const revoked = await app.inject({
      method: "POST",
      url: `/integration-keys/${id}/revoke`,
      headers: admin,
    });
    expect(revoked.json().revokedAt).toEqual(expect.any(String));
    expect((await app.inject({ url: "/external/v1", headers })).statusCode).toBe(
      401,
    );
    await app.close();
  });

  it("enforces scopes, the creator's permissions, active creator and the rate limit", async () => {
    const { app, repository, admin, createKey } = await setup();
    const reader = await createKey(["sales:read"]);
    const denied = await app.inject({
      method: "POST",
      url: "/external/v1/leads",
      headers: reader.headers,
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe("INTEGRATION_SCOPE_DENIED");

    // Chave de usuária sem Turmas: o 403 vem das permissões dela (também nas rotas repassadas).
    await seedRoleUsers(app);
    const userId = roleSub(app, "finance");
    const { token } = await import("../integrations/tokens.js").then((module) =>
      module.generateIntegrationToken(),
    );
    await repository.createIntegrationKey(
      clinicId,
      userId,
      { name: "Chave restrita", scopes: ["sales:read", "sales:write"] },
      { prefix: token.slice(0, 12), tokenHash: hashIntegrationToken(token) },
    );
    const restricted = { authorization: `Bearer ${token}` };
    expect(
      (await app.inject({ url: "/external/v1/groups", headers: restricted }))
        .statusCode,
    ).toBe(403);
    const enroll = await app.inject({
      method: "POST",
      url: "/external/v1/group-enrollments",
      headers: restricted,
      payload: {},
    });
    expect(enroll.statusCode).toBe(403);
    expect(enroll.json().details.permission).toBe("groups.enroll");
    const user = (await repository.listAdminUsers(clinicId)).find(
      (item) => item.id === userId,
    )!;
    const deactivated = await app.inject({
      method: "PATCH",
      url: `/admin/users/${userId}`,
      headers: admin,
      payload: { fullName: user.fullName, role: user.role, active: false },
    });
    expect(deactivated.statusCode, deactivated.body).toBe(200);
    expect(
      (await app.inject({ url: "/external/v1", headers: restricted })).statusCode,
    ).toBe(401);

    for (let index = 1; index < INTEGRATION_RATE_LIMIT; index += 1)
      await app.inject({ url: "/external/v1", headers: reader.headers });
    const limited = await app.inject({
      url: "/external/v1",
      headers: reader.headers,
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    await app.close();
  });

  it("sells end to end: lead → client → plan with turma; table shows seats and waitlist", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey();
    const [service] = await repository.listServices(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const group = await repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 1,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
    });

    const lead = await app.inject({
      method: "POST",
      url: "/external/v1/leads",
      headers,
      payload: {
        fullName: "Lead do dashboard",
        phone: "11977776666",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    expect(lead.statusCode, lead.body).toBe(201);
    const leads = await app.inject({
      url: "/external/v1/leads?search=dashboard",
      headers,
    });
    expect(leads.json()).toEqual([
      expect.objectContaining({ id: lead.json().id }),
    ]);
    const converted = await app.inject({
      method: "POST",
      url: `/external/v1/leads/${lead.json().id}/convert`,
      headers,
      payload: { cpf: nextTestCpf(), ...testPatientContact },
    });
    expect(converted.statusCode, converted.body).toBe(200);
    const patientId = converted.json().patient.id as string;

    const plan = await configuredPlan(app, {
      patientId,
      serviceId: service!.id,
      name: "Pilates mensal",
      kind: "custom" as const,
      totalSessions: 8,
      totalValueInCents: 32_000,
      installments: 2,
      firstDueDate: "2026-10-05",
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      autoRenew: false,
    });
    const purchase = {
      idempotencyKey: "4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a",
      plan,
      groupId: group.id,
    };
    const sold = await app.inject({
      method: "POST",
      url: "/external/v1/plans/purchases",
      headers,
      payload: purchase,
    });
    expect(sold.statusCode, sold.body).toBe(201);
    expect(sold.json().enrollment).toMatchObject({ status: "active" });
    // Mesma chave de idempotência: não vende de novo.
    await app.inject({
      method: "POST",
      url: "/external/v1/plans/purchases",
      headers,
      payload: purchase,
    });
    expect(
      (await repository.listPatientPlans(clinicId, patientId)).length,
    ).toBe(1);
    const plans = await app.inject({
      url: `/external/v1/patients/${patientId}/plans`,
      headers,
    });
    expect(plans.json()[0].paymentSummary).toMatchObject({
      installmentCount: 2,
    });

    // Turma cheia: a próxima inscrição vai para a lista de espera.
    const other = await app.inject({
      method: "POST",
      url: "/external/v1/patients",
      headers,
      payload: {
        fullName: "Cliente na espera",
        cpf: nextTestCpf(),
        phone: "11966665555",
        whatsapp: "11966665555",
        emergencyContactName: "Cliente na espera",
        emergencyContactPhone: "11966665555",
      },
    });
    expect(other.statusCode, other.body).toBe(201);
    const waiting = await app.inject({
      method: "POST",
      url: "/external/v1/group-enrollments",
      headers,
      payload: { groupId: group.id, patientId: other.json().id },
    });
    expect(waiting.statusCode, waiting.body).toBe(201);
    expect(waiting.json()).toMatchObject({
      status: "waitlisted",
      queuePosition: 1,
    });

    const table = await app.inject({ url: "/external/v1/groups", headers });
    expect(table.statusCode, table.body).toBe(200);
    const row = table
      .json()
      .groups.find((item: { id: string }) => item.id === group.id);
    expect(row).toMatchObject({
      capacity: 1,
      enrolled: 1,
      freeSeats: 0,
      waitlistCount: 1,
      occupancyPercent: 100,
      sessionsPerMonth: 4,
      // 32.000 ÷ 8 sessões × 4 encontros no mês.
      monthlyRevenueInCents: 16_000,
      potentialMonthlyRevenueInCents: 16_000,
    });
    expect(table.json().totals.waitlistCount).toBeGreaterThanOrEqual(1);

    const details = await app.inject({
      url: `/external/v1/groups/${group.id}`,
      headers,
    });
    expect(details.json()).toMatchObject({
      members: [
        {
          patientId,
          phone: "11977776666",
          status: "active",
          monthlyInCents: 16_000,
        },
      ],
      waitlist: [
        { patientId: other.json().id, status: "waitlisted", queuePosition: 1 },
      ],
    });
    const found = await app.inject({
      url: "/external/v1/patients?search=Lead do dashboard",
      headers,
    });
    expect(found.json()[0]).toMatchObject({
      id: patientId,
      activePlans: [{ name: "Pilates mensal" }],
      activeGroups: [{ groupId: group.id, status: "active" }],
    });

    // Cancelar a inscrição ativa promove quem estava na espera.
    const cancelled = await app.inject({
      method: "POST",
      url: `/external/v1/group-enrollments/${sold.json().enrollment.id}/cancel`,
      headers,
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    const after = await app.inject({
      url: `/external/v1/groups/${group.id}`,
      headers,
    });
    expect(after.json()).toMatchObject({
      enrolled: 1,
      waitlistCount: 0,
      members: [{ patientId: other.json().id }],
    });
    await app.close();
  });

  it("lists overdue clients with amount, oldest due date, band and turmas; finance only", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey();
    const [service] = await repository.listServices(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const group = await repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 1,
      weeklySlots: [{ weekday: 3, startTime: "07:00", endTime: "08:00" }],
    });
    const patient = await app.inject({
      method: "POST",
      url: "/external/v1/patients",
      headers,
      payload: {
        fullName: "Cliente em atraso",
        cpf: nextTestCpf(),
        phone: "11944443333",
        whatsapp: "11944443333",
        emergencyContactName: "Cliente em atraso",
        emergencyContactPhone: "11944443333",
      },
    });
    expect(patient.statusCode, patient.body).toBe(201);
    const patientId = patient.json().id as string;
    // Três parcelas mensais desde 2020: todas vencidas, qualquer que seja a data de hoje.
    const plan = await configuredPlan(app, {
      patientId,
      serviceId: service!.id,
      name: "Pilates trimestral",
      kind: "custom" as const,
      totalSessions: 12,
      totalValueInCents: 30_000,
      installments: 3,
      firstDueDate: "2020-01-10",
      validFrom: "2020-01-01",
      validUntil: "2099-12-31",
      autoRenew: false,
    });
    const sold = await app.inject({
      method: "POST",
      url: "/external/v1/plans/purchases",
      headers,
      payload: {
        idempotencyKey: "5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b",
        plan,
        groupId: group.id,
      },
    });
    expect(sold.statusCode, sold.body).toBe(201);
    const receivables = (await repository.getFinancialSummary(clinicId))
      .receivables.filter((item) => item.patientId === patientId)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    expect(receivables).toHaveLength(3);
    // A parcela paga sai da conta.
    await repository.settleReceivable(
      clinicId,
      OWNER_ID,
      receivables[0]!.id,
      "pix",
    );

    const response = await app.inject({ url: "/external/v1/overdue", headers });
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json();
    const oldest = receivables[1]!.dueDate;
    const days = Math.round(
      (Date.parse(`${report.referenceDate}T00:00:00.000Z`) -
        Date.parse(`${oldest}T00:00:00.000Z`)) /
        86_400_000,
    );
    expect(
      report.rows.find((row: { patientId: string }) => row.patientId === patientId),
    ).toEqual({
      patientId,
      patientName: "Cliente em atraso",
      phone: "11944443333",
      groups: [
        { groupId: group.id, groupName: group.name, full: true, waitlistCount: 0 },
      ],
      amountInCents: receivables[1]!.amountInCents + receivables[2]!.amountInCents,
      installments: 2,
      oldestDueDate: oldest,
      daysOverdue: days,
      band: "60+",
    });
    const sorted = report.rows.map((row: { daysOverdue: number }) => row.daysOverdue);
    expect(sorted).toEqual([...sorted].sort((left, right) => right - left));

    // Chave de usuária sem Financeiro (recepção): 403, e o painel mostra a lista indisponível.
    await seedRoleUsers(app);
    const { generateIntegrationToken } = await import("../integrations/tokens.js");
    const { token } = generateIntegrationToken();
    await repository.createIntegrationKey(
      clinicId,
      roleSub(app, "reception"),
      { name: "Chave da recepção", scopes: ["sales:read"] },
      { prefix: token.slice(0, 12), tokenHash: hashIntegrationToken(token) },
    );
    expect(
      (
        await app.inject({
          url: "/external/v1/overdue",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });

  it("proxies writes with the internal validation, 404s and history", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey();
    const invalid = await app.inject({
      method: "POST",
      url: "/external/v1/leads",
      headers,
      payload: { fullName: "A" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe("VALIDATION_ERROR");
    const missing = await app.inject({
      method: "PATCH",
      url: "/external/v1/leads/00000000-0000-4000-8000-000000000000/stage",
      headers,
      payload: { stage: "contacted" },
    });
    expect(missing.statusCode).toBe(404);

    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente da lista",
      phone: "11955554444",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const entry = await app.inject({
      method: "POST",
      url: "/external/v1/waitlist",
      headers,
      payload: {
        patientId: patient.id,
        kind: "service",
        serviceId: service!.id,
        notes: "",
      },
    });
    expect(entry.statusCode, entry.body).toBe(201);
    expect(
      (await app.inject({ url: "/external/v1/waitlist", headers })).json(),
    ).toHaveLength(1);
    const removed = await app.inject({
      method: "DELETE",
      url: `/external/v1/waitlist/${entry.json().id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
    expect(
      (await repository.listAdminAuditEvents(clinicId)).filter((event) =>
        String(event.metadata.route ?? "").startsWith("/waitlist"),
      ).length,
    ).toBe(2);
    await app.close();
  });
});
