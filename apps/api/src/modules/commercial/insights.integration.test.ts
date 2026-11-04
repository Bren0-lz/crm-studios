import { nextTestCpf } from "../../test-support/cpf.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import {
  leadInputSchema,
  leadContactInputSchema,
  type Lead,
  type LeadInsights,
} from "@crm/contracts";
import { testPatientContact } from "../../test-support/patient-contact.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});
describe("commercial filters and conversion", () => {
  it("matches funnel indicators to the same cohort, contacts, loss reasons and overdue tasks", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const create = (name: string, source: string) =>
      repository.createLead(
        clinicId,
        leadInputSchema.parse({
          fullName: name,
          phone: "11988887777",
          source,
          interest: "Pilates",
          contactMethod: "Contato telefônico",
          responsibleUserId: actorId,
        }),
      );
    const lead = await create("Lead acompanhado", "Origem filtrada"),
      lost = await create("Lead não efetivado", "Origem filtrada");
    await create("Outra oportunidade", "Outra origem");
    await repository.createLeadContact(
      clinicId,
      actorId,
      lead.id,
      leadContactInputSchema.parse({
        channel: "phone",
        contactMethod: "Retorno telefônico",
        direction: "outbound",
        notes: "Contato registrado pela equipe",
      }),
    );
    await repository.createLeadTask(clinicId, actorId, lead.id, {
      title: "Retornar contato",
      dueAt: "2039-06-09T18:00:00Z",
    });
    await repository.moveLead(
      clinicId,
      actorId,
      lost.id,
      "lost",
      "Horário incompatível",
    );
    const query = "source=Origem%20filtrada&from=2039-06-01&to=2039-06-30";
    const selected = (
        await app.inject({ url: `/leads?${query}`, headers })
      ).json<Lead[]>(),
      metrics = (
        await app.inject({ url: `/leads/insights?${query}`, headers })
      ).json<LeadInsights>();
    expect(selected).toHaveLength(2);
    expect(metrics).toMatchObject({
      total: 2,
      open: 1,
      lost: 1,
      won: 0,
      openTasks: 1,
      overdueTasks: 1,
      withoutContact: 1,
      lostReasons: [{ name: "Horário incompatível", leads: 1 }],
    });
    expect(metrics.sources).toEqual([
      { name: "Origem filtrada", leads: 2, won: 0, lost: 1, conversionRate: 0 },
    ]);
    expect(
      (
        await app.inject({
          url: `/leads?${query}&tasks=overdue&contact=with`,
          headers,
        })
      )
        .json<Lead[]>()
        .map((item) => item.id),
    ).toEqual([lead.id]);
    expect(
      (await repository.getLeadActivity(clinicId, lead.id))!.contacts[0]!
        .contactMethod,
    ).toBe("Retorno telefônico");
    expect(
      (
        await app.inject({
          url: "/leads?from=2039-07-01&to=2039-06-01",
          headers,
        })
      ).statusCode,
    ).toBe(400);
  });
  it("creates a lead with name and phone only and asks the rest on conversion", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Enxuto",
        phone: "11977776666",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    expect(created.statusCode).toBe(201);
    const invalid = await app.inject({
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
      payload: { cpf: "111.111.111-11" },
    });
    expect(invalid.statusCode).toBe(400);
    // CD1: o cliente novo precisa de WhatsApp e contato de emergência.
    const withoutContact = await app.inject({
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
      payload: { cpf: "52998224725", emergencyContactName: "Joana Mãe" },
    });
    expect(withoutContact.statusCode).toBe(400);
    expect(withoutContact.json()).toEqual({
      code: "LEAD_CONTACT_REQUIRED",
      message:
        "Informe o WhatsApp e o contato de emergência antes de converter o lead.",
    });
    const converted = await app.inject({
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
      payload: {
        cpf: "52998224725",
        whatsapp: "11977776666",
        emergencyContactName: "Joana Mãe",
        emergencyContactPhone: "11988887777",
        address: "Rua das Flores, 10",
        city: "São Paulo",
        state: "SP",
        neighborhood: "",
      },
    });
    expect(converted.statusCode).toBe(200);
    expect(converted.json().patient).toMatchObject({
      fullName: "Lead Enxuto",
      cpf: "52998224725",
      emergencyContactName: "Joana Mãe",
      emergencyContactPhone: "11988887777",
      address: "Rua das Flores, 10",
      city: "São Paulo",
      state: "SP",
    });
    expect(converted.json().lead).toMatchObject({ stage: "won" });
    await app.close();
  });

  it("applies the client registration fields reviewed on conversion without erasing blank ones", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Revisado",
        phone: "11966665555",
        email: "lead@exemplo.com",
        source: "Indicação",
        interest: "Pilates",
        notes: "Prefere manhã",
      },
    });
    expect(created.statusCode).toBe(201);
    const converted = await app.inject({
      method: "POST",
      url: `/leads/${created.json().id}/convert`,
      headers,
      payload: {
        cpf: "52998224725",
        fullName: "Lead Revisado Silva",
        phone: "11966665555",
        email: "",
        whatsapp: "11955554444",
        // Quem não tem contato de emergência repete o próprio nome e telefone.
        emergencyContactName: "Lead Revisado Silva",
        emergencyContactPhone: "11966665555",
        birthDate: "1990-05-10",
        occupation: "Professora",
        gender: "female",
        imageConsent: true,
        notes: "",
      },
    });
    expect(converted.statusCode).toBe(200);
    expect(converted.json().patient).toMatchObject({
      fullName: "Lead Revisado Silva",
      phone: "11966665555",
      email: "lead@exemplo.com",
      whatsapp: "11955554444",
      birthDate: "1990-05-10",
      occupation: "Professora",
      gender: "female",
      imageConsent: true,
      source: "Indicação",
      notes: "Prefere manhã",
    });
    expect(converted.json().lead).toMatchObject({ stage: "won" });
    await app.close();
  });
  it("edits unconverted leads with explicit permission and preserves their activity", async () => {
    const repository = new MemoryClinicRepository(),
      app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const input = leadInputSchema.parse({
        fullName: "Lead editável",
        phone: "11988887777",
        source: "Indicação",
        interest: "Pilates",
        responsibleUserId: actorId,
      }),
      lead = await repository.createLead(clinicId, input);
    const contact = await repository.createLeadContact(
      clinicId,
      actorId,
      lead.id,
      leadContactInputSchema.parse({
        channel: "phone",
        direction: "outbound",
        notes: "Contato anterior",
      }),
    );
    const response = await app.inject({
      method: "PUT",
      url: `/leads/${lead.id}`,
      headers,
      payload: {
        ...input,
        city: "Campinas",
        emergencyContactName: "Contato informado",
        emergencyContactPhone: "11955554444",
        tags: ["Revisado"],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: lead.id,
      stage: "new_contact",
      city: "Campinas",
      tags: ["Revisado"],
    });
    expect(
      (await repository.getLeadActivity(clinicId, lead.id))?.contacts[0]?.id,
    ).toBe(contact!.id);
    const reader = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Cadastro sem edição",
        email: "lead-reader@test.local",
        password: "Password123",
        role: "user",
        permissions: ["crm.view", "crm.create"],
      },
      "unused",
    );
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/leads/${lead.id}`,
          headers: {
            authorization: `Bearer ${app.jwt.sign({ sub: reader.id, clinicId, role: "user" })}`,
          },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    await repository.convertLead(clinicId, actorId, lead.id, {
      cpf: lead.cpf ?? nextTestCpf(),
      ...testPatientContact,
    });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/leads/${lead.id}`,
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("transfers optional registration fields and tags, preserving existing choices and avoiding duplicate customers", async () => {
    const repository = new MemoryClinicRepository(),
      patient = await repository.createPatient(clinicId, {
        cpf: "52998224725",
        fullName: "Cliente existente",
        phone: "11955554444",
        tags: [],
        city: "",
        imageConsent: false,
        interests: ["Mobilidade"],
      });
    const lead = await repository.createLead(
      clinicId,
      leadInputSchema.parse({
        fullName: "Interessado convertido",
        phone: patient.phone,
        source: "Indicação",
        interest: "Pilates",
        city: "Campinas",
        birthDate: "1990-05-20",
        cpf: "52998224725",
        imageConsent: true,
        guardianName: "Responsável informado",
        tags: ["Indicação comercial"],
      }),
    );
    const converted = await repository.convertLead(clinicId, actorId, lead.id, {
      cpf: lead.cpf ?? nextTestCpf(),
    });
    expect(converted).toMatchObject({
      reusedExisting: true,
      lead: { stage: "won" },
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        city: "Campinas",
        birthDate: "1990-05-20",
        cpf: "52998224725",
        imageConsent: false,
        guardianName: "Responsável informado",
      },
    });
    expect(converted!.patient.tags).toContain("Indicação comercial");
    expect(converted!.patient.interests).toEqual(["Mobilidade", "Pilates"]);
    expect(
      (await repository.convertLead(clinicId, actorId, lead.id, {
        cpf: lead.cpf ?? nextTestCpf(),
      }))!.patient.id,
    ).toBe(patient.id);
    expect(
      (await repository.listPatients(clinicId)).filter(
        (item) => item.phone === patient.phone,
      ),
    ).toHaveLength(1);
  });
});
