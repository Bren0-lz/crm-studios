import { afterEach, describe, expect, it } from "vitest";
import type { CommercialEvent, Lead } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { readXlsxRows } from "../../infrastructure/spreadsheet.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

type Headers = Record<string, string>;

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers: Headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const event = (
    await app.inject({
      method: "POST",
      url: "/events",
      headers,
      payload: { name: "Aulão na praça", startsAt: "2026-11-08T12:00:00.000Z" },
    })
  ).json() as CommercialEvent;
  const addParticipant = async (
    payload: Record<string, unknown>,
    as: Headers = headers,
  ) => {
    const response = await app.inject({
      method: "POST",
      url: "/leads",
      headers: as,
      payload: { source: "Evento", eventId: event.id, ...payload },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json() as Lead;
  };
  const exportRows = async (as: Headers = headers) => {
    const response = await app.inject({
      method: "GET",
      url: `/events/${event.id}/participants/export.xlsx`,
      headers: as,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["content-disposition"]).toMatch(
      /attachment; filename="participantes-.+\.xlsx"/,
    );
    return readXlsxRows(response.rawPayload);
  };
  return { app, repository, headers, event, addParticipant, exportRows };
}

const header = [
  "Nome",
  "DDD (Telefone)",
  "Telefone",
  "DDD (WhatsApp)",
  "WhatsApp",
  "E-mail",
  "Interesse",
  "Etapa",
  "Status",
  "Último contato",
  "Avaliação marcada",
  "Virou cliente",
  "Data da conversão",
  "Outros",
];

describe("exportação de participantes do evento", () => {
  it("baixa a planilha com as colunas do evento, conversão e Outros", async () => {
    const { app, repository, headers, event, addParticipant, exportRows } =
      await setup();
    const ana = await addParticipant({
      fullName: "Ana Participante",
      phone: "11987650001",
      whatsapp: "11987650002",
      email: "ana@example.com",
      interest: "Pilates",
    });
    const bia = await addParticipant({
      fullName: "Bia Participante",
      phone: "11987650003",
      interest: "Dança",
    });
    // Contato feito às 22h de 10/11 em São Paulo = 01h de 11/11 em UTC.
    const contact = await app.inject({
      method: "POST",
      url: `/leads/${ana.id}/contacts`,
      headers,
      payload: {
        channel: "whatsapp",
        direction: "outbound",
        notes: "Mandei a grade",
        occurredAt: "2026-11-11T01:00:00.000Z",
      },
    });
    expect(contact.statusCode, contact.body).toBe(201);
    const [professional] = await repository.listProfessionals(clinicId),
      [room] = await repository.listRooms(clinicId),
      [service] = await repository.listServices(clinicId);
    const evaluation = await app.inject({
      method: "POST",
      url: `/leads/${ana.id}/appointments`,
      headers,
      payload: {
        professionalId: professional!.id,
        roomId: room!.id,
        serviceId: service!.id,
        startsAt: "2031-05-12T13:00:00.000Z",
        visitType: "trial",
      },
    });
    expect(evaluation.statusCode, evaluation.body).toBe(201);
    const converted = await app.inject({
      method: "POST",
      url: `/leads/${bia.id}/convert`,
      headers,
      payload: { cpf: nextTestCpf(), ...testPatientContact },
    });
    expect(converted.statusCode, converted.body).toBe(200);
    // "Outros" vem da importação de participantes.
    const imported = await app.inject({
      method: "POST",
      url: `/events/${event.id}/import`,
      headers,
      payload: {
        fileName: "participantes.csv",
        contentBase64: Buffer.from(
          "Nome;Telefone;Camiseta;Turma\nCarla Importada;11987650020;M;Noite\n",
        ).toString("base64"),
        mapping: ["fullName", "phone", "extra", "extra"],
      },
    });
    expect(imported.statusCode, imported.body).toBe(200);

    const rows = await exportRows();
    expect(rows[0]).toEqual(header);
    expect(rows).toHaveLength(4);
    // Datas no fuso da clínica (a leitura devolve só o dia).
    expect(rows[1]).toEqual([
      "Ana Participante",
      "11",
      "98765-0001",
      "11",
      "98765-0002",
      "ana@example.com",
      "Pilates",
      "Novos",
      "Avaliação",
      "2026-11-10",
      "2031-05-12",
      "Não",
      "",
      "",
    ]);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    expect(rows[2]).toEqual([
      "Bia Participante",
      "11",
      "98765-0003",
      "",
      "",
      "",
      "Dança",
      "Ganhos",
      "Cliente",
      "",
      "",
      "Sim",
      today,
      "",
    ]);
    expect(rows[3]).toEqual([
      "Carla Importada",
      "11",
      "98765-0020",
      "",
      "",
      "",
      "Evento",
      "Novos",
      "Não contatado",
      "",
      "",
      "Não",
      "",
      "Camiseta: M; Turma: Noite",
    ]);
  });

  it("respeita a filial ativa e devolve 404 para evento inexistente", async () => {
    const { app, headers, addParticipant, exportRows } = await setup();
    const centro = await app.inject({
      method: "POST",
      url: "/admin/branches",
      headers,
      payload: { name: "Centro" },
    });
    expect(centro.statusCode, centro.body).toBe(201);
    const branches = (
      await app.inject({ method: "GET", url: "/branches", headers })
    ).json() as { id: string; isDefault: boolean }[];
    const matriz = branches.find((branch) => branch.isDefault)!;
    const inCentro = { ...headers, "x-branch-id": centro.json().id as string };
    const inMatriz = { ...headers, "x-branch-id": matriz.id };
    await addParticipant(
      { fullName: "Participante do Centro", phone: "11987650010", interest: "Pilates" },
      inCentro,
    );
    await addParticipant(
      { fullName: "Participante da Matriz", phone: "11987650011", interest: "Pilates" },
      inMatriz,
    );
    expect((await exportRows(inCentro)).map((row) => row[0])).toEqual([
      "Nome",
      "Participante do Centro",
    ]);
    expect((await exportRows(inMatriz)).map((row) => row[0])).toEqual([
      "Nome",
      "Participante da Matriz",
    ]);
    const missing = await app.inject({
      method: "GET",
      url: "/events/99999999-9999-4999-8999-000000000000/participants/export.xlsx",
      headers,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "EVENT_NOT_FOUND" });
  });

  it("exige a mesma permissão de ver eventos", async () => {
    const { app, repository, event } = await setup();
    const asUser = async (permissions: string[]) => {
      const user = await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: `Equipe ${permissions.length}`,
          email: `exporta${permissions.length}@example.com`,
          role: "user",
          password: "SenhaForte123",
          permissions: permissions as never,
        },
        "hash-de-teste",
      );
      return {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      };
    };
    const url = `/events/${event.id}/participants/export.xlsx`;
    const denied = await app.inject({
      method: "GET",
      url,
      headers: await asUser(["crm.view"]),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "COMMERCIAL_ACCESS_DENIED" });
    const allowed = await app.inject({
      method: "GET",
      url,
      headers: await asUser(["crm.view", "events.view"]),
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
  });
});
