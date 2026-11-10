import { afterEach, describe, expect, it } from "vitest";
import type {
  CommercialEvent,
  CommercialEventDetail,
  EventImportAnalysis,
  Patient,
  PatientImportAnalysis,
} from "@crm/contracts";
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
  return { app, repository, headers };
}

const csv = (text: string, mapping?: (string | null)[]) => ({
  fileName: "lista.csv",
  contentBase64: Buffer.from(text).toString("base64"),
  ...(mapping ? { mapping } : {}),
});

describe('"Outros" na importação (entrega 10)', () => {
  it("guarda as colunas Outros no cliente, mescla na reimportação e exporta", async () => {
    const { app, headers } = await setup();
    const first = csv(
      "Nome;Telefone;Tamanho do pé;Como conheceu\nAna Outros;11977770001;37;Instagram\nBia Outros;11977770002;;Indicação\n",
      ["fullName", "phone", "extra", "extra"],
    );
    const preview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: first,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    const analysis = preview.json<PatientImportAnalysis>();
    expect(analysis.mapping).toEqual(first.mapping);
    expect(analysis.rows.map((row) => row.input?.extraFields)).toEqual([
      { "Tamanho do pé": "37", "Como conheceu": "Instagram" },
      { "Como conheceu": "Indicação" },
    ]);

    const imported = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: first,
    });
    expect(imported.json()).toEqual({
      created: 2,
      skipped: 0,
      errors: 0,
      updated: 0,
    });

    // Reimportação: quem já existe recebe o "Outros" da linha (chave igual é atualizada,
    // as demais ficam); linha repetida sem "Outros" continua só ignorada.
    const again = csv(
      "Nome;Telefone;Tamanho do pé;Turma\nAna Outros;11977770001;38;Manhã\nBia Outros;11977770002;;\n",
      ["fullName", "phone", "extra", "extra"],
    );
    const againPreview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: again,
    });
    expect(againPreview.json<PatientImportAnalysis>().totals).toEqual({
      valid: 0,
      error: 0,
      duplicate: 2,
    });
    const merged = await app.inject({
      method: "POST",
      url: "/patients/import",
      headers,
      payload: again,
    });
    expect(merged.json()).toEqual({
      created: 0,
      skipped: 1,
      errors: 0,
      updated: 1,
    });

    const listed = (
      await app.inject({
        method: "GET",
        url: "/patients?search=Outros",
        headers,
      })
    ).json<Patient[]>();
    expect(
      Object.fromEntries(
        listed.map((item) => [item.fullName, item.extraFields]),
      ),
    ).toEqual({
      "Ana Outros": {
        "Tamanho do pé": "38",
        "Como conheceu": "Instagram",
        Turma: "Manhã",
      },
      "Bia Outros": { "Como conheceu": "Indicação" },
    });

    const exported = await app.inject({
      method: "GET",
      url: "/patients/export?columns=fullName,extraFields&search=Ana%20Outros",
      headers,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain("Outros");
    expect(exported.body).toContain(
      "Tamanho do pé: 38; Como conheceu: Instagram; Turma: Manhã",
    );
    // Fora das colunas padrão: só sai quando escolhido.
    const standard = await app.inject({
      method: "GET",
      url: "/patients/export?search=Ana%20Outros",
      headers,
    });
    expect(standard.body).not.toContain("Instagram");
  });

  it("recusa valor longo demais em Outros como erro da linha", async () => {
    const { app, headers } = await setup();
    const preview = await app.inject({
      method: "POST",
      url: "/patients/import/preview",
      headers,
      payload: csv(
        `Nome;Telefone;Obs livre\nCris Longa;11977770003;${"x".repeat(501)}\n`,
        ["fullName", "phone", "extra"],
      ),
    });
    const analysis = preview.json<PatientImportAnalysis>();
    expect(analysis.totals.error).toBe(1);
    expect(analysis.rows[0]?.errors?.[0]).toContain('"Outros"');
  });

  it("guarda Outros no participante e leva para o cliente na conversão", async () => {
    const { app, repository, headers } = await setup();
    const event = (
      await app.inject({
        method: "POST",
        url: "/events",
        headers,
        payload: { name: "Aulão", startsAt: "2026-11-08T12:00:00.000Z" },
      })
    ).json<CommercialEvent>();
    const existing = await repository.createPatient(clinicId, {
      fullName: "Dora Cliente",
      phone: "11977770010",
      cpf: nextTestCpf(),
      tags: [],
      ...testPatientContact,
    });
    await repository.importPatients(clinicId, [
      {
        fullName: "Dora Cliente",
        phone: "11977770010",
        tags: [],
        extraFields: { Pé: "36", Cor: "azul" },
      },
    ]);
    const payload = csv(
      "Nome;Telefone;Pé;Camiseta\nEva Evento;11977770011;37;M\nDora Cliente;11977770010;38;\n;;;\n;;;G\n",
      ["fullName", "phone", "extra", "extra"],
    );
    const preview = await app.inject({
      method: "POST",
      url: `/events/${event.id}/import/preview`,
      headers,
      payload,
    });
    const analysis = preview.json<EventImportAnalysis>();
    expect(analysis.totals).toEqual({ valid: 3, error: 0 });
    expect(analysis.rows.map((row) => row.input?.extraFields)).toEqual([
      { Pé: "37", Camiseta: "M" },
      { Pé: "38" },
      { Camiseta: "G" },
    ]);
    const imported = await app.inject({
      method: "POST",
      url: `/events/${event.id}/import`,
      headers,
      payload,
    });
    // EN1: "Dora" já é cliente, então entra ligada ao cadastro (e o "Outros" já é mesclado).
    expect(imported.json()).toEqual({
      created: 2,
      linked: 1,
      skipped: 0,
      errors: 0,
    });
    const participants = (
      await app.inject({ method: "GET", url: `/events/${event.id}`, headers })
    ).json<CommercialEventDetail>().participants;
    const eva = participants.find((item) => item.fullName === "Eva Evento")!;
    const dora = participants.find((item) => item.fullName === "Dora Cliente")!;
    expect(eva.extraFields).toEqual({ Pé: "37", Camiseta: "M" });

    const newClient = await app.inject({
      method: "POST",
      url: `/leads/${eva.id}/convert`,
      headers,
      payload: { cpf: nextTestCpf(), ...testPatientContact },
    });
    expect(newClient.statusCode, newClient.body).toBe(200);
    expect(newClient.json().patient.extraFields).toEqual({
      Pé: "37",
      Camiseta: "M",
    });

    // Cliente já cadastrado: mescla com o "Outros" que ele já tinha.
    const reused = await app.inject({
      method: "POST",
      url: `/leads/${dora.id}/convert`,
      headers,
      payload: { cpf: existing.cpf },
    });
    expect(reused.statusCode, reused.body).toBe(200);
    expect(reused.json()).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id, extraFields: { Pé: "38", Cor: "azul" } },
    });
  });
});
