import { randomUUID } from "node:crypto";
import {
  unsignedReceiptPatientCount,
  type PermissionKey,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  receiptActorId,
  receiptFixtures,
} from "../../test-support/receipt-signatures-suite.js";
import { clinicDateOf } from "../finance/daily-cash.js";
import {
  formatTelegramAgenda,
  telegramAgendaPeriod,
  type TelegramAgendaItem,
} from "./telegram-commands.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const secret = "segredo-tg4-teste-1234";
const helena = "99999999-9999-4999-8999-999999999999";
const lucas = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sonia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ana = "33333333-3333-4333-8333-333333333333";
const paulo = "44444444-4444-4444-8444-444444444444";
const salaMovimento = "55555555-5555-4555-8555-555555555555";
const estudio = "66666666-6666-4666-8666-666666666666";
const fisio = "77777777-7777-4777-8777-777777777777";
const avaliacao = "88888888-8888-4888-8888-888888888888";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

/** Hora local de São Paulo (UTC-3) no dia informado. */
const at = (day: string, time: string) =>
  new Date(`${day}T${time}:00-03:00`).toISOString();
const br = (day: string) =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Segunda-feira longe dos atendimentos de demonstração (gravados no dia real) e dentro do
 * horizonte dos encontros de turma, que são gerados a partir do dia real.
 */
function futureMonday() {
  const today = clinicDateOf(new Date(), "America/Sao_Paulo");
  const day = addDays(today, 21);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, (8 - weekday) % 7);
}

async function setup(clock: { now: Date }) {
  const repository = new MemoryClinicRepository();
  const sent: { chatId: string; text: string }[] = [];
  const sendMessage = vi.fn(async (chatId: string, text: string) => {
    sent.push({ chatId, text });
  });
  const app = await buildApp({
    repository,
    logger: false,
    telegram: {
      webhookSecret: secret,
      now: () => clock.now,
      client: { sendMessage },
    },
  });
  apps.push(app);
  const webhook = (text: string, chatId: number | string = 555) =>
    app.inject({
      method: "POST",
      url: `/integrations/telegram/webhook/${secret}`,
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: { update_id: 1, message: { chat: { id: chatId }, text } },
    });
  async function link(chatId = "555", userId = adminId) {
    const codeHash = randomUUID();
    await repository.createTelegramLinkCode(clinicId, userId, {
      codeHash,
      expiresAt: new Date(clock.now.getTime() + 600_000).toISOString(),
    });
    expect(
      await repository.linkTelegramChat({
        codeHash,
        chatId,
        now: clock.now.toISOString(),
      }),
    ).toMatchObject({ status: "linked" });
  }
  async function newUser(
    permissions: PermissionKey[],
    professionalId?: string,
  ) {
    await repository.saveTelegramSettings(clinicId, {
      linkRoles: ["admin", "user"],
    });
    const user = await repository.createAdminUser(
      clinicId,
      adminId,
      {
        fullName: "Recepção Telegram",
        email: `${randomUUID()}@test.local`,
        password: "Password123",
        role: "user",
        permissions,
      },
      "unused-hash",
    );
    if (professionalId)
      await repository.setAdminUserProfessional(
        clinicId,
        adminId,
        user.id,
        professionalId,
      );
    return user.id;
  }
  const appointment = (
    patientId: string,
    professionalId: string,
    serviceId: string,
    startsAt: string,
    roomId = salaMovimento,
  ) =>
    repository.createAppointment(clinicId, {
      patientId,
      professionalId,
      roomId,
      serviceId,
      startsAt,
      visitType: "regular",
    });
  /** Turma de segunda às 18:00 com Ana, 4 vagas e uma aluna matriculada. */
  async function mondayClass() {
    const group = await repository.createGroupClass(clinicId, {
      serviceId: fisio,
      professionalId: ana,
      roomId: estudio,
      capacity: 4,
      weeklySlots: [{ weekday: 1, startTime: "18:00", endTime: "19:00" }],
    });
    await repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId: sonia,
      startsOn: clinicDateOf(new Date(), "America/Sao_Paulo"),
    });
    return group;
  }
  return {
    app,
    repository,
    sent,
    sendMessage,
    webhook,
    link,
    newUser,
    appointment,
    mondayClass,
  };
}

describe("TG4: comandos de agenda do bot", () => {
  it("chat sem vínculo recebe só a orientação para vincular, sem dados", async () => {
    const monday = futureMonday();
    const test = await setup({ now: new Date(at(monday, "07:00")) });
    await test.appointment(helena, ana, fisio, at(monday, "09:00"));
    for (const command of ["/hoje", "/semana", "/mes"]) {
      const response = await test.webhook(command, 777);
      expect(response.statusCode).toBe(200);
    }
    expect(test.sent).toHaveLength(3);
    for (const message of test.sent) {
      expect(message.chatId).toBe("777");
      expect(message.text).toBe(
        "Este chat ainda não está vinculado ao CRM. Gere um código em Configurações › Integrações e envie /vincular <código>.",
      );
    }
    expect(await test.repository.listTelegramOutbox(clinicId)).toEqual([]);
  });

  it("/hoje lista atendimentos e aulas do dia, agrupados, com totais e ocupação", async () => {
    const monday = futureMonday();
    const test = await setup({ now: new Date(at(monday, "07:00")) });
    await test.link();
    await test.appointment(lucas, paulo, avaliacao, at(monday, "10:30"));
    await test.appointment(helena, ana, fisio, at(monday, "09:00"));
    const cancelled = await test.appointment(
      sonia,
      ana,
      fisio,
      at(monday, "15:00"),
    );
    expect(
      await test.repository.updateAppointmentStatus(
        clinicId,
        cancelled.id,
        "cancelled",
      ),
    ).toMatchObject({ status: "cancelled" });
    await test.appointment(helena, ana, fisio, at(addDays(monday, 1), "09:00"));
    const group = await test.mondayClass();

    const response = await test.webhook("/hoje");
    expect(response.statusCode).toBe(200);
    const text = test.sent.at(-1)!.text;
    expect(text).toBe(
      [
        `Agenda de hoje (segunda, ${br(monday)})`,
        "2 atendimentos · 1 aula",
        "",
        `Segunda, ${dm(monday)}`,
        "09:00 · Helena Almeida · Fisioterapia individual · com Dra. Ana Martins",
        "10:30 · Lucas Ribeiro · Avaliação funcional · com Dr. Paulo Nunes",
        `18:00 · Turma ${group.name} · com Dra. Ana Martins · 1/4 vagas ocupadas`,
      ].join("\n"),
    );
    expect(test.sent.at(-1)!.chatId).toBe("555");
    expect(
      (await test.repository.listTelegramOutbox(clinicId)).at(-1)?.sentAt,
    ).toBeDefined();
  });

  it("/semana vai de segunda a domingo; /mes cobre o mês inteiro, no fuso da clínica", async () => {
    const monday = futureMonday();
    const wednesday = addDays(monday, 2);
    const clock = { now: new Date(at(wednesday, "07:00")) };
    const test = await setup(clock);
    await test.link();
    await test.appointment(helena, ana, fisio, at(monday, "08:00"));
    await test.appointment(
      lucas,
      paulo,
      avaliacao,
      at(addDays(monday, 6), "23:30"),
    );
    await test.appointment(helena, ana, fisio, at(addDays(monday, 7), "00:30"));
    await test.appointment(sonia, ana, fisio, at(addDays(monday, -1), "21:00"));

    await test.webhook("/semana");
    const week = test.sent.at(-1)!.text;
    expect(week.split("\n").slice(0, 2)).toEqual([
      `Agenda da semana (${dm(monday)} a ${br(addDays(monday, 6))})`,
      "2 atendimentos · 0 aulas",
    ]);
    expect(week).toContain(`Segunda, ${dm(monday)}\n08:00 · Helena Almeida`);
    expect(week).toContain(
      `Domingo, ${dm(addDays(monday, 6))}\n23:30 · Lucas Ribeiro`,
    );
    expect(week).not.toContain("Sônia");
    expect(week).not.toContain("00:30");

    // Mês da data local, mesmo com o UTC já no dia seguinte (21:30 de São Paulo = 00:30 UTC).
    const period = telegramAgendaPeriod(
      "/mes",
      new Date(at(wednesday, "21:30")),
      "America/Sao_Paulo",
    );
    expect(period.first).toBe(`${wednesday.slice(0, 7)}-01`);
    expect(period.from).toBe(at(period.first, "00:00"));
    expect(period.to).toBe(at(addDays(period.last, 1), "00:00"));
    expect(addDays(period.last, 1).slice(8)).toBe("01");

    await test.webhook("/mes");
    const month = test.sent.at(-1)!.text;
    const inMonth = (
      await test.repository.listAppointments(clinicId, period.from, period.to)
    ).filter((item) => item.status !== "cancelled").length;
    expect(month.split("\n")[1]).toBe(
      `${inMonth} ${inMonth === 1 ? "atendimento" : "atendimentos"} · 0 aulas`,
    );
    expect(month.split("\n")[0]).toMatch(
      new RegExp(`^Agenda de [a-zç]+ de ${wednesday.slice(0, 4)}$`),
    );
  });

  it("mostra só o que o usuário vinculado vê: profissional dele e módulos", async () => {
    const monday = futureMonday();
    const test = await setup({ now: new Date(at(monday, "07:00")) });
    await test.appointment(helena, ana, fisio, at(monday, "09:00"));
    await test.appointment(lucas, paulo, avaliacao, at(monday, "10:30"));
    await test.mondayClass();

    const own = await test.newUser(["agenda.view"], paulo);
    await test.link("601", own);
    await test.webhook("/hoje", 601);
    const ownText = test.sent.at(-1)!.text;
    expect(ownText).toContain("1 atendimento · 0 aulas");
    expect(ownText).toContain("Lucas Ribeiro");
    expect(ownText).not.toContain("Helena");
    expect(ownText).not.toContain("Turma");

    const all = await test.newUser(["agenda.view", "agenda.view_all"]);
    await test.link("602", all);
    await test.webhook("/hoje", 602);
    expect(test.sent.at(-1)!.text).toContain("2 atendimentos · 1 aula");

    const none = await test.newUser(["finance.view"]);
    await test.link("603", none);
    await test.webhook("/hoje", 603);
    expect(test.sent.at(-1)).toEqual({
      chatId: "603",
      text: "Seu perfil não tem acesso à agenda nem às turmas do CRM.",
    });
  });

  it("chat vinculado recebe a lista de comandos em vez da orientação de vínculo", async () => {
    const test = await setup({ now: new Date("2026-11-09T12:00:00.000Z") });
    await test.link();
    await test.webhook("oi");
    await test.webhook("/start");
    expect(test.sent.map((item) => item.text)).toEqual([
      "Comandos: /hoje (agenda de hoje), /semana (desta semana) e /mes (deste mês).",
      "Comandos: /hoje (agenda de hoje), /semana (desta semana) e /mes (deste mês).",
    ]);
  });
});

describe("TG4: resposta acima do limite do Telegram", () => {
  it("corta no último item que cabe e diz quantos faltaram", () => {
    const items: TelegramAgendaItem[] = Array.from(
      { length: 200 },
      (_, index) => ({
        kind: "appointment",
        startsAt: at(
          addDays("2031-03-01", Math.floor(index / 10)),
          `${String(8 + (index % 10)).padStart(2, "0")}:00`,
        ),
        text: `Cliente ${index} com um nome bem comprido · Fisioterapia individual · com Dra. Ana Martins`,
      }),
    );
    const period = { first: "2031-03-01", last: "2031-03-31" };
    const text = formatTelegramAgenda(
      "/mes",
      period,
      items,
      "America/Sao_Paulo",
    );
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Agenda de março de 2031",
      "200 atendimentos · 0 aulas",
    ]);
    const shown = text
      .split("\n")
      .filter((line) => /^\d{2}:\d{2} · /.test(line)).length;
    expect(shown).toBeGreaterThan(0);
    expect(text.split("\n").at(-1)).toBe(`… e mais ${200 - shown}`);
    expect(text.split("\n").at(-2)).toMatch(/^\d{2}:\d{2} · Cliente/);

    const small = formatTelegramAgenda(
      "/mes",
      period,
      items.slice(0, 3),
      "America/Sao_Paulo",
    );
    expect(small).not.toContain("… e mais");
    expect(
      formatTelegramAgenda(
        "/hoje",
        { first: "2031-03-03", last: "2031-03-03" },
        [],
        "America/Sao_Paulo",
      ),
    ).toBe(
      "Agenda de hoje (segunda, 03/03/2031)\n0 atendimentos · 0 aulas\n\nNada marcado no período.",
    );
  });
});

describe("TG4: aviso periódico de recibos pelo Telegram", () => {
  async function withUnsignedReceipt(clock: { now: Date }) {
    const test = await setup(clock);
    const { receivable } = await receiptFixtures(test.repository);
    const headers = {
      authorization: `Bearer ${test.app.jwt.sign({ sub: receiptActorId, clinicId, role: "admin" })}`,
    };
    const paid = await test.app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "cash", paidAt: "2026-11-03T01:00:00.000Z" },
    });
    expect(paid.statusCode, paid.body).toBe(200);
    const count = unsignedReceiptPatientCount(
      (await test.repository.getFinancialSummary(clinicId)).receivables,
    );
    expect(count).toBeGreaterThan(0);
    const reminder =
      count === 1
        ? "Recibos: 1 cliente ainda não assinou o recibo."
        : `Recibos: ${count} clientes ainda não assinaram o recibo.`;
    return { test, reminder };
  }
  const reminders = (sent: { text: string }[]) =>
    sent.filter((item) => item.text.startsWith("Recibos:"));

  it("antes do horário (18:00 da clínica) não avisa; depois, avisa uma vez por dia a todos os vinculados", async () => {
    const clock = { now: new Date(at("2026-11-09", "17:59")) };
    const { test, reminder } = await withUnsignedReceipt(clock);
    await test.link("555");
    const other = await test.repository.createAdminUser(
      clinicId,
      adminId,
      {
        fullName: "Outra admin",
        email: `${randomUUID()}@test.local`,
        role: "admin",
        password: "Password123",
      },
      "unused-hash",
    );
    await test.link("556", other.id);

    await test.webhook("/hoje");
    expect(reminders(test.sent)).toEqual([]);

    clock.now = new Date(at("2026-11-09", "18:00"));
    await test.webhook("/hoje");
    // Primeiro a resposta do comando, depois o aviso para cada chat vinculado.
    expect(test.sent.at(-3)!.text).toMatch(/^Agenda de hoje/);
    expect(test.sent.slice(-2)).toEqual([
      { chatId: "555", text: reminder },
      { chatId: "556", text: reminder },
    ]);

    // Outro webhook no mesmo dia (mesmo sem comando): nada de novo.
    clock.now = new Date(at("2026-11-09", "22:00"));
    await test.webhook("oi", 556);
    await test.webhook("/semana");
    expect(reminders(test.sent)).toHaveLength(2);
    expect(
      await test.repository.getTelegramReceiptReminderSentOn(clinicId),
    ).toBe("2026-11-09");

    // Dia seguinte: antes do horário não; depois, de novo.
    clock.now = new Date(at("2026-11-10", "09:00"));
    await test.webhook("/hoje");
    expect(reminders(test.sent)).toHaveLength(2);
    clock.now = new Date(at("2026-11-10", "18:30"));
    await test.webhook("oi");
    expect(reminders(test.sent)).toHaveLength(4);
  });

  it("chat sem vínculo não dispara o aviso; sem pendência, nada sai e o dia segue livre", async () => {
    const clock = { now: new Date(at("2026-11-09", "19:00")) };
    const { test } = await withUnsignedReceipt(clock);
    await test.webhook("/hoje", 999);
    expect(reminders(test.sent)).toEqual([]);
    expect(
      await test.repository.getTelegramReceiptReminderSentOn(clinicId),
    ).toBeNull();

    const empty = await setup(clock);
    await empty.link();
    const count = unsignedReceiptPatientCount(
      (await empty.repository.getFinancialSummary(clinicId)).receivables,
    );
    await empty.webhook("/hoje");
    if (count === 0) {
      expect(reminders(empty.sent)).toEqual([]);
      expect(
        await empty.repository.getTelegramReceiptReminderSentOn(clinicId),
      ).toBeNull();
    }
  });

  it("frequência desligada na clínica não avisa", async () => {
    const clock = { now: new Date(at("2026-11-09", "19:00")) };
    const { test } = await withUnsignedReceipt(clock);
    await test.link();
    const settings = await test.repository.getClinicSettings(clinicId);
    vi.spyOn(test.repository, "getClinicSettings").mockResolvedValue({
      ...settings!,
      receiptReminder: {
        frequency: "off",
        weekday: 1,
        time: "18:00",
        afterHours: 24,
      },
    });
    await test.webhook("/hoje");
    expect(reminders(test.sent)).toEqual([]);
  });

  it("falha ao montar o aviso não derruba o webhook", async () => {
    const clock = { now: new Date(at("2026-11-09", "19:00")) };
    const { test } = await withUnsignedReceipt(clock);
    await test.link();
    vi.spyOn(test.repository, "getFinancialSummary").mockRejectedValue(
      new Error("banco fora"),
    );
    const response = await test.webhook("/hoje");
    expect(response.statusCode).toBe(200);
    expect(test.sent.at(-1)!.text).toMatch(/^Agenda de hoje/);
    expect(reminders(test.sent)).toEqual([]);
  });
});
