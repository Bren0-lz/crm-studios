import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatCpf,
  packageScheduleStarts,
  type Appointment,
} from "@crm/contracts";
import { buildApp } from "../../app.js";
import type {
  CreatedAppointmentSummary,
  DomainEvent,
} from "../../infrastructure/domain-events.js";
import type { BuildAppOptions } from "../../infrastructure/route-utils.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { configuredPlan } from "../../test-support/legacy-fixtures.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
import { formatAppointmentsCreatedMessages } from "./telegram-new-records.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const actorName = "Aryana Dutra";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

/** 09:00 de São Paulo (UTC-3) no dia informado. */
const at = (day: string, time = "09:00") =>
  new Date(`${day}T${time}:00-03:00`).toISOString();

async function setup(
  options: Pick<BuildAppOptions, "events" | "telegram"> = {},
) {
  const repository = new MemoryClinicRepository();
  const sent: { chatId: string; text: string }[] = [];
  const now = new Date("2026-11-09T12:00:00.000Z");
  const sendMessage = vi.fn(async (chatId: string, text: string) => {
    sent.push({ chatId, text });
  });
  const app = await buildApp({
    repository,
    logger: false,
    telegram: {
      webhookSecret: "segredo-tg3-teste-1234",
      now: () => now,
      client: { sendMessage },
    },
    ...options,
  });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const [patient] = await repository.listPatients(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const [service] = await repository.listServices(clinicId);
  const base = {
    patientId: patient!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    serviceId: service!.id,
  };
  async function link(chatId = "555", userId = actorId) {
    const codeHash = randomUUID();
    await repository.createTelegramLinkCode(clinicId, userId, {
      codeHash,
      expiresAt: "2026-11-10T12:00:00.000Z",
    });
    expect(
      await repository.linkTelegramChat({
        codeHash,
        chatId,
        now: now.toISOString(),
      }),
    ).toMatchObject({ status: "linked" });
  }
  const post = async (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers, payload });
  const createLead = async (fullName: string, cpf?: string) => {
    const response = await post("/leads", {
      fullName,
      phone: "11944443333",
      source: "Instagram",
      interest: "Pilates",
      cpf,
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<{ id: string }>().id;
  };
  return {
    app,
    repository,
    headers,
    sent,
    sendMessage,
    link,
    post,
    createLead,
    base,
    patient: patient!,
    professional: professional!,
    service: service!,
  };
}

describe("TG3: aviso de agendamento", () => {
  it("avisa quem marcou, cliente, serviço, profissional e data/hora, depois do commit", async () => {
    const test = await setup();
    await test.link();
    test.sendMessage.mockImplementation(async (chatId, text) => {
      // Quando o envio começa, outra leitura já enxerga o atendimento gravado.
      const listed = await test.repository.listAppointments(
        clinicId,
        "2031-03-10T00:00:00.000Z",
        "2031-03-11T00:00:00.000Z",
      );
      expect(listed).toHaveLength(1);
      test.sent.push({ chatId, text });
    });
    const response = await test.post(
      "/appointments",
      await withAppointmentPlan(
        test.app,
        { ...test.base, startsAt: at("2031-03-10"), notes: "" },
        test.headers,
      ),
    );
    expect(response.statusCode, response.body).toBe(201);
    expect(test.sent).toEqual([
      {
        chatId: "555",
        text: [
          "Novo agendamento",
          `Marcado por ${actorName}.`,
          "",
          `Cliente: ${test.patient.fullName}`,
          `CPF: ${formatCpf(test.patient.cpf!)}`,
          `Serviço: ${test.service.name}`,
          `Profissional: ${test.professional.fullName}`,
          "Quando: 10/03/2031 (segunda-feira) às 09:00",
        ].join("\n"),
      },
    ]);
  });

  it("recorrência gera um aviso só com todas as sessões", async () => {
    const test = await setup();
    await test.link();
    const response = await test.post(
      "/appointments/recurring",
      await withAppointmentPlan(
        test.app,
        {
          ...test.base,
          startsAt: at("2031-03-10"),
          occurrences: 4,
          customStartsAt: [
            at("2031-03-12"),
            at("2031-03-17"),
            at("2031-03-19"),
          ],
          notes: "",
        },
        test.headers,
      ),
    );
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<Appointment[]>()).toHaveLength(4);
    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]!.text.split("\n").slice(-4)).toEqual([
      "• 10/03/2031 (segunda-feira) às 09:00",
      "• 12/03/2031 (quarta-feira) às 09:00",
      "• 17/03/2031 (segunda-feira) às 09:00",
      "• 19/03/2031 (quarta-feira) às 09:00",
    ]);
    expect(await test.repository.listTelegramOutbox(clinicId)).toHaveLength(1);
  });

  it("sessões reservadas na contratação do plano geram um aviso com o resumo", async () => {
    const test = await setup();
    await test.link();
    const plan = await configuredPlan(test.app, {
      patientId: test.patient.id,
      serviceId: test.service.id,
      name: "Pacote 10 sessões",
      kind: "fixed_package" as const,
      totalSessions: 10,
      validFrom: "2039-03-01",
      totalValueInCents: 100_000,
      installments: 1,
      firstDueDate: "2039-03-01",
    });
    const tuesdays = packageScheduleStarts({
      fromDate: "2039-03-01",
      slots: [{ weekday: 2, time: "09:00" }],
      count: 10,
    }).map((local) => new Date(`${local}:00-03:00`).toISOString());
    const purchase = await test.post("/plans/purchases", {
      idempotencyKey: randomUUID(),
      plan,
      appointments: tuesdays.map((startsAt) => ({
        professionalId: test.base.professionalId,
        roomId: test.base.roomId,
        serviceId: test.base.serviceId,
        startsAt,
        visitType: "regular",
        notes: "",
      })),
    });
    expect(purchase.statusCode, purchase.body).toBe(201);
    expect(test.sent).toHaveLength(1);
    const slots = test.sent[0]!.text.split("\n").filter((line) =>
      line.startsWith("•"),
    );
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe("• 01/03/2039 (terça-feira) às 09:00");
    expect(slots.at(-1)).toBe("• 03/05/2039 (terça-feira) às 09:00");
  });

  it("aula experimental inclui o nome e o CPF da pessoa interessada", async () => {
    const test = await setup();
    await test.link();
    const cpf = nextTestCpf();
    const leadId = await test.createLead("Contato Experimental TG3", cpf);
    const response = await test.post(`/leads/${leadId}/appointments`, {
      professionalId: test.base.professionalId,
      roomId: test.base.roomId,
      serviceId: test.base.serviceId,
      startsAt: at("2031-05-12", "14:30"),
      visitType: "trial",
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(test.sent.map((item) => item.text)).toEqual([
      `Novo agendamento\nMarcado por ${actorName}.\n\nPessoa interessada: Contato Experimental TG3\nCPF: ${formatCpf(cpf)}\nServiço: ${test.service.name}\nProfissional: ${test.professional.fullName}\nQuando: 12/05/2031 (segunda-feira) às 14:30`,
    ]);
  });

  it("usa o fuso configurado na clínica", async () => {
    const test = await setup();
    const settings = await test.repository.getClinicSettings(clinicId);
    await test.repository.updateClinicSettings(clinicId, actorId, {
      ...settings!,
      timezone: "Asia/Tokyo",
    });
    await test.link();
    const response = await test.post(
      "/appointments",
      await withAppointmentPlan(
        test.app,
        { ...test.base, startsAt: at("2031-03-10", "15:00"), notes: "" },
        test.headers,
      ),
    );
    expect(response.statusCode, response.body).toBe(201);
    // 15:00 em São Paulo = 03:00 em Tóquio no dia seguinte.
    expect(test.sent[0]!.text).toContain("11/03/2031 (terça-feira) às 03:00");
  });

  it("criação recusada não avisa; falha no aviso não desfaz o atendimento", async () => {
    const test = await setup();
    await test.link();
    const payload = await withAppointmentPlan(
      test.app,
      { ...test.base, startsAt: at("2031-03-10"), notes: "" },
      test.headers,
    );
    expect((await test.post("/appointments", payload)).statusCode).toBe(201);
    test.sent.length = 0;
    // Mesmo horário, mesma sala e profissional: conflito de agenda.
    expect((await test.post("/appointments", payload)).statusCode).toBe(409);
    expect(test.sent).toEqual([]);

    vi.spyOn(test.repository, "enqueueTelegramMessages").mockRejectedValueOnce(
      new Error("banco fora do ar"),
    );
    const other = await test.post(
      "/appointments",
      await withAppointmentPlan(
        test.app,
        { ...test.base, startsAt: at("2031-03-11"), notes: "" },
        test.headers,
      ),
    );
    expect(other.statusCode, other.body).toBe(201);
    expect(
      await test.repository.findAppointment(clinicId, other.json().id),
    ).not.toBeNull();
    expect(test.sent).toEqual([]);
  });

  it("publicador injetado recebe um evento por operação, mesmo falhando", async () => {
    const received: DomainEvent[] = [];
    const test = await setup({
      events: {
        async publish(event) {
          received.push(event);
          throw new Error("observador fora do ar");
        },
      },
    });
    await test.link();
    const response = await test.post(
      "/appointments/recurring",
      await withAppointmentPlan(
        test.app,
        {
          ...test.base,
          startsAt: at("2031-03-10"),
          occurrences: 3,
          notes: "",
        },
        test.headers,
      ),
    );
    expect(response.statusCode, response.body).toBe(201);
    const created = received.filter(
      (event) => event.type === "appointments.created",
    );
    expect(created).toEqual([
      expect.objectContaining({
        clinicId,
        actorUserId: actorId,
        appointments: expect.arrayContaining([
          expect.objectContaining({ startsAt: at("2031-03-24") }),
        ]),
      }),
    ]);
    expect(test.sent).toHaveLength(1);
  });

  it("sem token, nada é enfileirado", async () => {
    const test = await setup({ telegram: null });
    await test.link();
    const response = await test.post(
      "/appointments",
      await withAppointmentPlan(
        test.app,
        { ...test.base, startsAt: at("2031-03-10"), notes: "" },
        test.headers,
      ),
    );
    expect(response.statusCode).toBe(201);
    expect(
      (
        await test.post("/patients", {
          fullName: "Sem Token TG3",
          phone: "11933332222",
          cpf: nextTestCpf(),
          ...testPatientContact,
        })
      ).statusCode,
    ).toBe(201);
    expect(await test.repository.listTelegramOutbox(clinicId)).toEqual([]);
    expect(test.sent).toEqual([]);
  });
});

describe("TG3: aviso de cliente novo", () => {
  it("cadastro pelo formulário avisa uma vez com quem cadastrou", async () => {
    const test = await setup();
    await test.link();
    // Outro usuário vinculado: um envio por chat.
    const other = await test.repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Admin Telegram",
        email: `${randomUUID()}@test.local`,
        role: "admin",
        password: "Password123",
      },
      "unused-hash",
    );
    await test.link("777", other.id);
    const cpf = nextTestCpf();
    const response = await test.post("/patients", {
      fullName: "Cliente Novo TG3",
      phone: "11933331111",
      cpf,
      ...testPatientContact,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(test.sent.map((item) => item.chatId).sort()).toEqual(["555", "777"]);
    expect(new Set(test.sent.map((item) => item.text))).toEqual(
      new Set([
        `Novo cadastro de cliente\n\nCliente: Cliente Novo TG3\nCPF: ${formatCpf(cpf)}\nCadastro feito por ${actorName}.`,
      ]),
    );
  });

  it("cadastro guiado com aula experimental avisa o cliente novo e o agendamento", async () => {
    const test = await setup();
    await test.link();
    const cpf = nextTestCpf();
    const response = await test.post("/patients/guided", {
      next: "demonstration",
      patient: {
        fullName: "Guiado TG3",
        phone: "11955559999",
        cpf,
        ...testPatientContact,
      },
      appointment: {
        professionalId: test.base.professionalId,
        roomId: test.base.roomId,
        serviceId: test.base.serviceId,
        startsAt: at("2031-03-13", "10:00"),
        notes: "",
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(test.sent.map((item) => item.text)).toEqual([
      `Novo cadastro de cliente\n\nCliente: Guiado TG3\nCPF: ${formatCpf(cpf)}\nCadastro feito por ${actorName}.`,
      `Novo agendamento\nMarcado por ${actorName}.\n\nCliente: Guiado TG3\nCPF: ${formatCpf(cpf)}\nServiço: ${test.service.name}\nProfissional: ${test.professional.fullName}\nQuando: 13/03/2031 (quinta-feira) às 10:00`,
    ]);
  });

  it("conversão de lead avisa só quando cria o cadastro", async () => {
    const test = await setup();
    await test.link();
    const leadId = await test.createLead("Lead Convertido TG3");
    const cpf = nextTestCpf();
    const converted = await test.post(`/leads/${leadId}/convert`, {
      cpf,
      ...testPatientContact,
    });
    expect(converted.statusCode, converted.body).toBe(200);
    expect(test.sent.map((item) => item.text)).toEqual([
      `Novo cadastro de cliente\n\nCliente: Lead Convertido TG3\nCPF: ${formatCpf(cpf)}\nCadastro feito por ${actorName}.`,
    ]);

    // Outro lead do mesmo cliente (mesmo CPF): reaproveita o cadastro, sem aviso.
    test.sent.length = 0;
    const again = await test.createLead("Lead Repetido TG3");
    const reused = await test.post(`/leads/${again}/convert`, {
      cpf,
      ...testPatientContact,
    });
    expect(reused.statusCode, reused.body).toBe(200);
    expect(reused.json().reusedExisting).toBe(true);
    expect(test.sent).toEqual([]);
  });

  it("importação em lote lista somente os cadastros novos e seus CPFs", async () => {
    const test = await setup();
    await test.link();
    const cpf = nextTestCpf();
    const payload = {
      fileName: "lista.csv",
      contentBase64: Buffer.from(
        `Nome;Telefone;CPF\nAna Import TG3;11977771001;${cpf}\nBia Import TG3;11977771002;\nCadastro Existente;11977771003;${test.patient.cpf}\n`,
      ).toString("base64"),
      mapping: ["fullName", "phone", "cpf"],
    };
    const imported = await test.post("/patients/import", payload);
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json().created).toBe(2);
    expect(test.sent.map((item) => item.text)).toEqual([
      `Importação de clientes\n2 novos cadastros por ${actorName}.\n\n• Ana Import TG3 (CPF: ${formatCpf(cpf)})\n• Bia Import TG3 (CPF não informado)`,
    ]);

    // Reimportação sem cliente novo: sem aviso.
    test.sent.length = 0;
    const again = await test.post("/patients/import", payload);
    expect(again.json().created).toBe(0);
    expect(test.sent).toEqual([]);
  });
});

describe("TG3: resumo das sessões", () => {
  const item = (
    startsAt: string,
    extra: Partial<CreatedAppointmentSummary> = {},
  ): CreatedAppointmentSummary => ({
    id: randomUUID(),
    patientName: "Maria",
    patientId: "maria",
    serviceName: "Pilates",
    professionalName: "João",
    startsAt,
    ...extra,
  });

  it("horários diferentes por dia aparecem em cada dia da semana", () => {
    expect(
      formatAppointmentsCreatedMessages(
        [
          item(at("2031-03-10", "09:00")),
          item(at("2031-03-12", "18:30")),
          item(at("2031-03-17", "09:00")),
          item(at("2031-03-19", "18:30")),
        ],
        "Ana",
        "America/Sao_Paulo",
      ),
    ).toEqual([
      "Novos agendamentos\nMarcado por Ana.\n\nCliente: Maria\nCPF não informado\nServiço: Pilates\nProfissional: João\n• 10/03/2031 (segunda-feira) às 09:00\n• 12/03/2031 (quarta-feira) às 18:30\n• 17/03/2031 (segunda-feira) às 09:00\n• 19/03/2031 (quarta-feira) às 18:30",
    ]);
  });

  it("serviços diferentes na mesma operação viram uma linha cada", () => {
    expect(
      formatAppointmentsCreatedMessages(
        [
          item(at("2031-03-10")),
          item(at("2031-03-11", "10:00"), { serviceName: "Dançaterapia" }),
          item(at("2031-03-18", "10:00"), { serviceName: "Dançaterapia" }),
        ],
        undefined,
        "America/Sao_Paulo",
      ),
    ).toEqual([
      [
        "Novos agendamentos",
        "",
        "Cliente: Maria\nCPF não informado\nServiço: Pilates\nProfissional: João",
        "Quando: 10/03/2031 (segunda-feira) às 09:00",
        "",
        "Cliente: Maria\nCPF não informado\nServiço: Dançaterapia\nProfissional: João",
        "• 11/03/2031 (terça-feira) às 10:00",
        "• 18/03/2031 (terça-feira) às 10:00",
      ].join("\n"),
    ]);
  });
});
