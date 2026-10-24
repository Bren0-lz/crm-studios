import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  type UserRole,
  authenticatedApp,
  configuredPlan,
  roleSub,
  seedRoleUsers,
  tokenRole,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { patchStatusAt } from "../../test-support/clock.js";

describe("CRM API", () => {
  it("links users to agenda professionals and sets their commission rule, owner only", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    await seedRoleUsers(app);
    const ana = "33333333-3333-4333-8333-333333333333";
    const other = "44444444-4444-4444-8444-444444444444";
    const missing = "99999999-9999-4999-8999-999999999999";
    const createUser = async (email: string) => {
      const created = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          fullName: "Instrutora Teste",
          email,
          role: "user",
          password: "Segura@1234",
        },
      });
      expect(created.statusCode).toBe(201);
      return created.json().id as string;
    };
    const userA = await createUser("instrutora.a@movimenta.local");
    const userB = await createUser("instrutora.b@movimenta.local");
    const link = (userId: string, professionalId: string | null) =>
      app.inject({
        method: "PUT",
        url: `/admin/users/${userId}/professional`,
        headers,
        payload: { professionalId },
      });
    const commission = (userId: string, payload: Record<string, unknown>) =>
      app.inject({
        method: "PUT",
        url: `/admin/users/${userId}/commission`,
        headers,
        payload,
      });

    // A comissão é do próprio usuário: não exige profissional ligado.
    const withoutProfessional = await commission(userA, {
      percentage: 30,
      effectiveFrom: "2019-01-01",
    });
    expect(withoutProfessional.statusCode).toBe(200);
    expect(withoutProfessional.json()).toMatchObject({
      id: userA,
      commissionPercentage: 30,
      commissionEffectiveFrom: "2019-01-01",
    });
    expect(withoutProfessional.json().professionalId).toBeUndefined();
    expect((await link(missing, ana)).json().code).toBe("USER_NOT_FOUND");
    expect((await link(missing, ana)).statusCode).toBe(404);
    const unknownProfessional = await link(userA, missing);
    expect(unknownProfessional.statusCode).toBe(404);
    expect(unknownProfessional.json().code).toBe("PROFESSIONAL_NOT_FOUND");
    expect((await link(userA, "nao-e-uuid")).statusCode).toBe(400);
    expect(
      (
        await commission(missing, {
          percentage: 10,
          effectiveFrom: "2020-01-01",
        })
      ).statusCode,
    ).toBe(404);

    const linked = await link(userA, ana);
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toMatchObject({
      id: userA,
      professionalId: ana,
      professionalName: "Dra. Ana Martins",
      commissionPercentage: 30,
    });

    const taken = await link(userB, ana);
    expect(taken.statusCode).toBe(409);
    expect(taken.json().code).toBe("PROFESSIONAL_ALREADY_LINKED");

    const rule = await commission(userA, {
      percentage: 40,
      effectiveFrom: "2020-01-01",
    });
    expect(rule.statusCode).toBe(200);
    expect(rule.json()).toMatchObject({
      professionalId: ana,
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    // Regra futura não vale hoje; mesma vigência com o mesmo valor não muda nada (nem audita);
    // percentual fora de 0–100 é recusado.
    const future = await commission(userA, {
      percentage: 50,
      effectiveFrom: "2999-01-01",
    });
    expect(future.json()).toMatchObject({
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    const sameValue = await commission(userA, {
      percentage: 40,
      effectiveFrom: "2020-01-01",
    });
    expect(sameValue.statusCode).toBe(200);
    expect(sameValue.json()).toMatchObject({
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    expect(
      (
        await commission(userA, {
          percentage: 101,
          effectiveFrom: "2020-01-01",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await commission(userA, { percentage: 10, effectiveFrom: "01/01/2020" }))
        .statusCode,
    ).toBe(400);

    // A regra é do usuário: não vira regra do profissional na tela do Financeiro.
    const workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const rules = (
      workspace.json().commissionRules as Array<{
        professionalId: string;
        percentage: number;
      }>
    )
      .filter((item) => item.professionalId === ana)
      .map((item) => item.percentage);
    expect(rules).toEqual([]);

    const users = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers,
    });
    expect(
      users.json().find((item: { id: string }) => item.id === userA),
    ).toMatchObject({
      professionalId: ana,
      professionalName: "Dra. Ana Martins",
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });
    expect(
      users.json().find((item: { id: string }) => item.id === userB)
        .professionalId,
    ).toBeUndefined();

    // Ligar a outro profissional troca a ligação e libera o anterior.
    const switched = await link(userA, other);
    expect(switched.statusCode).toBe(200);
    expect(switched.json().professionalId).toBe(other);
    // A comissão acompanha o usuário, não o profissional.
    expect(switched.json().commissionPercentage).toBe(40);
    const userBLinked = await link(userB, ana);
    expect(userBLinked.json().professionalId).toBe(ana);
    expect(userBLinked.json().commissionPercentage).toBeUndefined();
    const unlinked = await link(userA, null);
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json().professionalId).toBeUndefined();
    expect(unlinked.json().professionalName).toBeUndefined();
    expect(unlinked.json()).toMatchObject({
      commissionPercentage: 40,
      commissionEffectiveFrom: "2020-01-01",
    });

    for (const role of ["reception", "physiotherapist", "finance"] as const) {
      const roleHeaders = {
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId: "11111111-1111-4111-8111-111111111111", role: tokenRole(role) })}`,
      };
      const denied = await app.inject({
        method: "PUT",
        url: `/admin/users/${userB}/professional`,
        headers: roleHeaders,
        payload: { professionalId: null },
      });
      expect(denied.statusCode).toBe(403);
      const deniedCommission = await app.inject({
        method: "PUT",
        url: `/admin/users/${userB}/commission`,
        headers: roleHeaders,
        payload: { percentage: 10, effectiveFrom: "2021-01-01" },
      });
      expect(deniedCommission.statusCode).toBe(403);
    }

    const audit = await app.inject({
      method: "GET",
      url: "/admin/audit-events",
      headers,
    });
    const events = audit.json() as Array<{
      action: string;
      entityId?: string;
      metadata: Record<string, unknown>;
    }>;
    const linkEvents = events.filter(
      (item) =>
        item.action === "users.professional_updated" && item.entityId === userA,
    );
    expect(linkEvents.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        { professionalId: ana, previousProfessionalId: null },
        { professionalId: other, previousProfessionalId: ana },
        { professionalId: null, previousProfessionalId: other },
      ]),
    );
    const commissionEvents = events.filter(
      (item) =>
        item.action === "users.commission_updated" && item.entityId === userA,
    );
    expect(commissionEvents).toHaveLength(3);
    expect(commissionEvents.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          percentage: 30,
          effectiveFrom: "2019-01-01",
        }),
        expect.objectContaining({
          percentage: 40,
          effectiveFrom: "2020-01-01",
        }),
        expect.objectContaining({
          percentage: 50,
          effectiveFrom: "2999-01-01",
        }),
      ]),
    );
    await app.close();
  });

  it("creates a user with a commission, without an agenda professional", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const base = { role: "user", password: "Segura@1234" };
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        ...base,
        fullName: "Instrutora Comissão",
        email: "instrutora.comissao@movimenta.local",
        commission: { percentage: 25.5, effectiveFrom: "2020-03-01" },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      commissionPercentage: 25.5,
      commissionEffectiveFrom: "2020-03-01",
    });
    expect(created.json().professionalId).toBeUndefined();
    const userId = created.json().id as string;

    // Vigência futura: gravada, mas ainda não vale hoje.
    const future = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        ...base,
        fullName: "Instrutora Futura",
        email: "instrutora.futura@movimenta.local",
        commission: { percentage: 40, effectiveFrom: "2999-01-01" },
      },
    });
    expect(future.statusCode).toBe(201);
    expect(future.json().commissionPercentage).toBeUndefined();
    const futureUpdated = await app.inject({
      method: "PUT",
      url: `/admin/users/${future.json().id}/commission`,
      headers,
      payload: { percentage: 15, effectiveFrom: "2021-01-01" },
    });
    expect(futureUpdated.json()).toMatchObject({
      commissionPercentage: 15,
      commissionEffectiveFrom: "2021-01-01",
    });

    for (const commission of [
      { percentage: 101, effectiveFrom: "2020-01-01" },
      { percentage: 10, effectiveFrom: "01/01/2020" },
      { percentage: 10 },
    ]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/admin/users",
        headers,
        payload: {
          ...base,
          fullName: "Inválida",
          email: "invalida@movimenta.local",
          commission,
        },
      });
      expect(invalid.statusCode).toBe(400);
    }
    const users = (
      await app.inject({ method: "GET", url: "/admin/users", headers })
    ).json() as Array<{ email: string }>;
    expect(
      users.some((item) => item.email === "invalida@movimenta.local"),
    ).toBe(false);

    const listed = (
      await app.inject({ method: "GET", url: "/admin/users", headers })
    )
      .json()
      .find((item: { id: string }) => item.id === userId);
    expect(listed).toMatchObject({
      commissionPercentage: 25.5,
      commissionEffectiveFrom: "2020-03-01",
    });

    const audit = (
      await app.inject({ method: "GET", url: "/admin/audit-events", headers })
    ).json() as Array<{
      action: string;
      entityId?: string;
      metadata: Record<string, unknown>;
    }>;
    const events = audit.filter(
      (item) =>
        item.action === "users.commission_updated" && item.entityId === userId,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({
      percentage: 25.5,
      effectiveFrom: "2020-03-01",
    });
    await app.close();
  });

  it("generates commissions with the linked user's rule, falling back to the professional's rule", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const ana = "33333333-3333-4333-8333-333333333333";
    const other = "44444444-4444-4444-8444-444444444444";
    const [patients, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const service = services.json()[0] as { id: string; priceInCents: number };
    const completedAppointment = async (
      professionalId: string,
      startsAt: string,
    ) => {
      const created = await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          professionalId,
          roomId: rooms.json()[0].id,
          serviceId: service.id,
          startsAt,
        },
      });
      expect(created.statusCode).toBe(201);
      const done = await patchStatusAt(
        app,
        headers,
        new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
        created.json().id,
        { status: "completed" },
      );
      expect(done.statusCode).toBe(200);
      return created.json().id as string;
    };
    // Regras antigas, por profissional (Financeiro).
    for (const [professionalId, percentage] of [
      [ana, 10],
      [other, 20],
    ] as const) {
      const rule = await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers,
        payload: { professionalId, percentage, effectiveFrom: "2031-01-01" },
      });
      expect(rule.statusCode).toBe(201);
    }
    // Usuária ligada à Ana com regra própria a partir de 15/05.
    const user = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Ana Usuária",
        email: "ana.usuaria@movimenta.local",
        role: "user",
        password: "Segura@1234",
        commission: { percentage: 35, effectiveFrom: "2031-05-15" },
      },
    });
    expect(user.statusCode).toBe(201);
    const linked = await app.inject({
      method: "PUT",
      url: `/admin/users/${user.json().id}/professional`,
      headers,
      payload: { professionalId: ana },
    });
    expect(linked.statusCode).toBe(200);
    // Usuária sem profissional ligado: a regra dela não gera nada.
    await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Sem Agenda",
        email: "sem.agenda@movimenta.local",
        role: "user",
        password: "Segura@1234",
        commission: { percentage: 90, effectiveFrom: "2031-01-01" },
      },
    });

    const beforeUserRule = await completedAppointment(
      ana,
      "2031-05-06T13:00:00.000Z",
    );
    const withUserRule = await completedAppointment(
      ana,
      "2031-05-20T13:00:00.000Z",
    );
    const unlinkedProfessional = await completedAppointment(
      other,
      "2031-05-20T15:00:00.000Z",
    );

    const generate = () =>
      app.inject({
        method: "POST",
        url: "/finance/commissions/generate",
        headers,
        payload: { competence: "2031-05" },
      });
    const first = await generate();
    expect(first.statusCode).toBe(200);
    const byAppointment = (
      entries: Array<{
        appointmentId: string;
        percentage: number;
        amountInCents: number;
        professionalId: string;
      }>,
    ) => new Map(entries.map((item) => [item.appointmentId, item]));
    const entries = byAppointment(first.json());
    expect(entries.size).toBe(3);
    expect(entries.get(beforeUserRule)).toMatchObject({
      professionalId: ana,
      percentage: 10,
    });
    expect(entries.get(withUserRule)).toMatchObject({
      professionalId: ana,
      percentage: 35,
      amountInCents: Math.round((service.priceInCents * 35) / 100),
    });
    expect(entries.get(unlinkedProfessional)).toMatchObject({
      professionalId: other,
      percentage: 20,
    });

    // Gerar de novo não duplica nem recalcula.
    await app.inject({
      method: "PUT",
      url: `/admin/users/${user.json().id}/commission`,
      headers,
      payload: { percentage: 50, effectiveFrom: "2031-05-01" },
    });
    const second = await generate();
    expect(second.json()).toHaveLength(3);
    expect(byAppointment(second.json()).get(beforeUserRule)).toMatchObject({
      percentage: 10,
    });

    // A regra de 15/05 já gerou lançamento: corrigir o percentual dela é bloqueado.
    const blocked = await app.inject({
      method: "PUT",
      url: `/admin/users/${user.json().id}/commission`,
      headers,
      payload: { percentage: 40, effectiveFrom: "2031-05-15" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      code: "COMMISSION_RULE_DUPLICATE",
      message:
        "Esta comissão já foi usada em lançamentos; escolha outra data de início.",
    });
    // A regra de 01/05 (sem lançamentos) ainda pode ser corrigida.
    const correctable = await app.inject({
      method: "PUT",
      url: `/admin/users/${user.json().id}/commission`,
      headers,
      payload: { percentage: 45, effectiveFrom: "2031-05-01" },
    });
    expect(correctable.statusCode).toBe(200);
    expect(
      byAppointment((await generate()).json()).get(withUserRule),
    ).toMatchObject({ percentage: 35 });
    await app.close();
  });

  it("corrects the percentage of a user's commission period on the same start date", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Correção Mesmo Dia",
        email: "correcao.mesmo.dia@movimenta.local",
        role: "user",
        password: "Segura@1234",
        commission: { percentage: 20, effectiveFrom: "2020-06-01" },
      },
    });
    expect(created.statusCode).toBe(201);
    const userId = created.json().id as string;
    const commission = (
      payload: Record<string, unknown>,
      requestHeaders = headers,
    ) =>
      app.inject({
        method: "PUT",
        url: `/admin/users/${userId}/commission`,
        headers: requestHeaders,
        payload,
      });
    const auditEvents = async () =>
      (
        (
          await app.inject({
            method: "GET",
            url: "/admin/audit-events",
            headers,
          })
        ).json() as Array<{
          action: string;
          entityId?: string;
          metadata: Record<string, unknown>;
        }>
      ).filter(
        (item) =>
          item.action === "users.commission_updated" &&
          item.entityId === userId,
      );

    // Mesma data, outro percentual: substitui a vigência (não cria outra) e audita antes/depois.
    const replaced = await commission({
      percentage: 25,
      effectiveFrom: "2020-06-01",
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject({
      commissionPercentage: 25,
      commissionEffectiveFrom: "2020-06-01",
    });
    let events = await auditEvents();
    expect(events).toHaveLength(2);
    expect(events.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          percentage: 25,
          previousPercentage: 20,
          effectiveFrom: "2020-06-01",
        }),
      ]),
    );

    // Mesmo valor: nada muda e não há auditoria.
    const same = await commission({
      percentage: 25,
      effectiveFrom: "2020-06-01",
    });
    expect(same.statusCode).toBe(200);
    expect(same.json()).toMatchObject({
      commissionPercentage: 25,
      commissionEffectiveFrom: "2020-06-01",
    });
    expect(await auditEvents()).toHaveLength(2);

    // Outra data cria uma vigência nova; a anterior continua igual.
    const next = await commission({
      percentage: 30,
      effectiveFrom: "2021-01-01",
    });
    expect(next.statusCode).toBe(200);
    expect(next.json()).toMatchObject({
      commissionPercentage: 30,
      commissionEffectiveFrom: "2021-01-01",
    });
    events = await auditEvents();
    expect(events).toHaveLength(3);
    expect(events.map((item) => item.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          percentage: 30,
          effectiveFrom: "2021-01-01",
        }),
      ]),
    );

    // Só admin.
    await seedRoleUsers(app);
    const userHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, "reception"), clinicId: "11111111-1111-4111-8111-111111111111", role: tokenRole("reception") })}`,
    };
    const denied = await commission(
      { percentage: 99, effectiveFrom: "2021-01-01" },
      userHeaders,
    );
    expect(denied.statusCode).toBe(403);
    const listed = (
      await app.inject({ method: "GET", url: "/admin/users", headers })
    )
      .json()
      .find((item: { id: string }) => item.id === userId);
    expect(listed).toMatchObject({
      commissionPercentage: 30,
      commissionEffectiveFrom: "2021-01-01",
    });
    await app.close();
  });

  it("returns the client contact of a receivable to finance users only", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const headersAs = (role: UserRole) => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const [patientsResponse, servicesResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patient = patientsResponse.json()[0];
    const service = servicesResponse.json()[0];
    const date = saoPauloToday();
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          { serviceId: service.id, totalSessions: 1, totalValueInCents: 9_000 },
        ],
        patientId: patient.id,
        serviceId: service.id,
        name: "Plano para cobrança",
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: date,
        totalValueInCents: 9_000,
        installments: 1,
        firstDueDate: date,
      }),
    });
    expect(plan.statusCode).toBe(201);
    const workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const receivable = workspace
      .json()
      .summary.receivables.find(
        (item: { patientId: string }) => item.patientId === patient.id,
      );
    const contact = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivable.id}/contact`,
      headers: headersAs("finance"),
    });
    expect(contact.statusCode).toBe(200);
    expect(contact.json()).toEqual({
      receivableId: receivable.id,
      patientId: patient.id,
      patientName: patient.fullName,
      phone: patient.phone,
      ...(patient.whatsapp ? { whatsapp: patient.whatsapp } : {}),
    });
    const missing = await app.inject({
      method: "GET",
      url: "/finance/receivables/99999999-9999-4999-8999-999999999999/contact",
      headers,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("RECEIVABLE_NOT_FOUND");
    const denied = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivable.id}/contact`,
      headers: headersAs("physiotherapist"),
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it("operates receivables, payables, receipts and monthly cash flow", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patientsResponse, servicesResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patient = patientsResponse.json()[0];
    const service = servicesResponse.json()[0];
    const date = new Date().toISOString().slice(0, 10);

    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          {
            serviceId: service.id,
            totalSessions: 1,
            totalValueInCents: 12_000,
          },
        ],
        patientId: patient.id,
        serviceId: service.id,
        name: "Plano financeiro",
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: date,
        totalValueInCents: 12_000,
        installments: 1,
        firstDueDate: date,
      }),
    });
    expect(plan.statusCode).toBe(201);

    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const receivableId = workspace.json().summary.receivables[0].id;
    const adjusted = await app.inject({
      method: "PATCH",
      url: `/finance/receivables/${receivableId}/adjust`,
      headers,
      payload: {
        amountInCents: 11_500,
        reason: "Desconto comercial autorizado",
      },
    });
    expect(adjusted.json()).toMatchObject({
      amountInCents: 11_500,
      status: "open",
    });
    const received = await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivableId}/pay`,
      headers,
      payload: { paymentMethod: "card" },
    });
    expect(received.json()).toMatchObject({
      status: "paid",
      paymentMethod: "card",
    });
    const receipt = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivableId}/receipt`,
      headers,
    });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.json()).toMatchObject({
      patientName: patient.fullName,
      amountInCents: 11_500,
      paymentMethod: "card",
      receiptNumber: "REC-00001",
    });
    // QM15: reemitir o recibo da mesma cobrança devolve o mesmo número.
    const reissued = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivableId}/receipt`,
      headers,
    });
    expect(reissued.json().receiptNumber).toBe("REC-00001");

    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const costCenter = workspace.json().costCenters[0];
    const payable = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Aluguel da unidade",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
        dueDate: date,
        amountInCents: 4_000,
      },
    });
    expect(payable.statusCode).toBe(201);
    const expense = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(expense.json()).toMatchObject({
      status: "paid",
      paymentMethod: "pix",
    });

    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json()).toMatchObject({
      paidExpensesThisMonthInCents: 4_000,
      cashBalanceThisMonthInCents: 7_500,
    });

    const reversed = await app.inject({
      method: "POST",
      url: `/finance/payables/${payable.json().id}/reverse`,
      headers,
    });
    expect(reversed.json()).toMatchObject({ status: "open" });
    await app.close();
  });

  it("reports the daily cash by payment method on the clinic day", async () => {
    const { app, token } = await authenticatedApp();
    const setupHeaders = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms, workspace] =
      await Promise.all([
        app.inject({ method: "GET", url: "/patients", headers: setupHeaders }),
        app.inject({ method: "GET", url: "/services", headers: setupHeaders }),
        app.inject({
          method: "GET",
          url: "/professionals",
          headers: setupHeaders,
        }),
        app.inject({ method: "GET", url: "/rooms", headers: setupHeaders }),
        app.inject({
          method: "GET",
          url: "/finance/workspace",
          headers: setupHeaders,
        }),
      ]);
    const clinicId = "11111111-1111-4111-8111-111111111111";
    await seedRoleUsers(app);
    const headersAs = (role: UserRole = "owner") => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
    });
    const at = (iso: string) => vi.setSystemTime(new Date(iso));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 12h de São Paulo em 10/03/2031.
      at("2031-03-10T15:00:00.000Z");
      const headers = headersAs();
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          services: [
            {
              serviceId: services.json()[0].id,
              totalSessions: 1,
              totalValueInCents: 12_000,
            },
          ],
          patientId: patients.json()[0].id,
          serviceId: services.json()[0].id,
          name: "Plano do caixa",
          kind: "fixed_package",
          totalSessions: 1,
          validFrom: "2031-03-10",
          totalValueInCents: 12_000,
          installments: 1,
          firstDueDate: "2031-03-10",
        }),
      });
      expect(plan.statusCode).toBe(201);
      const receivable = (
        await app.inject({ method: "GET", url: "/finance/workspace", headers })
      )
        .json()
        .summary.receivables.find(
          (item: { planId?: string }) => item.planId === plan.json().id,
        );
      const paid = await app.inject({
        method: "POST",
        url: `/finance/receivables/${receivable.id}/pay`,
        headers,
        payload: { paymentMethod: "card" },
      });
      expect(paid.statusCode).toBe(200);

      at("2031-03-10T16:00:00.000Z");
      const payable = await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers,
        payload: {
          description: "Material de limpeza",
          supplier: "Mercado Central",
          categoryId: workspace
            .json()
            .categories.find(
              (item: { kind: string }) => item.kind === "expense",
            ).id,
          costCenterId: workspace.json().costCenters[0].id,
          dueDate: "2031-03-10",
          amountInCents: 4_000,
        },
      });
      expect(payable.statusCode).toBe(201);
      await app.inject({
        method: "POST",
        url: `/finance/payables/${payable.json().id}/pay`,
        headers,
        payload: { paymentMethod: "pix" },
      });

      const appointment = await app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patients.json()[0].id,
          professionalId: professionals.json()[0].id,
          roomId: rooms.json()[0].id,
          serviceId: services.json()[0].id,
          startsAt: "2031-03-10T13:00:00.000Z",
        },
      });
      expect(appointment.statusCode).toBe(201);
      await app.inject({
        method: "PATCH",
        url: `/appointments/${appointment.json().id}/status`,
        headers,
        payload: { status: "completed" },
      });
      await app.inject({
        method: "POST",
        url: "/finance/commission-rules",
        headers,
        payload: {
          professionalId: professionals.json()[0].id,
          percentage: 30,
          effectiveFrom: "2031-03-01",
        },
      });
      const commissions = await app.inject({
        method: "POST",
        url: "/finance/commissions/generate",
        headers,
        payload: { competence: "2031-03" },
      });
      expect(commissions.json()).toHaveLength(1);
      const commission = commissions.json()[0];

      // 23h30 de São Paulo, ainda 10/03 (já 11/03 em UTC): estorno e comissão.
      at("2031-03-11T02:30:00.000Z");
      const reversed = await app.inject({
        method: "POST",
        url: `/finance/receivables/${receivable.id}/reverse`,
        headers,
      });
      expect(reversed.statusCode).toBe(200);
      at("2031-03-11T02:40:00.000Z");
      const commissionPaid = await app.inject({
        method: "POST",
        url: `/finance/commissions/${commission.id}/pay`,
        headers,
      });
      expect(commissionPaid.statusCode).toBe(200);

      // Sem data: vale o dia de hoje na clínica (ainda 10/03).
      const today = await app.inject({
        method: "GET",
        url: "/finance/daily-cash",
        headers,
      });
      expect(today.statusCode).toBe(200);
      const explicit = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-03-10",
        headers: headersAs("finance"),
      });
      expect(explicit.statusCode).toBe(200);
      expect(explicit.json()).toEqual(today.json());
      const cash = today.json();
      expect(cash).toMatchObject({
        date: "2031-03-10",
        totalInflowInCents: 0,
        totalOutflowInCents: 4_000 + commission.amountInCents,
        balanceInCents: -(4_000 + commission.amountInCents),
      });
      expect(cash.byPaymentMethod).toEqual([
        {
          paymentMethod: "pix",
          inflowInCents: 0,
          outflowInCents: 4_000,
          balanceInCents: -4_000,
        },
        {
          paymentMethod: "card",
          inflowInCents: 0,
          outflowInCents: 0,
          balanceInCents: 0,
        },
        {
          paymentMethod: "unspecified",
          inflowInCents: 0,
          outflowInCents: commission.amountInCents,
          balanceInCents: -commission.amountInCents,
        },
      ]);
      expect(
        cash.movements.map((item: { kind: string; amountInCents: number }) => [
          item.kind,
          item.amountInCents,
        ]),
      ).toEqual([
        ["receipt", 12_000],
        ["payable", 4_000],
        ["receipt_reversal", -12_000],
        ["commission", commission.amountInCents],
      ]);
      expect(cash.movements[2]).toMatchObject({
        occurredAt: "2031-03-11T02:30:00.000Z",
        paymentMethod: "card",
        direction: "in",
      });

      const nextDay = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-03-11",
        headers,
      });
      expect(nextDay.json()).toMatchObject({
        date: "2031-03-11",
        byPaymentMethod: [],
        totalInflowInCents: 0,
        totalOutflowInCents: 0,
        balanceInCents: 0,
        movements: [],
      });

      const invalid = await app.inject({
        method: "GET",
        url: "/finance/daily-cash?date=2031-02-30",
        headers,
      });
      expect(invalid.statusCode).toBe(400);
      const denied = await app.inject({
        method: "GET",
        url: "/finance/daily-cash",
        headers: headersAs("reception"),
      });
      expect(denied.statusCode).toBe(403);
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("forecasts confirmed and projected cash flow by month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo em 10/12/2031: o horizonte de 3 meses vira o ano.
    vi.setSystemTime(new Date("2031-12-10T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      const forecast = async (query = "?months=3") => {
        const response = await app.inject({
          method: "GET",
          url: `/finance/forecast${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      // Os dados demo também entram: compara-se a diferença.
      const before = await forecast();
      expect(before).toMatchObject({
        startMonth: "2031-12",
        endMonth: "2032-02",
      });
      expect(
        before.months.map((item: { month: string }) => item.month),
      ).toEqual(["2031-12", "2032-01", "2032-02"]);

      const [patients, services, workspace] = await Promise.all([
        app.inject({ method: "GET", url: "/patients", headers }),
        app.inject({ method: "GET", url: "/services", headers }),
        app.inject({ method: "GET", url: "/finance/workspace", headers }),
      ]);
      const planBase = {
        services: [
          {
            serviceId: services.json()[0].id,
            totalSessions: 4,
            totalValueInCents: 12_000,
          },
        ],
        patientId: patients.json()[0].id,
        serviceId: services.json()[0].id,
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: "2031-12-01",
        validUntil: "2031-12-31",
        totalValueInCents: 12_000,
        installments: 2,
        firstDueDate: "2031-12-15",
      };
      const created = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          ...planBase,
          name: "Plano mensal renovável",
          autoRenew: true,
        }),
      });
      expect(created.statusCode).toBe(201);
      const withoutRenewal = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          ...planBase,
          name: "Plano sem renovação",
          autoRenew: false,
        }),
      });
      expect(withoutRenewal.statusCode).toBe(201);
      const cancelled = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          ...planBase,
          name: "Plano cancelado",
          autoRenew: true,
        }),
      });
      await app.inject({
        method: "PATCH",
        url: `/plans/${cancelled.json().id}/status`,
        headers,
        payload: { status: "cancelled" },
      });
      const expense = {
        description: "Aluguel da sala",
        categoryId: workspace
          .json()
          .categories.find((item: { kind: string }) => item.kind === "expense")
          .id,
        costCenterId: workspace.json().costCenters[0].id,
        amountInCents: 1_000,
        dayOfMonth: 5,
        startMonth: "2031-11",
      };
      for (const payload of [
        expense,
        { ...expense, amountInCents: 9_000, active: false },
        { ...expense, amountInCents: 500, endMonth: "2031-12" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers,
          payload,
        });
        expect(response.statusCode).toBe(201);
      }

      const after = await forecast();
      const delta = (
        month: number,
        part: "confirmed" | "projected",
        field: "inflowInCents" | "outflowInCents",
      ) => after.months[month][part][field] - before.months[month][part][field];
      // Plano em 2 parcelas: dez e jan confirmados; renovações em jan e fev projetadas.
      expect(
        [0, 1, 2].map((m) => delta(m, "confirmed", "inflowInCents")),
      ).toEqual([6_000 + 6_000, 6_000 + 6_000, 0]);
      expect(
        [0, 1, 2].map((m) => delta(m, "projected", "inflowInCents")),
      ).toEqual([0, 6_000, 12_000]);
      // Despesas: nov (atrasada) e dez lançadas; jan e fev projetadas.
      expect(
        [0, 1, 2].map((m) => delta(m, "confirmed", "outflowInCents")),
      ).toEqual([1_000 + 500, 0, 0]);
      expect(
        [0, 1, 2].map((m) => delta(m, "projected", "outflowInCents")),
      ).toEqual([0, 1_000, 1_000]);
      expect(after.overdue.outflowInCents - before.overdue.outflowInCents).toBe(
        1_000 + 500,
      );
      expect(after.totals.balanceInCents - before.totals.balanceInCents).toBe(
        24_000 + 18_000 - 1_500 - 2_000,
      );
      for (const month of after.months)
        expect(month.balanceInCents).toBe(
          month.confirmed.balanceInCents + month.projected.balanceInCents,
        );

      // Consultar de novo não duplica nada (renovação e competências já lançadas).
      expect(await forecast()).toEqual({
        ...after,
        generatedAt: expect.any(String),
      });

      const standard = await forecast("");
      expect(standard.months).toHaveLength(6);
      expect(standard.endMonth).toBe("2032-05");
      for (const query of [
        "?months=0",
        "?months=13",
        "?months=abc",
        "?months=2.5",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/finance/forecast${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/finance/forecast",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      const denied = await app.inject({
        method: "GET",
        url: "/finance/forecast",
        headers: headersAs("reception"),
      });
      expect(denied.statusCode).toBe(403);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("generates fixed monthly expenses once per month, catching up and respecting pause and end", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const at = (iso: string) => vi.setSystemTime(new Date(iso));
      let workspace = await app.inject({
        method: "GET",
        url: "/finance/workspace",
        headers: headersAs(),
      });
      const category = workspace
        .json()
        .categories.find((item: { kind: string }) => item.kind === "expense");
      const income = workspace
        .json()
        .categories.find((item: { kind: string }) => item.kind === "income");
      const costCenter = workspace.json().costCenters[0];
      const base = {
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
        amountInCents: 250_000,
        dayOfMonth: 5,
        startMonth: "2026-07",
      };

      const denied = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs("reception"),
        payload: base,
      });
      expect(denied.statusCode).toBe(403);
      for (const invalid of [
        { ...base, dayOfMonth: 29 },
        { ...base, dayOfMonth: 0 },
        { ...base, startMonth: "2026-13" },
        { ...base, endMonth: "2026-06" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers: headersAs(),
          payload: invalid,
        });
        expect(response.statusCode).toBe(400);
      }
      if (income) {
        const wrongKind = await app.inject({
          method: "POST",
          url: "/finance/recurring-payables",
          headers: headersAs(),
          payload: { ...base, categoryId: income.id },
        });
        expect(wrongKind.statusCode).toBe(404);
        expect(wrongKind.json().code).toBe(
          "FINANCIAL_CLASSIFICATION_NOT_FOUND",
        );
      }

      const created = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs(),
        payload: base,
      });
      expect(created.statusCode).toBe(201);
      const model = created.json() as { id: string };
      expect(created.json()).toMatchObject({
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryName: category.name,
        costCenterName: costCenter.name,
        amountInCents: 250_000,
        dayOfMonth: 5,
        startMonth: "2026-07",
        active: true,
      });
      expect(created.json().endMonth).toBeUndefined();

      const generated = async () => {
        workspace = await app.inject({
          method: "GET",
          url: "/finance/workspace",
          headers: headersAs(),
        });
        expect(workspace.statusCode).toBe(200);
        return (
          workspace.json().payables as {
            recurringPayableId?: string;
            competence?: string;
            dueDate: string;
            amountInCents: number;
            status: string;
          }[]
        )
          .filter((item) => item.recurringPayableId === model.id)
          .sort((a, b) => a.competence!.localeCompare(b.competence!));
      };

      // Abrir o financeiro gera do mês inicial até o mês atual.
      let payables = await generated();
      expect(payables.map((item) => item.competence)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
      ]);
      expect(payables.map((item) => item.dueDate)).toEqual([
        "2026-07-05",
        "2026-08-05",
        "2026-09-05",
        "2026-10-05",
      ]);
      expect(payables[0]).toMatchObject({
        amountInCents: 250_000,
        status: "open",
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        categoryId: category.id,
        costCenterId: costCenter.id,
      });

      // Idempotente: abrir de novo não duplica.
      expect(await generated()).toHaveLength(4);
      const listed = await app.inject({
        method: "GET",
        url: "/finance/recurring-payables",
        headers: headersAs(),
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual([
        expect.objectContaining({ id: model.id, lastCompetence: "2026-10" }),
      ]);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/finance/recurring-payables",
            headers: headersAs("reception"),
          })
        ).statusCode,
      ).toBe(403);

      // Meses sem abrir o financeiro são recuperados uma vez.
      at("2027-01-15T15:00:00.000Z");
      payables = await generated();
      expect(payables.map((item) => item.competence)).toEqual([
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
        "2026-11",
        "2026-12",
        "2027-01",
      ]);
      expect(payables.at(-1)!.dueDate).toBe("2027-01-05");
      expect(await generated()).toHaveLength(7);

      // Pausa: nada é gerado; ao reativar, só a partir do mês da reativação.
      const paused = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, active: false },
      });
      expect(paused.statusCode).toBe(200);
      expect(paused.json().active).toBe(false);
      at("2027-03-10T15:00:00.000Z");
      expect(await generated()).toHaveLength(7);
      at("2027-04-10T15:00:00.000Z");
      const resumed = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, amountInCents: 260_000, active: true },
      });
      expect(resumed.json()).toMatchObject({
        active: true,
        resumedFromMonth: "2027-04",
        amountInCents: 260_000,
      });
      payables = await generated();
      expect(payables.map((item) => item.competence).slice(-2)).toEqual([
        "2027-01",
        "2027-04",
      ]);
      expect(payables.at(-1)!.amountInCents).toBe(260_000);
      expect(payables[0]!.amountInCents).toBe(250_000);

      // Encerramento: nada depois do mês final.
      const ended = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
        payload: { ...base, amountInCents: 260_000, endMonth: "2027-05" },
      });
      expect(ended.json()).toMatchObject({
        endMonth: "2027-05",
        resumedFromMonth: "2027-04",
      });
      at("2027-08-20T15:00:00.000Z");
      payables = await generated();
      expect(payables.map((item) => item.competence).slice(-3)).toEqual([
        "2027-01",
        "2027-04",
        "2027-05",
      ]);
      expect(payables).toHaveLength(9);
      expect(await generated()).toHaveLength(9);

      const inUse = await app.inject({
        method: "DELETE",
        url: `/finance/recurring-payables/${model.id}`,
        headers: headersAs(),
      });
      expect(inUse.statusCode).toBe(409);
      expect(inUse.json().code).toBe("RECURRING_PAYABLE_IN_USE");

      // Modelo futuro ainda não gera nada e pode ser excluído.
      const future = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers: headersAs(),
        payload: { ...base, description: "Internet", startMonth: "2027-09" },
      });
      expect(future.statusCode).toBe(201);
      await generated();
      expect(
        workspace
          .json()
          .payables.some(
            (item: { recurringPayableId?: string }) =>
              item.recurringPayableId === future.json().id,
          ),
      ).toBe(false);
      const removed = await app.inject({
        method: "DELETE",
        url: `/finance/recurring-payables/${future.json().id}`,
        headers: headersAs(),
      });
      expect(removed.statusCode).toBe(204);
      const missing = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${future.json().id}`,
        headers: headersAs(),
        payload: base,
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("RECURRING_PAYABLE_NOT_FOUND");
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/finance/recurring-payables/${future.json().id}`,
            headers: headersAs(),
          })
        ).statusCode,
      ).toBe(404);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renegotiates debt and generates commissions idempotently", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services, professionals, rooms] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
    ]);
    const startsAt = new Date(
      Date.now() + 55 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const date = saoPauloToday(new Date(startsAt));
    await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          {
            serviceId: services.json()[0].id,
            totalSessions: 2,
            totalValueInCents: 10000,
          },
        ],
        patientId: patients.json()[0].id,
        serviceId: services.json()[0].id,
        name: "Plano renegociado",
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 10000,
        installments: 2,
        firstDueDate: date,
      }),
    });
    let workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const ids = workspace
      .json()
      .summary.receivables.map((item: { id: string }) => item.id);
    const renegotiated = await app.inject({
      method: "POST",
      url: "/finance/renegotiations",
      headers,
      payload: {
        receivableIds: ids,
        totalAmountInCents: 9001,
        installments: 3,
        firstDueDate: date,
        reason: "Acordo comercial de teste",
      },
    });
    expect(renegotiated.statusCode).toBe(201);
    expect(renegotiated.json().newReceivables).toHaveLength(3);
    expect(
      renegotiated
        .json()
        .newReceivables.reduce(
          (sum: number, item: { amountInCents: number }) =>
            sum + item.amountInCents,
          0,
        ),
    ).toBe(9001);

    const appointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        patientId: patients.json()[0].id,
        professionalId: professionals.json()[0].id,
        roomId: rooms.json()[0].id,
        serviceId: services.json()[0].id,
        startsAt,
      },
    });
    const completed = await patchStatusAt(
      app,
      headers,
      new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
      appointment.json().id,
      { status: "completed" },
    );
    expect(completed.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/finance/commission-rules",
      headers,
      payload: {
        professionalId: professionals.json()[0].id,
        percentage: 30,
        effectiveFrom: date,
      },
    });
    const first = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: date.slice(0, 7) },
    });
    const second = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: date.slice(0, 7) },
    });
    expect(first.json()).toHaveLength(1);
    expect(second.json()).toHaveLength(1);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/commissions/${first.json()[0].id}/pay`,
      headers,
    });
    expect(paid.json().status).toBe("paid");
    workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(workspace.json().commissions).toHaveLength(1);
    await app.close();
  });

  it("controls stock and reverses inventory and finance when a tab is cancelled", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const product = await app.inject({
      method: "POST",
      url: "/inventory/products",
      headers,
      payload: {
        name: "Faixa elástica",
        sku: "FX-001",
        unit: "un",
        costInCents: 2000,
        salePriceInCents: 4500,
        initialStock: 5,
        minimumStock: 2,
      },
    });
    expect(product.statusCode).toBe(201);
    const excessiveLoss = await app.inject({
      method: "POST",
      url: "/inventory/movements",
      headers,
      payload: {
        productId: product.json().id,
        kind: "loss",
        quantity: 6,
        notes: "Avaria identificada",
      },
    });
    expect(excessiveLoss.statusCode).toBe(409);
    const tab = await app.inject({
      method: "POST",
      url: "/patient-tabs",
      headers,
      payload: { patientId: patients.json()[0].id, notes: "Venda interna" },
    });
    const withItem = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/items`,
      headers,
      payload: { productId: product.json().id, quantity: 2 },
    });
    expect(withItem.json().totalInCents).toBe(9000);
    let inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(3);
    const closed = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/close`,
      headers,
      payload: {
        settlement: "paid",
        paymentMethod: "pix",
        dueDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(closed.json()).toMatchObject({
      status: "closed",
      paymentStatus: "paid",
    });
    let finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("paid");
    const clinicToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const tabReceivable = finance
      .json()
      .summary.receivables.find(
        (item: { id: string }) => item.id === closed.json().receivableId,
      );
    expect(tabReceivable.description).toBe(
      `Comanda de ${clinicToday.slice(8, 10)}/${clinicToday.slice(5, 7)} · ${patients.json()[0].fullName.split(" ")[0]}`,
    );
    const month = clinicToday.slice(0, 7);
    const soldReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(soldReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      netSalesInCents: 9000,
      receivedInCents: 9000,
    });
    const paidCancellation = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(paidCancellation.statusCode).toBe(409);
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${closed.json().receivableId}/reverse`,
      headers,
    });
    expect(reversed.statusCode).toBe(200);
    const cancelled = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(cancelled.json().status).toBe("cancelled");
    inventory = await app.inject({
      method: "GET",
      url: "/inventory/workspace",
      headers,
    });
    expect(inventory.json().products[0].currentStock).toBe(5);
    expect(
      inventory.json().movements.map((item: { kind: string }) => item.kind),
    ).toEqual(
      expect.arrayContaining(["initial_stock", "sale", "sale_reversal"]),
    );
    finance = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    expect(finance.json().summary.receivables[0].status).toBe("cancelled");
    const cancelledReport = await app.inject({
      method: "GET",
      url: `/reports/sales?month=${month}`,
      headers,
    });
    expect(cancelledReport.json().current).toMatchObject({
      grossSalesInCents: 9000,
      cancelledSalesInCents: 9000,
      netSalesInCents: 0,
      receivedInCents: 0,
    });
    const duplicateCancellation = await app.inject({
      method: "POST",
      url: `/patient-tabs/${tab.json().id}/cancel`,
      headers,
    });
    expect(duplicateCancellation.statusCode).toBe(409);
    await app.close();
  });
});
