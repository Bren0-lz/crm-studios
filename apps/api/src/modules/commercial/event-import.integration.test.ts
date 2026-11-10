import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CommercialEvent, EventImportAnalysis } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const event = (
    await app.inject({
      method: "POST",
      url: "/events",
      headers,
      payload: { name: "Aulão da praça", startsAt: "2026-11-08T12:00:00.000Z" },
    })
  ).json() as CommercialEvent;
  return { app, repository, headers, event, url: `/events/${event.id}/import` };
}
const csv = (text: string, mapping?: (string | null)[]) => ({
  fileName: "participantes.csv",
  contentBase64: Buffer.from(text).toString("base64"),
  ...(mapping ? { mapping } : {}),
});

describe("importação de participantes", () => {
  it("mapeia colunas sem exigir campos, aceita telefone curto e lead da base e ignora o repetido no arquivo", async () => {
    const { app, repository, headers, event, url } = await setup();
    await repository.createLead(clinicId, {
      fullName: "Lead existente",
      phone: "11999991234",
      email: "mesmo@example.com",
      source: "Indicação",
      interest: "Pilates",
      tags: [],
    });
    const payload = csv(
      "Pessoa;Contato;Correio;Anotação\nAna;11999991234;mesmo@example.com;\nBia;11999991234;;\n;123;;\n;;;Somente observação\n;;;;",
      ["fullName", "phone", "email", "notes"],
    );
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json<EventImportAnalysis>()).toMatchObject({
      totals: { valid: 4, error: 0 },
      mapping: payload.mapping,
    });
    expect(
      (await repository.getEvent(clinicId, event.id))?.participants,
    ).toHaveLength(0);
    const imported = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    expect(imported.statusCode, imported.body).toBe(200);
    // EN1: "Bia" repete o telefone da "Ana" (já participante pela linha anterior): ignorada.
    // O lead de fora do evento com o mesmo contato não impede a "Ana".
    expect(imported.json()).toEqual({
      created: 3,
      linked: 0,
      skipped: 1,
      errors: 0,
    });
    const detail = await repository.getEvent(clinicId, event.id);
    expect(detail?.participants).toHaveLength(3);
    expect(detail?.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fullName: "",
          phone: "123",
          source: "Evento: Aulão da praça",
          interest: "Evento",
        }),
        expect.objectContaining({
          fullName: "",
          phone: "",
          notes: "Somente observação",
        }),
      ]),
    );
  });

  it("lê XLSX, combina DDD, ignora colunas e relata erros sem impedir linhas válidas", async () => {
    const { app, headers, url } = await setup();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Participantes");
    sheet.addRows([
      ["Nome", "DDD (Telefone)", "Telefone", "E-mail", "Ignorar"],
      ["Ana", "11", "999991234", "ana@example.com", "x"],
      ["Bia", "", "", "inválido", "x"],
      ["", "", "", "", "só ignorar"],
    ]);
    const payload = {
      fileName: "presença.xlsx",
      contentBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString(
        "base64",
      ),
    };
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const analysis = preview.json<EventImportAnalysis>();
    expect(analysis.mapping).toEqual([
      "fullName",
      "phoneAreaCode",
      "phone",
      "email",
      null,
    ]);
    expect(analysis.rows[0]?.input?.phone).toBe("11999991234");
    expect(analysis.totals).toEqual({ valid: 1, error: 1 });
    const imported = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    expect(imported.json()).toEqual({
      created: 1,
      linked: 0,
      skipped: 0,
      errors: 1,
    });
  });

  it("aceita cadastro manual sem campos e preserva a validação dos leads comuns", async () => {
    const { app, headers, event } = await setup();
    const result = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: { eventId: event.id },
    });
    expect(result.statusCode, result.body).toBe(201);
    expect(result.json()).toMatchObject({
      fullName: "",
      phone: "",
      eventId: event.id,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/leads",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });

  it("valida arquivo, mapeamento, acesso e isolamento entre clínicas", async () => {
    const { app, repository, headers, event, url } = await setup();
    for (const payload of [
      csv(""),
      csv("Coluna\nvalor"),
      csv("Nome;Telefone\nAna;123", ["phone", "phone"]),
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(400);
    }
    for (const [payload, status] of [
      [{ fileName: "lista.pdf", contentBase64: "eA==" }, 400],
      [{ fileName: "lista.xlsx", contentBase64: "eA==" }, 400],
      [
        {
          fileName: "lista.csv",
          contentBase64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"),
        },
        413,
      ],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(status);
    }
    expect(
      (await app.inject({ method: "POST", url, payload: csv("Nome\nAna") }))
        .statusCode,
    ).toBe(401);
    const foreignEvent = await repository.createEvent(
      "99999999-9999-4999-8999-999999999999",
      actorId,
      { name: "Outro evento", startsAt: event.startsAt },
    );
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Leitor eventos",
        email: "leitor-eventos@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["events.view"],
      },
      "hash-de-teste",
    );
    const viewer = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    for (const suffix of ["", "/preview"]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/events/${foreignEvent.id}/import${suffix}`,
            headers,
            payload: csv("Nome\nAna"),
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${url}${suffix}`,
            headers: viewer,
            payload: csv("Nome\nAna"),
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(event.participantCount).toBe(0);
  });

  it("liga quem já é cliente por telefone, e-mail ou CPF e ignora quem já participa (EN1)", async () => {
    const { app, repository, headers, event, url } = await setup();
    const cpf = nextTestCpf();
    const [byPhone, byEmail, byCpf] = await Promise.all([
      repository.createPatient(clinicId, {
        fullName: "Cliente Telefone",
        phone: "11988880001",
        cpf: nextTestCpf(),
        tags: [],
        ...testPatientContact,
      }),
      repository.createPatient(clinicId, {
        fullName: "Cliente Email",
        phone: "11988880002",
        email: "cliente@example.com",
        cpf: nextTestCpf(),
        tags: [],
        ...testPatientContact,
      }),
      repository.createPatient(clinicId, {
        fullName: "Cliente Cpf",
        phone: "11988880003",
        cpf,
        tags: [],
        ...testPatientContact,
      }),
    ]);
    await repository.createLead(clinicId, {
      eventId: event.id,
      fullName: "Já participante",
      phone: "11988880009",
      source: "Evento",
      interest: "Evento",
      tags: [],
    });
    const patientsBefore = (await repository.listPatients(clinicId)).length;
    const payload = csv(
      [
        "Nome;Telefone;E-mail;CPF",
        // Mesmo telefone com DDI e pontuação.
        "Fone;+55 (11) 98888-0001;;",
        // Mesmo e-mail com outra caixa.
        "Mail;;CLIENTE@example.com;",
        `Doc;;;${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`,
        // Só o nome igual não basta.
        "Cliente Telefone;11988880555;;",
        // Já participa do evento.
        "Repetido;11988880009;;",
      ].join("\n"),
    );
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload,
    });
    expect(preview.json<EventImportAnalysis>().mapping).toEqual([
      "fullName",
      "phone",
      "email",
      "cpf",
    ]);
    const imported = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual({
      created: 1,
      linked: 3,
      skipped: 1,
      errors: 0,
    });
    expect(await repository.listPatients(clinicId)).toHaveLength(
      patientsBefore,
    );
    const detail = await repository.getEvent(clinicId, event.id);
    const linkedTo = Object.fromEntries(
      detail!.participants.map((item) => [
        item.fullName,
        [item.convertedPatientId, item.stage],
      ]),
    );
    expect(linkedTo).toEqual({
      "Já participante": [undefined, expect.any(String)],
      Fone: [byPhone.id, "won"],
      Mail: [byEmail.id, "won"],
      Doc: [byCpf.id, "won"],
      "Cliente Telefone": [undefined, expect.any(String)],
    });
    expect(detail!.indicators.converted).toBe(3);

    const again = await app.inject({ method: "POST", url, headers, payload });
    expect(again.json()).toEqual({
      created: 0,
      linked: 0,
      skipped: 5,
      errors: 0,
    });
  });
});
