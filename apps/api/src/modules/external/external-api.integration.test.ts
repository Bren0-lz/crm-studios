import { hashSync } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
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

    // Cancelar libera a vaga; o cliente aguarda contato e aceite.
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
      enrolled: 0,
      waitlistCount: 1,
      members: [],
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

  it("groups carry the service business line and, with finance access, the overdue members", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey();
    const studio = (await repository.listServices(clinicId))[0]!;
    const aesthetics = await repository.createService(clinicId, {
      name: "Depilação a laser",
      durationMinutes: 30,
      priceInCents: 15_000,
      businessLine: "aesthetics",
    });
    expect(aesthetics.businessLine).toBe("aesthetics");
    expect(studio.businessLine).toBe("studio");
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = (await repository.listRooms(clinicId)).sort(
      (left, right) => right.capacity - left.capacity,
    );
    const createGroup = (serviceId: string, startTime: string) =>
      repository.createGroupClass(clinicId, {
        serviceId,
        professionalId: professional!.id,
        roomId: room!.id,
        capacity: 2,
        weeklySlots: [
          {
            weekday: 4,
            startTime,
            endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`,
          },
        ],
      });
    const laser = await createGroup(aesthetics.id, "06:00");
    const pilates = await createGroup(studio.id, "21:00");
    const sell = async (
      name: string,
      firstDueDate: string,
      idempotencyKey: string,
    ) => {
      const patient = await app.inject({
        method: "POST",
        url: "/external/v1/patients",
        headers,
        payload: {
          fullName: name,
          cpf: nextTestCpf(),
          phone: "11944443333",
          whatsapp: "11944443333",
          emergencyContactName: name,
          emergencyContactPhone: "11944443333",
        },
      });
      expect(patient.statusCode, patient.body).toBe(201);
      const patientId = patient.json().id as string;
      const plan = await configuredPlan(app, {
        patientId,
        serviceId: aesthetics.id,
        name: "Laser trimestral",
        kind: "custom" as const,
        totalSessions: 12,
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate,
        validFrom: "2020-01-01",
        validUntil: "2099-12-31",
        autoRenew: false,
      });
      const sold = await app.inject({
        method: "POST",
        url: "/external/v1/plans/purchases",
        headers,
        payload: { idempotencyKey, plan, groupId: laser.id },
      });
      expect(sold.statusCode, sold.body).toBe(201);
      return patientId;
    };
    // Parcelas de 2020 (todas vencidas) e de 2099 (nenhuma vencida).
    const late = await sell(
      "Cliente atrasada",
      "2020-01-10",
      "6c6c6c6c-6c6c-4c6c-8c6c-6c6c6c6c6c6c",
    );
    await sell(
      "Cliente em dia",
      "2099-01-10",
      "7d7d7d7d-7d7d-4d7d-8d7d-7d7d7d7d7d7d",
    );
    const receivables = (await repository.getFinancialSummary(clinicId))
      .receivables.filter((item) => item.patientId === late)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    expect(receivables).toHaveLength(3);
    await repository.settleReceivable(
      clinicId,
      OWNER_ID,
      receivables[0]!.id,
      "pix",
    );
    const overdueInCents =
      receivables[1]!.amountInCents + receivables[2]!.amountInCents;

    const list = await app.inject({ url: "/external/v1/groups", headers });
    expect(list.statusCode, list.body).toBe(200);
    const rows = list.json().groups as {
      id: string;
      businessLine: string;
      overdueMembers?: number;
      overdueInCents?: number;
    }[];
    expect(rows.find((row) => row.id === laser.id)).toMatchObject({
      businessLine: "aesthetics",
      enrolled: 2,
      overdueMembers: 1,
      overdueInCents,
    });
    expect(rows.find((row) => row.id === pilates.id)).toMatchObject({
      businessLine: "studio",
      overdueMembers: 0,
      overdueInCents: 0,
    });
    // Mesma conta de `/external/v1/overdue`.
    const report = (
      await app.inject({ url: "/external/v1/overdue", headers })
    ).json();
    expect(
      report.rows.find((row: { patientId: string }) => row.patientId === late)
        ?.amountInCents,
    ).toBe(overdueInCents);
    const details = await app.inject({
      url: `/external/v1/groups/${laser.id}`,
      headers,
    });
    expect(details.statusCode, details.body).toBe(200);
    expect(details.json()).toMatchObject({
      businessLine: "aesthetics",
      overdueMembers: 1,
      overdueInCents,
    });

    // Sem acesso ao Financeiro (recepção): a linha vem, a inadimplência não.
    await seedRoleUsers(app);
    const { generateIntegrationToken } = await import("../integrations/tokens.js");
    const { token } = generateIntegrationToken();
    await repository.createIntegrationKey(
      clinicId,
      roleSub(app, "reception"),
      { name: "Chave da recepção", scopes: ["sales:read"] },
      { prefix: token.slice(0, 12), tokenHash: hashIntegrationToken(token) },
    );
    const reception = { authorization: `Bearer ${token}` };
    const limited = await app.inject({
      url: "/external/v1/groups",
      headers: reception,
    });
    expect(limited.statusCode, limited.body).toBe(200);
    const row = (limited.json().groups as typeof rows).find(
      (item) => item.id === laser.id,
    )!;
    expect(row.businessLine).toBe("aesthetics");
    expect(row).not.toHaveProperty("overdueMembers");
    expect(row).not.toHaveProperty("overdueInCents");
    const limitedDetails = (
      await app.inject({
        url: `/external/v1/groups/${laser.id}`,
        headers: reception,
      })
    ).json();
    expect(limitedDetails.businessLine).toBe("aesthetics");
    expect(limitedDetails).not.toHaveProperty("overdueMembers");
    await app.close();
  });

  it("services without classification come out as null in the services list and in the groups", async () => {
    const { app, repository, admin, createKey } = await setup();
    const { headers } = await createKey();
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers: admin,
      payload: {
        name: "Dança do ventre",
        durationMinutes: 60,
        priceInCents: 8000,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const unclassified = created.json() as {
      id: string;
      businessLine: unknown;
    };
    expect(unclassified.businessLine).toBeNull();
    const laser = await repository.createService(clinicId, {
      name: "Depilação a laser",
      durationMinutes: 30,
      priceInCents: 15_000,
      businessLine: "aesthetics",
    });
    const retired = await repository.createService(clinicId, {
      name: "Serviço antigo",
      durationMinutes: 30,
      priceInCents: 5_000,
      businessLine: "studio",
    });
    await repository.updateAdministrativeRegistry(
      clinicId,
      OWNER_ID,
      retired.id,
      {
        kind: "service",
        data: {
          name: retired.name,
          durationMinutes: 30,
          priceInCents: 5_000,
          active: false,
        },
      },
    );

    // Lista de filtros do painel: só os ativos, com id, nome e linha (null = "Outros").
    const services = await app.inject({
      url: "/external/v1/services",
      headers,
    });
    expect(services.statusCode, services.body).toBe(200);
    const listed = services.json() as {
      id: string;
      name: string;
      businessLine: string | null;
    }[];
    expect(listed.map((item) => item.id)).not.toContain(retired.id);
    expect(listed.find((item) => item.id === unclassified.id)).toMatchObject({
      name: "Dança do ventre",
      businessLine: null,
    });
    expect(listed.find((item) => item.id === laser.id)).toMatchObject({
      name: "Depilação a laser",
      businessLine: "aesthetics",
    });
    for (const item of listed) {
      expect(item).toHaveProperty("businessLine");
      expect(typeof item.name).toBe("string");
    }

    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = (await repository.listRooms(clinicId)).sort(
      (left, right) => right.capacity - left.capacity,
    );
    const group = await repository.createGroupClass(clinicId, {
      serviceId: unclassified.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 2,
      weeklySlots: [{ weekday: 2, startTime: "06:00", endTime: "07:00" }],
    });
    const rowOf = async () =>
      (
        (await app.inject({ url: "/external/v1/groups", headers })).json()
          .groups as { id: string; businessLine: string | null }[]
      ).find((item) => item.id === group.id);
    expect(await rowOf()).toMatchObject({ businessLine: null });
    const details = await app.inject({
      url: `/external/v1/groups/${group.id}`,
      headers,
    });
    expect(details.json()).toMatchObject({ businessLine: null });

    // Classificado no cadastro: a turma acompanha; `null` no PUT volta para sem classificação.
    const edit = (businessLine: string | null) =>
      app.inject({
        method: "PUT",
        url: `/admin/registry/${unclassified.id}`,
        headers: admin,
        payload: {
          kind: "service",
          data: {
            name: "Dança do ventre",
            durationMinutes: 60,
            priceInCents: 8000,
            active: true,
            businessLine,
          },
        },
      });
    expect((await edit("studio")).statusCode).toBe(200);
    expect(await rowOf()).toMatchObject({ businessLine: "studio" });
    expect((await edit(null)).statusCode).toBe(200);
    expect(await rowOf()).toMatchObject({ businessLine: null });

    // Serviço da turma não encontrado no cadastro: também sem classificação (antes, `studio`).
    const registry = repository.getAdministrativeRegistry.bind(repository);
    expect((await edit("aesthetics")).statusCode).toBe(200);
    const missing = vi
      .spyOn(repository, "getAdministrativeRegistry")
      .mockImplementation(async (id: string) => {
        const value = await registry(id);
        return {
          ...value,
          services: value.services.filter(
            (item) => item.id !== unclassified.id,
          ),
        };
      });
    expect(await rowOf()).toMatchObject({ businessLine: null });
    missing.mockRestore();
    expect(await rowOf()).toMatchObject({ businessLine: "aesthetics" });
    await app.close();
  });

  it("group members carry WhatsApp only with patients.view and the overdue only with finance.view", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey();
    const [service] = await repository.listServices(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = (await repository.listRooms(clinicId)).sort(
      (left, right) => right.capacity - left.capacity,
    );
    const group = await repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 2,
      weeklySlots: [{ weekday: 5, startTime: "06:00", endTime: "07:00" }],
    });
    const createPatient = async (name: string, phone: string, whatsapp: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/external/v1/patients",
        headers,
        payload: {
          fullName: name,
          cpf: nextTestCpf(),
          phone,
          whatsapp,
          email: `${phone}@example.com`,
          emergencyContactName: name,
          emergencyContactPhone: phone,
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      return created.json().id as string;
    };
    const sell = async (
      patientId: string,
      firstDueDate: string,
      idempotencyKey: string,
      groupId?: string,
    ) => {
      const plan = await configuredPlan(app, {
        patientId,
        serviceId: service!.id,
        name: "Pilates trimestral",
        kind: "custom" as const,
        totalSessions: 12,
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate,
        validFrom: "2020-01-01",
        validUntil: "2099-12-31",
        autoRenew: false,
      });
      const sold = await app.inject({
        method: "POST",
        url: "/external/v1/plans/purchases",
        headers,
        payload: { idempotencyKey, plan, ...(groupId ? { groupId } : {}) },
      });
      expect(sold.statusCode, sold.body).toBe(201);
    };
    // Atrasada (2020) e em dia (2099) matriculadas; a terceira, atrasada, fica na espera.
    const late = await createPatient("Cliente atrasada", "11911112222", "11933334444");
    const onTime = await createPatient("Cliente em dia", "11955556666", "11955556666");
    const waiting = await createPatient("Cliente na espera", "11977778888", "11977778888");
    await sell(late, "2020-01-10", "8e8e8e8e-8e8e-4e8e-8e8e-8e8e8e8e8e8e", group.id);
    await sell(onTime, "2099-01-10", "9f9f9f9f-9f9f-4f9f-8f9f-9f9f9f9f9f9f", group.id);
    await sell(waiting, "2020-01-10", "a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0");
    const queued = await app.inject({
      method: "POST",
      url: "/external/v1/group-enrollments",
      headers,
      payload: { groupId: group.id, patientId: waiting },
    });
    expect(queued.statusCode, queued.body).toBe(201);
    expect(queued.json().status).toBe("waitlisted");
    const receivables = (await repository.getFinancialSummary(clinicId))
      .receivables.filter((item) => item.patientId === late)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    expect(receivables).toHaveLength(3);
    await repository.settleReceivable(clinicId, OWNER_ID, receivables[0]!.id, "pix");
    const report = (await app.inject({ url: "/external/v1/overdue", headers })).json();
    const lateRow = report.rows.find(
      (row: { patientId: string }) => row.patientId === late,
    );
    const expectedOverdue = {
      amountInCents: receivables[1]!.amountInCents + receivables[2]!.amountInCents,
      installments: 2,
      oldestDueDate: receivables[1]!.dueDate,
      daysOverdue: lateRow.daysOverdue,
    };
    expect(lateRow).toMatchObject({
      amountInCents: expectedOverdue.amountInCents,
      oldestDueDate: expectedOverdue.oldestDueDate,
    });

    type Member = Record<string, unknown> & { patientId: string };
    const detailsAs = async (extra: Record<string, string> = {}) => {
      const response = await app.inject({
        url: `/external/v1/groups/${group.id}`,
        headers: { ...headers, ...extra },
      });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json() as { members: Member[]; waitlist: Member[] };
      const find = (id: string) =>
        [...body.members, ...body.waitlist].find((item) => item.patientId === id)!;
      return { late: find(late), onTime: find(onTime), waiting: find(waiting) };
    };

    // Dono da chave (admin): contato completo e atraso só de quem está ativo e vencido.
    const full = await detailsAs();
    expect(full.late).toMatchObject({
      patientName: "Cliente atrasada",
      phone: "11911112222",
      whatsapp: "11933334444",
      email: "11911112222@example.com",
      status: "active",
      overdue: expectedOverdue,
    });
    expect(full.onTime).toMatchObject({
      phone: "11955556666",
      whatsapp: "11955556666",
      status: "active",
    });
    expect(full.onTime).not.toHaveProperty("overdue");
    expect(full.waiting).toMatchObject({ status: "waitlisted", whatsapp: "11977778888" });
    expect(full.waiting).not.toHaveProperty("overdue");

    // Pessoas logadas no painel, cada uma com as próprias permissões.
    const loginWith = async (email: string, permissions: string[]) => {
      await repository.createAdminUser(
        clinicId,
        OWNER_ID,
        {
          fullName: email,
          email,
          password: "Password123",
          role: "user",
          permissions: permissions as never,
          dashboardAccess: true,
        },
        hashSync("Password123", 4),
      );
      const logged = await app.inject({
        method: "POST",
        url: "/external/v1/auth/login",
        headers,
        payload: { email, password: "Password123" },
      });
      expect(logged.statusCode, logged.body).toBe(200);
      return { "x-crm-user-token": logged.json().token as string };
    };
    const contactKeys = ["phone", "whatsapp", "email"];
    const base = ["groups.view", "plans.view"];

    // Sem patients.view nem finance.view: só nome e situação da inscrição.
    const bare = await detailsAs(await loginWith("turmas@example.com", base));
    for (const person of [bare.late, bare.onTime, bare.waiting]) {
      for (const key of [...contactKeys, "overdue"])
        expect(person).not.toHaveProperty(key);
    }
    expect(bare.late).toMatchObject({
      patientName: "Cliente atrasada",
      status: "active",
    });

    // Com patients.view: contato sim, atraso não.
    const contact = await detailsAs(
      await loginWith("clientes@example.com", [...base, "patients.view"]),
    );
    expect(contact.late).toMatchObject({
      phone: "11911112222",
      whatsapp: "11933334444",
      email: "11911112222@example.com",
    });
    expect(contact.late).not.toHaveProperty("overdue");

    // Com finance.view sem patients.view: atraso sim, contato não.
    const finance = await detailsAs(
      await loginWith("financeiro@example.com", [...base, "finance.view"]),
    );
    expect(finance.late.overdue).toEqual(expectedOverdue);
    for (const key of contactKeys) expect(finance.late).not.toHaveProperty(key);
    expect(finance.waiting).not.toHaveProperty("overdue");
    await app.close();
  });

  it("group list carries the active members' names in enrollment order, without the waitlist", async () => {
    const { app, repository, createKey } = await setup();
    const { headers } = await createKey(["sales:read"]);
    const [service] = await repository.listServices(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = (await repository.listRooms(clinicId)).sort(
      (left, right) => right.capacity - left.capacity,
    );
    const group = await repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity: 2,
      weeklySlots: [{ weekday: 4, startTime: "07:00", endTime: "08:00" }],
    });
    const createPatient = async (fullName: string) =>
      (
        await repository.createPatient(clinicId, {
          fullName,
          cpf: nextTestCpf(),
          phone: "11988887777",
          tags: [],
        })
      ).id;
    // Inscrição fora da ordem alfabética: Zélia antes de Ana; Bruna fica na espera.
    const zelia = await createPatient("Zélia Inscrita Primeiro");
    const ana = await createPatient("Ana Inscrita Depois");
    const bruna = await createPatient("Bruna Na Espera");
    await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: zelia,
      startsOn: "2020-01-01",
    });
    await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: ana,
      startsOn: "2020-02-01",
    });
    const waiting = await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: bruna,
    });
    expect(waiting.status).toBe("waitlisted");

    const namesAs = async (extra: Record<string, string> = {}) => {
      const response = await app.inject({
        url: "/external/v1/groups",
        headers: { ...headers, ...extra },
      });
      expect(response.statusCode, response.body).toBe(200);
      const row = (
        response.json().groups as { id: string; memberNames: string[] }[]
      ).find((item) => item.id === group.id)!;
      const details = await app.inject({
        url: `/external/v1/groups/${group.id}`,
        headers: { ...headers, ...extra },
      });
      expect(details.statusCode, details.body).toBe(200);
      expect(details.json().memberNames).toEqual(row.memberNames);
      return row.memberNames;
    };
    const expected = ["Zélia Inscrita Primeiro", "Ana Inscrita Depois"];
    // Dono da chave (admin, com patients.view).
    expect(await namesAs()).toEqual(expected);

    const loginWith = async (email: string, permissions: string[]) => {
      await repository.createAdminUser(
        clinicId,
        OWNER_ID,
        {
          fullName: email,
          email,
          password: "Password123",
          role: "user",
          permissions: permissions as never,
          dashboardAccess: true,
        },
        hashSync("Password123", 4),
      );
      const logged = await app.inject({
        method: "POST",
        url: "/external/v1/auth/login",
        headers,
        payload: { email, password: "Password123" },
      });
      expect(logged.statusCode, logged.body).toBe(200);
      return { "x-crm-user-token": logged.json().token as string };
    };
    const base = ["groups.view", "plans.view"];
    // Sem patients.view: os mesmos nomes (só o nome, como no detalhe).
    expect(
      await namesAs(await loginWith("turmas-nomes@example.com", base)),
    ).toEqual(expected);
    expect(
      await namesAs(
        await loginWith("clientes-nomes@example.com", [...base, "patients.view"]),
      ),
    ).toEqual(expected);
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
