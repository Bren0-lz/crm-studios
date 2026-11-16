import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "77777777-7777-4777-8777-777777777777";
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
  const [patient] = await repository.listPatients(clinicId);
  const settings = (await repository.getClinicSettings(clinicId))!;
  await repository.updateClinicSettings(clinicId, actorId, {
    ...settings,
    taxId: "",
    address: "",
    phone: "19999990000",
    email: "contato@studio.com.br",
  });
  return { repository, app, headers, patient: patient! };
}

describe("contrato com dados da clínica faltando (E6)", () => {
  it("recusa a emissão com 409 listando os campos da clínica sem cadastro", async () => {
    const { repository, app, headers, patient } = await setup();
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato com CNPJ",
      kind: "contract",
      body: "Contrato de {{paciente_nome}} com {{clinica_nome}}, CNPJ {{clinica_cnpj}}, sede em {{clinica_endereco}}, telefone {{clinica_telefone}}.",
    });
    const input = {
      templateId: template.id,
      patientId: patient.id,
      title: "Contrato do cliente",
    };

    const preview = await app.inject({
      method: "POST",
      url: "/documents/preview",
      headers,
      payload: input,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().missingClinicFields).toEqual([
      { key: "clinica_cnpj", name: "CNPJ" },
      { key: "clinica_endereco", name: "endereço" },
    ]);

    const before = (await repository.listIssuedDocuments(clinicId)).length;
    const created = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: input,
    });
    expect(created.statusCode).toBe(409);
    expect(created.json()).toMatchObject({
      code: "DOCUMENT_CLINIC_DATA_MISSING",
      message:
        "Cadastre CNPJ e endereço da clínica em Configurações › Clínica antes de emitir este contrato.",
    });
    expect((await repository.listIssuedDocuments(clinicId)).length).toBe(
      before,
    );

    // Texto já preenchido no navegador não contorna a regra: vale o modelo usado.
    const filled = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        ...input,
        content: preview.json().snapshotContent,
      },
    });
    expect(filled.statusCode).toBe(409);

    const settings = (await repository.getClinicSettings(clinicId))!;
    await repository.updateClinicSettings(clinicId, actorId, {
      ...settings,
      taxId: "11222333000181",
      address: "Av. Brasil, 500, Campinas/SP",
    });
    const ok = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: input,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().snapshotBody).toContain("Av. Brasil, 500");
    expect(ok.json().snapshotBody).not.toContain("não informado");
  });

  it("emite o modelo que não usa o campo vazio e não bloqueia por dado do cliente", async () => {
    const { repository, app, headers, patient } = await setup();
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato simples",
      kind: "contract",
      body: "Contrato de {{paciente_nome}}, endereço {{paciente_endereco}}, com {{clinica_nome}} ({{clinica_razao_social}}), telefone {{clinica_telefone}}.",
    });
    const created = await app.inject({
      method: "POST",
      url: "/documents",
      headers,
      payload: {
        templateId: template.id,
        patientId: patient.id,
        title: "Contrato do cliente",
      },
    });
    expect(created.statusCode).toBe(201);
  });

  it("no cadastro guiado recusa a venda com contrato antes de gravar o cliente", async () => {
    const { app, token, repository } = await authenticatedApp();
    apps.push(app);
    const headers = { authorization: `Bearer ${token}` };
    const settings = (await repository.getClinicSettings(clinicId))!;
    await repository.updateClinicSettings(clinicId, actorId, {
      ...settings,
      taxId: "",
    });
    const terms = await configuredPlan(app, {
      services: [
        { serviceId: SERVICE_ID, totalSessions: 1, totalValueInCents: 9000 },
      ],
      name: "Sessão avulsa",
      kind: "single",
      serviceId: SERVICE_ID,
      totalSessions: 1,
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      totalValueInCents: 9000,
      installments: 1,
      firstDueDate: "2026-01-10",
    });
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato com CNPJ",
      kind: "contract",
      body: "Contrato de {{paciente_nome}}, CNPJ da clínica {{clinica_cnpj}}.",
    });
    const before = (await repository.listPatients(clinicId)).length;
    const response = await app.inject({
      method: "POST",
      url: "/patients/guided",
      headers,
      payload: {
        next: "single",
        patient: {
          fullName: "Cliente Sem Contrato",
          cpf: nextTestCpf(),
          ...testPatientContact,
          phone: "11977773091",
        },
        plan: terms,
        document: { templateId: template.id, title: template.name },
      },
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({
      code: "DOCUMENT_CLINIC_DATA_MISSING",
      message:
        "Cadastre CNPJ da clínica em Configurações › Clínica antes de emitir este contrato.",
    });
    expect((await repository.listPatients(clinicId)).length).toBe(before);
  });
});
