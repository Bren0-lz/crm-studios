import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { CommercialEvent, EventImportAnalysis } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

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
  it("mapeia colunas sem exigir campos e aceita telefone curto, repetido no arquivo e na base", async () => {
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
    expect(imported.json()).toEqual({ created: 4, errors: 0 });
    const detail = await repository.getEvent(clinicId, event.id);
    expect(detail?.participants).toHaveLength(4);
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
    expect(imported.json()).toEqual({ created: 1, errors: 1 });
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
});
