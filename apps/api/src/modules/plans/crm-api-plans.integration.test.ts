import { nextTestCpf } from "../../test-support/cpf.js";
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
  it("treats an empty client filter as every client in plans and clinical records", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    for (const path of ["/plans", "/clinical-records"]) {
      const all = await app.inject({ method: "GET", url: path, headers });
      const empty = await app.inject({
        method: "GET",
        url: `${path}?patientId=`,
        headers,
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual(all.json());
      const invalid = await app.inject({
        method: "GET",
        url: `${path}?patientId=abc`,
        headers,
      });
      expect(invalid.statusCode).toBe(400);
    }
    await app.close();
  });

  it("reports trial conversion when the client gets a plan within 30 days of a completed trial", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const serviceId = services.json()[0].id as string;
    const base = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId,
    };
    // Clientes ativos da demonstração (inativos não contratam plano).
    const active = patients
      .json()
      .filter((item: { status: string }) => item.status === "active");
    const [clientA, clientB] = [active[0].id as string, active[1].id as string];
    const createLead = async (fullName: string, phone: string) =>
      (
        await app.inject({
          method: "POST",
          url: "/leads",
          headers,
          payload: {
            fullName,
            phone,
            source: "Instagram",
            interest: "Pilates",
          },
        })
      ).json().id as string;
    const convertedLead = await createLead("Fábio Experimental", "11922221111");
    const openLead = await createLead("Gisele Avaliação", "11922220000");
    const schedule = async (
      startsAt: string,
      visitType: string,
      owner: { patientId: string } | { leadId: string },
    ) => {
      const response =
        "leadId" in owner
          ? await app.inject({
              method: "POST",
              url: `/leads/${owner.leadId}/appointments`,
              headers,
              payload: { ...base, startsAt, visitType },
            })
          : await app.inject({
              method: "POST",
              url: "/appointments",
              headers,
              payload: {
                ...base,
                patientId: owner.patientId,
                startsAt,
                visitType,
              },
            });
      expect(response.statusCode).toBe(201);
      return response.json().id as string;
    };
    // Desfechos registrados depois de todos os atendimentos de março (início − 15 min).
    const setStatus = async (id: string, status: string) =>
      expect(
        (
          await patchStatusAt(app, headers, "2032-03-10T12:00:00.000Z", id, {
            status,
          })
        ).statusCode,
      ).toBe(200);

    // Lead que vira cliente e contrata 8 dias depois: convertida.
    const leadTrial = await schedule("2032-03-01T13:00:00.000Z", "trial", {
      leadId: convertedLead,
    });
    // Lead que nunca vira cliente: concluída, não convertida.
    const openLeadEvaluation = await schedule(
      "2032-03-02T13:00:00.000Z",
      "evaluation",
      { leadId: openLead },
    );
    // Cliente que contrata só depois de 30 dias: não convertida.
    const lateTrial = await schedule("2032-03-03T13:00:00.000Z", "trial", {
      patientId: clientA,
    });
    // Cliente que contrata no mesmo dia: convertida.
    const sameDayEvaluation = await schedule(
      "2032-03-04T13:00:00.000Z",
      "evaluation",
      { patientId: clientB },
    );
    // Cancelada: fora de "agendadas".
    const cancelledTrial = await schedule("2032-03-05T13:00:00.000Z", "trial", {
      patientId: clientA,
    });
    // Ainda não concluída: só conta em "agendadas".
    await schedule("2032-03-08T13:00:00.000Z", "trial", { patientId: clientB });
    // Atendimento regular concluído: ignorado.
    const regular = await schedule("2032-03-09T13:00:00.000Z", "regular", {
      patientId: clientA,
    });
    // Experimental fora do período: ignorada.
    await schedule("2032-04-05T13:00:00.000Z", "trial", { patientId: clientA });
    for (const id of [
      leadTrial,
      openLeadEvaluation,
      lateTrial,
      sameDayEvaluation,
      regular,
    ])
      await setStatus(id, "completed");
    await setStatus(cancelledTrial, "cancelled");

    const createPlan = async (at: string, patientId: string) => {
      vi.setSystemTime(new Date(at));
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
        payload: await configuredPlan(app, {
          services: [
            {
              serviceId: serviceId,
              totalSessions: 4,
              totalValueInCents: 40000,
            },
          ],
          patientId,
          serviceId,
          name: "Pacote pós-experimental",
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: at.slice(0, 10),
          totalValueInCents: 40000,
          installments: 1,
          firstDueDate: at.slice(0, 10),
        }),
      });
      expect(plan.statusCode).toBe(201);
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2032-03-08T15:00:00.000Z"));
      const conversion = await app.inject({
        payload: { cpf: nextTestCpf() },
        method: "POST",
        url: `/leads/${convertedLead}/convert`,
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(conversion.statusCode).toBe(200);
      await createPlan(
        "2032-03-09T15:00:00.000Z",
        conversion.json().patient.id as string,
      );
      await createPlan("2032-03-04T18:00:00.000Z", clientB);
      await createPlan("2032-04-10T15:00:00.000Z", clientA);
      const report = await app.inject({
        method: "GET",
        url: "/reports/management?from=2032-03-01&to=2032-03-31",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().trials).toEqual({
        scheduled: 5,
        completed: 4,
        converted: 2,
        conversionRate: 50,
      });
      const empty = await app.inject({
        method: "GET",
        url: "/reports/management?from=2032-06-01&to=2032-06-30",
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            sub: "22222222-2222-4222-8222-222222222222",
            clinicId: "11111111-1111-4111-8111-111111111111",
            role: "admin",
          })}`,
        },
      });
      expect(empty.json().trials).toEqual({
        scheduled: 0,
        completed: 0,
        converted: 0,
        conversionRate: 0,
      });
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("keeps lead appointments out of sessions, clinical records, NPS, reminders, commissions, sales and client history", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patientId = patients.json()[0].id as string;
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Davi Avaliação",
        phone: "11944443333",
        source: "Site",
        interest: "Fisioterapia",
      },
    });
    const leadId = lead.json().id as string;
    const payload = {
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      visitType: "evaluation",
    };
    const done = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-06T13:00:00.000Z" },
    });
    const upcoming = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...payload, startsAt: "2031-05-20T13:00:00.000Z" },
    });
    expect(done.statusCode).toBe(201);
    expect(upcoming.statusCode).toBe(201);

    // Sessões: finalizar e reabrir não mexe em plano nenhum.
    // Desfecho só depois do início do atendimento de 06/05.
    const afterDone = "2031-05-07T12:00:00.000Z";
    const plansBefore = (
      await app.inject({ method: "GET", url: "/plans", headers })
    ).json();
    const completed = await patchStatusAt(
      app,
      headers,
      afterDone,
      done.json().id,
      { status: "completed" },
    );
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: "completed", leadId });
    const reopened = await patchStatusAt(
      app,
      headers,
      afterDone,
      done.json().id,
      { status: "confirmed" },
    );
    expect(reopened.statusCode).toBe(200);
    await patchStatusAt(app, headers, afterDone, done.json().id, {
      status: "completed",
    });
    expect(
      (await app.inject({ method: "GET", url: "/plans", headers })).json(),
    ).toEqual(plansBefore);

    // Prontuário e NPS: recusados com código próprio.
    const record = await app.inject({
      method: "POST",
      url: "/clinical-records",
      headers,
      payload: {
        appointmentId: done.json().id,
        subjective: "Relato",
        objective: "Exame",
        assessment: "Avaliação",
        plan: "Plano",
      },
    });
    expect(record.statusCode).toBe(409);
    expect(record.json()).toMatchObject({
      code: "LEAD_APPOINTMENT_NOT_ALLOWED",
    });
    const survey = await app.inject({
      method: "POST",
      url: "/satisfaction",
      headers,
      payload: { patientId, appointmentId: done.json().id, score: 9 },
    });
    expect(survey.statusCode).toBe(409);
    expect(survey.json()).toMatchObject({
      code: "LEAD_APPOINTMENT_NOT_ALLOWED",
    });

    // Lembretes: nada é enfileirado para o lead.
    const reminders = await app.inject({
      method: "POST",
      url: "/communications/reminders/generate",
      headers,
      payload: { referenceDate: "2031-05-20" },
    });
    expect(reminders.statusCode).toBe(200);
    expect(reminders.json()).toMatchObject({
      queued: 0,
      alreadyQueued: 0,
      skippedByPreference: 0,
    });

    // Comissões: atendimento de lead finalizado não gera comissão.
    await app.inject({
      method: "POST",
      url: "/finance/commission-rules",
      headers,
      payload: {
        professionalId: payload.professionalId,
        percentage: 30,
        effectiveFrom: "2031-01-01",
      },
    });
    const commissions = await app.inject({
      method: "POST",
      url: "/finance/commissions/generate",
      headers,
      payload: { competence: "2031-05" },
    });
    expect(commissions.statusCode).toBe(200);
    expect(commissions.json()).toEqual([]);

    // Relatório gerencial (agenda) conta o atendimento pelo tipo.
    const management = await app.inject({
      method: "GET",
      url: "/reports/management?from=2031-05-01&to=2031-05-31",
      headers,
    });
    expect(management.json().appointments).toMatchObject({
      total: 2,
      completed: 1,
      byVisitType: { regular: 0, trial: 0, evaluation: 2 },
    });

    // Linha do tempo de qualquer cliente não mostra o atendimento do lead.
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${patientId}/timeline`,
      headers,
    });
    expect(timeline.statusCode).toBe(200);
    expect(JSON.stringify(timeline.json())).not.toContain(done.json().id);

    // Sugestões de contato e vendas/retorno ignoram o lead, mesmo depois da data.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2031-06-10T15:00:00.000Z"));
      const laterHeaders = {
        authorization: `Bearer ${app.jwt.sign({
          sub: "22222222-2222-4222-8222-222222222222",
          clinicId: "11111111-1111-4111-8111-111111111111",
          role: "admin",
        })}`,
      };
      const suggestions = await app.inject({
        method: "GET",
        url: "/relationship/suggestions",
        headers: laterHeaders,
      });
      expect(suggestions.statusCode).toBe(200);
      expect(JSON.stringify(suggestions.json())).not.toContain(done.json().id);
      const sales = await app.inject({
        method: "GET",
        url: "/reports/sales?month=2031-06",
        headers: laterHeaders,
      });
      expect(sales.statusCode).toBe(200);
      expect(sales.json().previousComparable.buyers).toBe(0);
      expect(sales.json().patientsWithoutReturn).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
    await app.close();
  });

  it("renews recurring plans automatically, catching up missed periods once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const patientId = patients.json()[0].id as string;
    const serviceId = services.json()[0].id as string;
    const now = new Date();
    const monthStart = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
        .toISOString()
        .slice(0, 10);
    const monthEnd = (offset: number) =>
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0),
      )
        .toISOString()
        .slice(0, 10);
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        services: [
          { serviceId: serviceId, totalSessions: 8, totalValueInCents: 40000 },
        ],
        patientId,
        serviceId,
        name: "Mensalidade Pilates",
        kind: "recurring",
        totalSessions: 8,
        validFrom: monthStart(-3),
        validUntil: monthEnd(-3),
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: monthStart(-3),
      }),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().autoRenew).toBe(true);

    const listPlans = async () =>
      (
        await app.inject({
          method: "GET",
          url: `/plans?patientId=${patientId}`,
          headers,
        })
      ).json() as {
        id: string;
        status: string;
        validFrom: string;
        validUntil: string;
        remainingSessions: number;
        renewedFromPlanId?: string;
        renewedByPlanId?: string;
      }[];
    const plans = await listPlans();
    expect(plans.map((plan) => plan.validFrom).sort()).toEqual([
      monthStart(-3),
      monthStart(-2),
      monthStart(-1),
      monthStart(0),
    ]);
    const current = plans.find((plan) => plan.validFrom === monthStart(0))!;
    expect(current).toMatchObject({
      status: "active",
      validUntil: monthEnd(0),
      remainingSessions: 8,
    });
    expect(
      plans
        .filter((plan) => plan.status === "expired")
        .map((plan) => plan.validFrom)
        .sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1)]);
    const original = plans.find((plan) => plan.id === created.json().id)!;
    expect(original.renewedByPlanId).toBeTruthy();
    expect(
      plans.find((plan) => plan.id === original.renewedByPlanId)!
        .renewedFromPlanId,
    ).toBe(original.id);

    expect(await listPlans()).toHaveLength(4);
    const receivables = (
      await app.inject({ method: "GET", url: "/finance/summary", headers })
    )
      .json()
      .receivables.filter(
        (item: { patientId: string }) => item.patientId === patientId,
      );
    expect(
      receivables.map((item: { dueDate: string }) => item.dueDate).sort(),
    ).toEqual([monthStart(-3), monthStart(-2), monthStart(-1), monthStart(0)]);

    const disabled = await app.inject({
      method: "PATCH",
      url: `/plans/${current.id}/auto-renew`,
      headers,
      payload: { autoRenew: false },
    });
    expect(disabled.json().autoRenew).toBe(false);
    await app.close();
  });

  it("renews a plan manually with new terms only once", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const payload = {
      services: [
        {
          serviceId: services.json()[0].id,
          totalSessions: 10,
          totalValueInCents: 150000,
        },
      ],
      patientId: patients.json()[0].id,
      serviceId: services.json()[0].id,
      name: "Pacote fisioterapia",
      kind: "fixed_package",
      totalSessions: 10,
      validFrom: "2026-01-01",
      totalValueInCents: 150000,
      installments: 2,
      firstDueDate: "2026-01-05",
    };
    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, payload),
    });
    expect(created.json().autoRenew).toBe(false);
    const withoutEnd = await app.inject({
      method: "PATCH",
      url: `/plans/${created.json().id}/auto-renew`,
      headers,
      payload: { autoRenew: true },
    });
    expect(withoutEnd.statusCode).toBe(409);

    const renewal = {
      services: [
        {
          serviceId: payload.serviceId,
          totalSessions: 12,
          totalValueInCents: 172000,
        },
      ],
      name: "Pacote fisioterapia",
      totalSessions: 12,
      validFrom: "2026-10-01",
      validUntil: "2026-12-31",
      totalValueInCents: 172000,
      installments: 3,
      firstDueDate: "2026-10-05",
    };
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(renewed.statusCode).toBe(201);
    expect(renewed.json()).toMatchObject({
      kind: "fixed_package",
      remainingSessions: 12,
      totalValueInCents: 172000,
      renewedFromPlanId: created.json().id,
      autoRenew: false,
    });
    const again = await app.inject({
      method: "POST",
      url: `/plans/${created.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(again.statusCode).toBe(409);
    const movements = await app.inject({
      method: "GET",
      url: `/plans/${renewed.json().id}/movements`,
      headers,
    });
    expect(movements.json()[0]).toMatchObject({
      kind: "credit",
      quantity: 12,
      reason: "Crédito da renovação do plano",
    });

    const other = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, payload),
    });
    await app.inject({
      method: "PATCH",
      url: `/plans/${other.json().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/plans/${other.json().id}/renew`,
      headers,
      payload: renewal,
    });
    expect(cancelled.statusCode).toBe(409);

    // Cancelamento com estorno ao cliente: o valor fica registrado no plano.
    const refunded = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, payload),
    });
    const tooHigh = await app.inject({
      method: "PATCH",
      url: `/plans/${refunded.json().id}/status`,
      headers,
      payload: {
        status: "cancelled",
        cancellation: {
          refundedInCents: refunded.json().totalValueInCents + 1,
        },
      },
    });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json().code).toBe("PLAN_REFUND_TOO_HIGH");
    const withRefund = await app.inject({
      method: "PATCH",
      url: `/plans/${refunded.json().id}/status`,
      headers,
      payload: {
        status: "cancelled",
        cancellation: { refundedInCents: 5000, refundNote: "Pix" },
      },
    });
    expect(withRefund.statusCode).toBe(200);
    expect(withRefund.json()).toMatchObject({
      status: "cancelled",
      refundedInCents: 5000,
      refundNote: "Pix",
    });
    const timeline = await app.inject({
      method: "GET",
      url: `/patients/${refunded.json().patientId}/timeline`,
      headers,
    });
    expect(
      (timeline.json() as { id: string; detail?: string }[]).find(
        (entry) => entry.id === `plan_cancelled:${refunded.json().id}`,
      )?.detail,
    ).toMatch(/estornado ao cliente R\$\s50,00/);
    await app.close();
  });

  it("reports client retention and plan cancellations by month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12h de São Paulo em 15/03/2033.
    vi.setSystemTime(new Date("2033-03-15T15:00:00.000Z"));
    try {
      const { app } = await authenticatedApp();
      const clinicId = "11111111-1111-4111-8111-111111111111";
      await seedRoleUsers(app);
      const headersAs = (role: UserRole = "owner") => ({
        authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: tokenRole(role) })}`,
      });
      const headers = headersAs();
      type Month = {
        month: string;
        activeClients: number;
        newClients: number;
        lostClients: number;
        cancelledPlans: number;
        cancelledValueInCents: number;
      };
      const retention = async (query = "?from=2033-01-01&to=2033-03-31") => {
        const response = await app.inject({
          method: "GET",
          url: `/reports/retention${query}`,
          headers,
        });
        expect(response.statusCode).toBe(200);
        return response.json() as {
          from: string;
          to: string;
          startMonth: string;
          endMonth: string;
          months: Month[];
        };
      };
      // Os dados demo também entram: compara-se a diferença.
      const before = await retention();
      expect(before).toMatchObject({
        from: "2033-01-01",
        to: "2033-03-31",
        startMonth: "2033-01",
        endMonth: "2033-03",
      });
      expect(before.months.map((item) => item.month)).toEqual([
        "2033-01",
        "2033-02",
        "2033-03",
      ]);

      const services = await app.inject({
        method: "GET",
        url: "/services",
        headers,
      });
      const createPatient = async (fullName: string, phone: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/patients",
          headers,
          payload: { cpf: nextTestCpf(), fullName, phone, tags: [] },
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      const createPlan = async (
        patientId: string,
        validFrom: string,
        validUntil?: string,
      ) => {
        const response = await app.inject({
          method: "POST",
          url: "/plans",
          headers,
          payload: await configuredPlan(app, {
            services: [
              {
                serviceId: services.json()[0].id,
                totalSessions: 4,
                totalValueInCents: 12_000,
              },
            ],
            patientId,
            serviceId: services.json()[0].id,
            kind: "fixed_package",
            name: "Plano de retenção",
            totalSessions: 4,
            validFrom,
            ...(validUntil ? { validUntil } : {}),
            totalValueInCents: 12_000,
            installments: 2,
            firstDueDate: validFrom,
          }),
        });
        expect(response.statusCode).toBe(201);
        return response.json().id as string;
      };
      // Plano só em fevereiro: novo e ativo em fevereiro, perdido em março.
      await createPlan(
        await createPatient("Retenção Fevereiro", "11955550001"),
        "2033-02-01",
        "2033-02-28",
      );
      // Plano de março cancelado em março, com as duas parcelas em aberto.
      const cancelledPlan = await createPlan(
        await createPatient("Retenção Março", "11955550002"),
        "2033-03-01",
      );
      const cancellation = await app.inject({
        method: "PATCH",
        url: `/plans/${cancelledPlan}/status`,
        headers,
        payload: { status: "cancelled" },
      });
      expect(cancellation.statusCode).toBe(200);

      const after = await retention();
      const delta = (month: string, key: keyof Omit<Month, "month">) =>
        after.months.find((item) => item.month === month)![key] -
        before.months.find((item) => item.month === month)![key];
      expect(delta("2033-01", "activeClients")).toBe(0);
      expect(delta("2033-02", "activeClients")).toBe(1);
      expect(delta("2033-02", "newClients")).toBe(1);
      expect(delta("2033-02", "lostClients")).toBe(0);
      expect(delta("2033-03", "activeClients")).toBe(1);
      expect(delta("2033-03", "newClients")).toBe(1);
      expect(delta("2033-03", "lostClients")).toBe(1);
      expect(delta("2033-03", "cancelledPlans")).toBe(1);
      expect(delta("2033-03", "cancelledValueInCents")).toBe(12_000);

      // Parâmetros vazios: até hoje, seis meses; meses futuros não entram.
      const defaults = await retention("?from=&to=");
      expect(defaults).toMatchObject({
        from: "2032-10-01",
        to: "2033-03-15",
        startMonth: "2032-10",
        endMonth: "2033-03",
      });
      expect(defaults.months).toHaveLength(6);
      const future = await retention("?from=2033-02-01&to=2033-08-31");
      expect(future.endMonth).toBe("2033-03");
      expect(future.months).toHaveLength(2);

      for (const query of [
        "?from=abc",
        "?from=2033-03-01&to=2033-02-01",
        "?from=2033-04-01",
        "?from=2031-01-01&to=2033-03-01",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url: `/reports/retention${query}`,
          headers,
        });
        expect(invalid.statusCode).toBe(400);
      }
      const finance = await app.inject({
        method: "GET",
        url: "/reports/retention",
        headers: headersAs("finance"),
      });
      expect(finance.statusCode).toBe(200);
      for (const role of ["reception", "physiotherapist"] as const) {
        const denied = await app.inject({
          method: "GET",
          url: "/reports/retention",
          headers: headersAs(role),
        });
        expect(denied.statusCode).toBe(403);
      }
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
