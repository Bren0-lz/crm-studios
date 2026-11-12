import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { LeadImportAnalysis } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const url = "/leads/import";
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
  return { app, repository, headers };
}
const csv = (
  text: string,
  extra: { mapping?: (string | null)[]; source?: string; stage?: string } = {},
) => ({
  fileName: "leads.csv",
  contentBase64: Buffer.from(text).toString("base64"),
  source: "Planilha",
  stage: "new_contact",
  ...extra,
});

describe("importação de leads por planilha (LI1)", () => {
  it("cria leads sem evento, sem campos obrigatórios, com a origem e a etapa escolhidas", async () => {
    const { app, repository, headers } = await setup();
    const payload = csv(
      "Nome;Celular;Origem;Interesse\nAna Souza;11999991234;;Pilates\nBia;;Instagram;\n;;;Depilação\n;;;",
      { source: "Feira de saúde", stage: "contacted" },
    );
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const analysis = preview.json<LeadImportAnalysis>();
    expect(analysis.mapping).toEqual([
      "fullName",
      "phone",
      "source",
      "interest",
    ]);
    expect(analysis.totals).toEqual({ valid: 3, error: 0 });
    expect(await repository.listLeads(clinicId)).toHaveLength(0);

    const imported = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual({ created: 3, warnings: 0, errors: 0 });
    const leads = await repository.listLeads(clinicId);
    expect(leads).toHaveLength(3);
    expect(leads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fullName: "Ana Souza",
          phone: "11999991234",
          source: "Feira de saúde",
          interest: "Pilates",
          stage: "contacted",
        }),
        expect.objectContaining({
          fullName: "Bia",
          phone: "",
          source: "Instagram",
          interest: "Não informado",
          stage: "contacted",
        }),
        expect.objectContaining({
          fullName: "",
          interest: "Depilação",
        }),
      ]),
    );
    expect(leads.every((lead) => !lead.eventId)).toBe(true);
  });

  it("avisa quem já é cliente, já é lead ou repete outra linha, sem bloquear a importação", async () => {
    const { app, repository, headers } = await setup();
    const cpf = nextTestCpf();
    await repository.createPatient(clinicId, {
      fullName: "Cliente Maria",
      phone: "11988880001",
      cpf,
      tags: [],
      ...testPatientContact,
    });
    await repository.createLead(clinicId, {
      fullName: "Lead João",
      phone: "11977770000",
      email: "joao@example.com",
      source: "Indicação",
      interest: "Pilates",
      tags: [],
    });
    const payload = csv(
      [
        "Nome;Telefone;E-mail;CPF",
        "Maria;+55 (11) 98888-0001;;",
        "João;;JOAO@example.com;",
        "Novo;11966660000;;",
        "Novo de novo;11 96666-0000;;",
        `Pelo CPF;;;${cpf}`,
      ].join("\n"),
    );
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const rows = preview.json<LeadImportAnalysis>().rows;
    expect(rows.map((row) => [row.status, row.warnings ?? []])).toEqual([
      ["valid", ["Já é cliente: Cliente Maria."]],
      ["valid", ["Já é lead: Lead João."]],
      ["valid", []],
      ["valid", ["Repete a linha 4."]],
      ["valid", ["Já é cliente: Cliente Maria."]],
    ]);
    const imported = await app.inject({
      method: "POST",
      url,
      headers,
      payload,
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual({ created: 5, warnings: 4, errors: 0 });
    const leads = await repository.listLeads(clinicId);
    expect(leads).toHaveLength(6);
    // Quem já é cliente entra como lead aberto, sem vínculo com o cliente.
    expect(leads.find((lead) => lead.fullName === "Maria")).toMatchObject({
      stage: "new_contact",
      source: "Planilha",
    });
    expect(
      leads.find((lead) => lead.fullName === "Maria")?.convertedPatientId,
    ).toBeUndefined();
  });

  it("lê XLSX, combina DDD e relata erros sem impedir as linhas válidas", async () => {
    const { app, headers } = await setup();
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Leads").addRows([
      ["Nome", "DDD", "Telefone", "E-mail", "Ignorar"],
      ["Ana", "11", "999991234", "ana@example.com", "x"],
      ["Bia", "", "", "inválido", "x"],
    ]);
    const payload = {
      ...csv(""),
      fileName: "leads.xlsx",
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
    const analysis = preview.json<LeadImportAnalysis>();
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
    expect(imported.json()).toEqual({ created: 1, warnings: 0, errors: 1 });
  });

  it("recusa etapa fechada ou inexistente, arquivo inválido, acesso sem permissão e isola clínicas", async () => {
    const { app, repository, headers } = await setup();
    for (const stage of ["won", "lost", "nao_existe", ""]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload: csv("Nome\nAna", { stage }),
      });
      expect(response.statusCode, response.body).toBe(400);
    }
    for (const payload of [
      csv(""),
      csv("Coluna\nvalor"),
      csv("Nome;Telefone\nAna;123", { mapping: ["phone", "phone"] }),
      csv("Nome\nAna", { source: "" }),
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(400);
    }
    expect(await repository.listLeads(clinicId)).toHaveLength(0);
    expect(
      (await app.inject({ method: "POST", url, payload: csv("Nome\nAna") }))
        .statusCode,
    ).toBe(401);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Leitor CRM",
        email: "leitor-crm@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["crm.view"],
      },
      "hash-de-teste",
    );
    const viewer = {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
    for (const suffix of ["", "/preview"])
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
    // O aviso só olha a própria clínica.
    await repository.createLead("99999999-9999-4999-8999-999999999999", {
      fullName: "Lead de fora",
      phone: "11955550000",
      source: "Indicação",
      interest: "Pilates",
      tags: [],
    });
    const preview = await app.inject({
      method: "POST",
      url: `${url}/preview`,
      headers,
      payload: csv("Nome;Telefone\nAna;11955550000"),
    });
    expect(
      preview.json<LeadImportAnalysis>().rows[0]?.warnings,
    ).toBeUndefined();
  });
});
