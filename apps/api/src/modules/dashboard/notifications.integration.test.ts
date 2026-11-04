import { nextTestCpf } from "../../test-support/cpf.js";
import {
  defaultNotificationPreferences,
  patientPlanInputSchema,
  type NotificationPreferences,
  type NotificationsSummary,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 15:00 em São Paulo, 10/06/2039.
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  async function notifications(requestHeaders = headers) {
    const response = await app.inject({
      method: "GET",
      url: "/notifications",
      headers: requestHeaders,
    });
    expect(response.statusCode).toBe(200);
    return response.json<NotificationsSummary>();
  }
  async function userWith(modules: string[], permissions?: string[]) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Usuária restrita",
        email: `restrita.${[...modules, ...(permissions ?? [])].join("-") || "nenhum"}@teste.local`,
        role: "user",
        password: "SenhaForte123",
        ...(permissions ? { permissions } : { modules, editModules: [] }),
      },
    });
    expect(created.statusCode).toBe(201);
    return {
      authorization: `Bearer ${app.jwt.sign({
        sub: created.json<{ id: string }>().id,
        clinicId,
        role: "user",
      })}`,
    };
  }
  return { app, repository, headers, notifications, userWith };
}

describe("GET /notifications", () => {
  it("counts today's birthdays, overdue installments and appointments to finalize", async () => {
    const { app, repository, headers, notifications } = await setup();
    const before = await notifications();
    expect(before.date).toBe("2039-06-10");

    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Rita Sino",
          phone: "11955554444",
          whatsapp: "11955554444",
          emergencyContactName: "Rita Sino",
          emergencyContactPhone: "11955554444",
          birthDate: "1990-06-10",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    // Aniversário amanhã não entra.
    await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName: "Bruno Amanhã",
        phone: "11955553333",
        whatsapp: "11955553333",
        emergencyContactName: "Bruno Amanhã",
        emergencyContactPhone: "11955553333",
        birthDate: "1990-06-11",
        tags: [],
      },
    });
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Parcela vencida",
      amountInCents: 10000,
      dueDate: "2039-06-01",
    });
    // Vence hoje: ainda não está atrasada.
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Parcela de hoje",
      amountInCents: 10000,
      dueDate: "2039-06-10",
    });
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-06-09T12:00:00Z",
      visitType: "regular",
      notes: "",
    });

    const after = await notifications();
    expect(after).toEqual({
      date: "2039-06-10",
      birthdaysToday: (before.birthdaysToday ?? 0) + 1,
      overdueReceivables: (before.overdueReceivables ?? 0) + 1,
      recurringPayablesDue: before.recurringPayablesDue,
      pendingFinalization: (before.pendingFinalization ?? 0) + 1,
      overdueLeadTasks: before.overdueLeadTasks,
      snoozedContactsDue: before.snoozedContactsDue,
      pauseReturnsDue: before.pauseReturnsDue,
      lowStockProducts: before.lowStockProducts,
      autoCampaigns: [],
    });

    // Parabéns registrados tiram o aniversariante do sino.
    const congratulated = await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "birthday",
        referenceKey: `${patient.id}:2039`,
        outcome: "contacted",
      },
    });
    expect(congratulated.statusCode).toBe(201);
    expect((await notifications()).birthdaysToday).toBe(
      before.birthdaysToday ?? 0,
    );
  });

  it("reminds the team of scheduled callbacks: lead tasks, snoozed contacts and pause returns", async () => {
    const { app, repository, headers, notifications } = await setup();
    const before = await notifications();

    // Tarefa comercial: só entra depois do horário marcado.
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Retorno",
        phone: "11944443333",
        source: "Instagram",
        interest: "Pilates",
        tags: [],
      },
    });
    expect(lead.statusCode).toBe(201);
    const leadId = lead.json<{ id: string }>().id;
    for (const dueAt of ["2039-06-10T12:00:00Z", "2039-06-11T12:00:00Z"])
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/leads/${leadId}/tasks`,
            headers,
            payload: { title: "Retornar contato", dueAt },
          })
        ).statusCode,
      ).toBe(201);

    // Contato adiado até amanhã: volta para a lista (e para o sino) no dia seguinte.
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Clara Adiada",
          phone: "11944442222",
          whatsapp: "11944442222",
          emergencyContactName: "Clara Adiada",
          emergencyContactPhone: "11944442222",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    const receivable = await repository.createManualReceivable(
      clinicId,
      actorId,
      {
        patientId: patient.id,
        description: "Parcela vencida",
        amountInCents: 10000,
        dueDate: "2039-06-01",
      },
    );
    const snoozed = await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "overdue_payment",
        referenceKey: receivable.id,
        outcome: "snoozed",
        snoozeUntil: "2039-06-11",
      },
    });
    expect(snoozed.statusCode).toBe(201);

    // Plano pausado com retorno previsto para amanhã.
    const [service] = await repository.listServices(clinicId);
    const services = [
      { serviceId: service!.id, totalSessions: 4, totalValueInCents: 400 },
    ];
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Plano com pausa",
      totalValueInCents: 400,
      services,
    });
    const plan = await repository.createPatientPlan(
      clinicId,
      actorId,
      patientPlanInputSchema.parse({
        name: "Plano com pausa",
        patientId: patient.id,
        planTemplateId: template.id,
        kind: "fixed_package",
        services,
        totalValueInCents: 400,
        validFrom: "2039-06-01",
        validUntil: "2039-12-31",
        firstDueDate: "2039-06-01",
        installments: 1,
      }),
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      actorId,
      plan.id,
      "paused",
      { expectedReturn: "2039-06-11" },
    );

    const today = await notifications();
    expect(today.overdueLeadTasks).toBe((before.overdueLeadTasks ?? 0) + 1);
    expect(today.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
    expect(today.pauseReturnsDue).toBe(before.pauseReturnsDue ?? 0);

    vi.setSystemTime(new Date("2039-06-11T18:00:00Z"));
    const tomorrow = await notifications();
    expect(tomorrow.overdueLeadTasks).toBe((before.overdueLeadTasks ?? 0) + 2);
    expect(tomorrow.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
    expect(tomorrow.pauseReturnsDue).toBe((before.pauseReturnsDue ?? 0) + 1);

    vi.setSystemTime(new Date("2039-06-12T18:00:00Z"));
    expect((await notifications()).snoozedContactsDue).toBe(
      (before.snoozedContactsDue ?? 0) + 1,
    );

    // Lead perdido sai do sino; contato registrado tira o cliente da lista.
    const lost = await app.inject({
      method: "PATCH",
      url: `/leads/${leadId}/stage`,
      headers,
      payload: { stage: "lost", lostReason: "Sem interesse" },
    });
    expect(lost.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/relationship/activities",
      headers,
      payload: {
        patientId: patient.id,
        reason: "overdue_payment",
        referenceKey: receivable.id,
        outcome: "contacted",
      },
    });
    const handled = await notifications();
    expect(handled.overdueLeadTasks).toBe(before.overdueLeadTasks ?? 0);
    expect(handled.snoozedContactsDue).toBe(before.snoozedContactsDue ?? 0);
  });

  it("reminds fixed expenses ahead of the due date until they are paid", async () => {
    const { app, headers, notifications, userWith } = await setup();
    const before = (await notifications()).recurringPayablesDue ?? 0;
    const workspace = await app.inject({
      method: "GET",
      url: "/finance/workspace",
      headers,
    });
    const category = workspace
      .json()
      .categories.find((item: { kind: string }) => item.kind === "expense");
    const costCenter = workspace.json().costCenters[0];
    const base = {
      categoryId: category.id,
      costCenterId: costCenter.id,
      amountInCents: 15_000,
      startMonth: "2039-06",
    };
    async function createModel(payload: Record<string, unknown>) {
      const response = await app.inject({
        method: "POST",
        url: "/finance/recurring-payables",
        headers,
        payload: { ...base, ...payload },
      });
      expect(response.statusCode).toBe(201);
      return response.json<{ id: string }>();
    }
    const invalid = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: {
        ...base,
        description: "Aviso inválido",
        dayOfMonth: 12,
        reminderDaysBefore: 31,
      },
    });
    expect(invalid.statusCode).toBe(400);
    // Água vence dia 12 com aviso de 3 dias: o aviso começou em 09/06.
    const water = await createModel({
      description: "Conta de água",
      amountType: "variable",
      dayOfMonth: 12,
      reminderDaysBefore: 3,
    });
    expect(water).toMatchObject({
      amountType: "variable",
      reminderDaysBefore: 3,
    });
    // Internet vence dia 20 com aviso de 5 dias: só a partir de 15/06.
    const internet = await createModel({
      description: "Internet",
      dayOfMonth: 20,
      reminderDaysBefore: 5,
    });
    expect(internet).toMatchObject({ amountType: "fixed" });
    // Sem antecedência configurada, não avisa.
    await createModel({ description: "Aluguel", dayOfMonth: 11 });
    expect((await notifications()).recurringPayablesDue).toBe(before + 1);

    // A listagem gera as contas do mês; a variável nasce com o valor pendente.
    await app.inject({
      method: "GET",
      url: "/finance/recurring-payables",
      headers,
    });
    const payables = (
      await app.inject({ method: "GET", url: "/finance/workspace", headers })
    ).json().payables as Array<{
      id: string;
      recurringPayableId?: string;
      amountPending?: boolean;
      amountInCents: number;
    }>;
    const waterBill = payables.find(
      (item) => item.recurringPayableId === water.id,
    )!;
    expect(waterBill).toMatchObject({
      amountInCents: 15_000,
      amountPending: true,
    });
    expect(
      payables.find((item) => item.recurringPayableId === internet.id)
        ?.amountPending,
    ).toBeUndefined();
    expect((await notifications()).recurringPayablesDue).toBe(before + 1);

    const blocked = await app.inject({
      method: "POST",
      url: `/finance/payables/${waterBill.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("PAYABLE_AMOUNT_PENDING");
    const viewer = await userWith(["finance"]);
    const denied = await app.inject({
      method: "PUT",
      url: `/finance/payables/${waterBill.id}/amount`,
      headers: viewer,
      payload: { amountInCents: 18_790 },
    });
    expect(denied.statusCode).toBe(403);
    const zero = await app.inject({
      method: "PUT",
      url: `/finance/payables/${waterBill.id}/amount`,
      headers,
      payload: { amountInCents: 0 },
    });
    expect(zero.statusCode).toBe(400);
    const informed = await app.inject({
      method: "PUT",
      url: `/finance/payables/${waterBill.id}/amount`,
      headers,
      payload: { amountInCents: 18_790 },
    });
    expect(informed.statusCode).toBe(200);
    expect(informed.json().amountInCents).toBe(18_790);
    expect(informed.json().amountPending).toBeUndefined();
    const paid = await app.inject({
      method: "POST",
      url: `/finance/payables/${waterBill.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().amountInCents).toBe(18_790);
    expect((await notifications()).recurringPayablesDue).toBe(before);

    const afterPaid = await app.inject({
      method: "PUT",
      url: `/finance/payables/${waterBill.id}/amount`,
      headers,
      payload: { amountInCents: 20_000 },
    });
    expect(afterPaid.statusCode).toBe(409);
    const manual = await app.inject({
      method: "POST",
      url: "/finance/payables",
      headers,
      payload: {
        description: "Compra avulsa",
        categoryId: category.id,
        costCenterId: costCenter.id,
        dueDate: "2039-06-15",
        amountInCents: 5_000,
      },
    });
    expect(manual.statusCode).toBe(201);
    const notRecurring = await app.inject({
      method: "PUT",
      url: `/finance/payables/${manual.json().id}/amount`,
      headers,
      payload: { amountInCents: 6_000 },
    });
    expect(notRecurring.statusCode).toBe(409);
    expect(notRecurring.json().code).toBe("PAYABLE_NOT_RECURRING");
    const missing = await app.inject({
      method: "PUT",
      url: "/finance/payables/00000000-0000-4000-8000-000000000000/amount",
      headers,
      payload: { amountInCents: 6_000 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("informs the month only on variable bills, audits it and follows type changes", async () => {
    const { app, headers } = await setup();
    const workspace = (
      await app.inject({ method: "GET", url: "/finance/workspace", headers })
    ).json();
    const base = {
      categoryId: workspace.categories.find(
        (item: { kind: string }) => item.kind === "expense",
      ).id,
      costCenterId: workspace.costCenters[0].id,
      amountInCents: 9_000,
      dayOfMonth: 25,
      startMonth: "2039-06",
    };
    const created = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: { ...base, description: "Conta de luz" },
    });
    expect(created.statusCode).toBe(201);
    const model = created.json<{ id: string }>();
    async function bill() {
      await app.inject({
        method: "GET",
        url: "/finance/recurring-payables",
        headers,
      });
      return (
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        ).json().payables as Array<{
          id: string;
          recurringPayableId?: string;
          amountPending?: boolean;
        }>
      ).find((item) => item.recurringPayableId === model.id)!;
    }
    async function edit(amountType: "fixed" | "variable") {
      const response = await app.inject({
        method: "PUT",
        url: `/finance/recurring-payables/${model.id}`,
        headers,
        payload: { ...base, description: "Conta de luz", amountType },
      });
      expect(response.statusCode).toBe(200);
    }
    const fixedBill = await bill();
    expect(fixedBill.amountPending).toBeUndefined();
    // Conta de despesa de valor fixo não recebe o valor do mês.
    const fixedAmount = await app.inject({
      method: "PUT",
      url: `/finance/payables/${fixedBill.id}/amount`,
      headers,
      payload: { amountInCents: 9_500 },
    });
    expect(fixedAmount.statusCode).toBe(409);
    expect(fixedAmount.json().code).toBe("PAYABLE_NOT_VARIABLE");

    // Virou variável: a conta do mês ainda aberta passa a esperar o valor real.
    await edit("variable");
    expect((await bill()).amountPending).toBe(true);
    // Voltou a fixa: a conta aberta pode ser paga de novo.
    await edit("fixed");
    expect((await bill()).amountPending).toBeUndefined();
    await edit("variable");
    const informed = await app.inject({
      method: "PUT",
      url: `/finance/payables/${fixedBill.id}/amount`,
      headers,
      payload: { amountInCents: 11_230 },
    });
    expect(informed.statusCode).toBe(200);
    expect(informed.json().amountPending).toBeUndefined();

    const history = await app.inject({
      method: "GET",
      url: "/history/audit-events?module=finance&action=payable.amount_informed",
      headers,
    });
    expect(history.statusCode).toBe(200);
    const events = history.json<{
      items: { entityId?: string; metadata: Record<string, unknown> }[];
    }>().items;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityId: fixedBill.id,
      metadata: {
        competence: "2039-06",
        previousAmountInCents: 9_000,
        amountInCents: 11_230,
      },
    });
  });

  it("accepts a variable expense without estimate and keeps the bill unpaid until informed", async () => {
    const { app, headers } = await setup();
    const workspace = (
      await app.inject({ method: "GET", url: "/finance/workspace", headers })
    ).json();
    const base = {
      description: "Conta de gás",
      categoryId: workspace.categories.find(
        (item: { kind: string }) => item.kind === "expense",
      ).id,
      costCenterId: workspace.costCenters[0].id,
      amountInCents: 0,
      dayOfMonth: 25,
      startMonth: "2039-06",
    };
    // Valor fixo continua exigindo o valor mensal.
    const fixed = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: base,
    });
    expect(fixed.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/finance/recurring-payables",
      headers,
      payload: { ...base, amountType: "variable" },
    });
    expect(created.statusCode).toBe(201);
    const model = created.json<{ id: string; amountInCents: number }>();
    expect(model.amountInCents).toBe(0);
    async function bill() {
      await app.inject({
        method: "GET",
        url: "/finance/recurring-payables",
        headers,
      });
      return (
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        ).json().payables as Array<{
          id: string;
          recurringPayableId?: string;
          amountPending?: boolean;
          amountInCents: number;
        }>
      ).find((item) => item.recurringPayableId === model.id)!;
    }
    const pending = await bill();
    expect(pending).toMatchObject({ amountInCents: 0, amountPending: true });
    const paid = await app.inject({
      method: "POST",
      url: `/finance/payables/${pending.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    expect(paid.statusCode).toBe(409);
    expect(paid.json().code).toBe("PAYABLE_AMOUNT_PENDING");

    // Virou fixa: a conta sem estimativa passa a valer o valor mensal.
    const edited = await app.inject({
      method: "PUT",
      url: `/finance/recurring-payables/${model.id}`,
      headers,
      payload: { ...base, amountType: "fixed", amountInCents: 7_500 },
    });
    expect(edited.statusCode).toBe(200);
    const fixedBill = await bill();
    expect(fixedBill.amountInCents).toBe(7_500);
    expect(fixedBill.amountPending).toBeUndefined();
  });

  it("only returns the groups of the modules the user can see", async () => {
    const { notifications, userWith } = await setup();
    expect(
      Object.keys(await notifications(await userWith(["finance"]))),
    ).toEqual(["date", "overdueReceivables", "recurringPayablesDue"]);
    expect(
      Object.keys(await notifications(await userWith(["agenda"]))),
    ).toEqual(["date", "pendingFinalization"]);
    expect(
      Object.keys(await notifications(await userWith(["relationship"]))),
    ).toEqual(["date", "birthdaysToday", "snoozedContactsDue"]);
    expect(Object.keys(await notifications(await userWith(["crm"])))).toEqual([
      "date",
      "overdueLeadTasks",
    ]);
    expect(Object.keys(await notifications(await userWith(["plans"])))).toEqual(
      ["date", "pauseReturnsDue"],
    );
    expect(
      Object.keys(await notifications(await userWith(["patients"]))),
    ).toEqual(["date"]);
    expect(
      Object.keys(
        await notifications(
          await userWith([], ["patients.view", "patients.inventory_view"]),
        ),
      ),
    ).toEqual(["date", "lowStockProducts"]);
  });

  it("counts active products that need restock", async () => {
    const { app, headers, notifications } = await setup();
    const before = (await notifications()).lowStockProducts ?? 0;
    const create = (sku: string, initialStock: number, restockAlertAt?: number) =>
      app
        .inject({
          method: "POST",
          url: "/inventory/products",
          headers,
          payload: {
            name: `Produto ${sku}`,
            sku,
            unit: "un",
            costInCents: 500,
            salePriceInCents: 1_500,
            initialStock,
            ...(restockAlertAt ? { restockAlertAt } : {}),
          },
        })
        .then((response) => {
          expect(response.statusCode).toBe(201);
          return response.json<{ id: string }>().id;
        });
    await create("SINO-OK", 10, 3);
    await create("SINO-AVISO", 2, 3);
    const empty = await create("SINO-ZERO", 0);
    expect((await notifications()).lowStockProducts).toBe(before + 2);

    // Produto desativado não pede reposição no sino.
    const deactivated = await app.inject({
      method: "PUT",
      url: `/inventory/products/${empty}`,
      headers,
      payload: {
        name: "Produto SINO-ZERO",
        unit: "un",
        costInCents: 500,
        salePriceInCents: 1_500,
        active: false,
      },
    });
    expect(deactivated.statusCode).toBe(200);
    expect((await notifications()).lowStockProducts).toBe(before + 1);
  });

  it("requires login", async () => {
    const { app } = await setup();
    const response = await app.inject({ method: "GET", url: "/notifications" });
    expect(response.statusCode).toBe(401);
  });
});

describe("/notifications/preferences", () => {
  it("starts with the defaults and keeps each user's own choices", async () => {
    const { app, headers, userWith } = await setup();
    const read = async (requestHeaders = headers) => {
      const response = await app.inject({
        method: "GET",
        url: "/notifications/preferences",
        headers: requestHeaders,
      });
      expect(response.statusCode).toBe(200);
      return response.json<NotificationPreferences>();
    };
    expect(await read()).toEqual(defaultNotificationPreferences);

    const saved = await app.inject({
      method: "PUT",
      url: "/notifications/preferences",
      headers,
      payload: {
        // Repetidos e fora de ordem: a API guarda na ordem dos grupos, sem repetir.
        hiddenKinds: ["pauseReturns", "birthdays", "birthdays"],
        highlightedKinds: ["autoCampaigns"],
        showBanner: false,
        showToasts: true,
        playSound: true,
        refreshMinutes: 1,
      },
    });
    expect(saved.statusCode).toBe(200);
    const expected = {
      hiddenKinds: ["birthdays", "pauseReturns"],
      highlightedKinds: ["autoCampaigns"],
      showBanner: false,
      showToasts: true,
      playSound: true,
      refreshMinutes: 1,
    };
    expect(saved.json()).toEqual(expected);
    expect(await read()).toEqual(expected);
    // Outro usuário da mesma clínica segue com o padrão.
    expect(await read(await userWith(["agenda"]))).toEqual(
      defaultNotificationPreferences,
    );
  });

  it("rejects unknown groups and intervals", async () => {
    const { app, headers } = await setup();
    for (const payload of [
      { ...defaultNotificationPreferences, hiddenKinds: ["inventado"] },
      { ...defaultNotificationPreferences, refreshMinutes: 2 },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: "/notifications/preferences",
        headers,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("requires login", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/notifications/preferences",
    });
    expect(response.statusCode).toBe(401);
  });
});
