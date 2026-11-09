import { afterEach, describe, expect, it } from "vitest";
import { leadInputSchema } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
import { patientLeadOriginLabels } from "./patient-export.js";

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

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('coluna "Origem: evento/lead" na exportação de clientes (EN3b)', () => {
  it("monta o texto por cliente: evento ou lead, sem repetir, do mais antigo", () => {
    const labels = patientLeadOriginLabels([
      { patientId: "a", eventName: "Aulão" },
      { patientId: "b" },
      { patientId: "c" },
      { patientId: "c", eventName: "Feira" },
      { patientId: "c" },
      { patientId: "a", eventName: "Aulão" },
    ]);
    expect(Object.fromEntries(labels)).toEqual({
      a: "Evento: Aulão",
      b: "Lead",
      c: "Lead; Evento: Feira",
    });
  });

  it("sai só quando escolhida, com a origem de cada cliente convertido", async () => {
    const { app, repository, headers } = await setup();
    const event = await repository.createEvent(clinicId, actorId, {
      name: "Aulão na praça",
      startsAt: "2026-11-08T12:00:00.000Z",
    });
    const convert = async (
      fullName: string,
      phone: string,
      eventId?: string,
    ) => {
      await tick();
      const lead = await repository.createLead(
        clinicId,
        leadInputSchema.parse({
          fullName,
          phone,
          source: "Indicação",
          interest: "Pilates",
          ...(eventId ? { eventId } : {}),
        }),
      );
      const response = await app.inject({
        method: "POST",
        url: `/leads/${lead.id}/convert`,
        headers,
        payload: { cpf: nextTestCpf(), ...testPatientContact },
      });
      expect(response.statusCode, response.body).toBe(200);
    };
    await convert("Ana Exporta Origem", "11977771001", event.id);
    await convert("Bia Exporta Origem", "11977771002");
    await convert("Bia Exporta Origem", "11977771002", event.id);
    await repository.createPatient(clinicId, {
      fullName: "Caio Exporta Origem",
      phone: "11977771003",
      cpf: nextTestCpf(),
      tags: [],
      ...testPatientContact,
    });

    const exported = await app.inject({
      method: "GET",
      url: "/patients/export?columns=fullName,leadOrigin&search=Exporta%20Origem",
      headers,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.replace(/^\uFEFF/, "").split("\r\n")).toEqual([
      "Nome;Origem: evento/lead",
      "Ana Exporta Origem;Evento: Aulão na praça",
      'Bia Exporta Origem;"Lead; Evento: Aulão na praça"',
      "Caio Exporta Origem;",
      "",
    ]);

    const xlsx = await app.inject({
      method: "GET",
      url: "/patients/export?format=xlsx&columns=fullName,leadOrigin&search=Exporta%20Origem",
      headers,
    });
    expect(xlsx.statusCode).toBe(200);

    // Fora das colunas padrão.
    const standard = await app.inject({
      method: "GET",
      url: "/patients/export?search=Exporta%20Origem",
      headers,
    });
    expect(standard.body).not.toContain("Origem: evento/lead");
    expect(standard.body).not.toContain("Evento: Aulão");
  });
});
