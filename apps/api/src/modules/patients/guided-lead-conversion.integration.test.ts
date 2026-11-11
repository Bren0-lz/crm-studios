import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

// LC1: converter o lead pelo cadastro completo de cliente (plano, avulso, experimental…).
describe("guided registration converting a lead (LC1)", () => {
  const SERVICE_ID = "77777777-7777-4777-8777-777777777777";
  const clinicId = "11111111-1111-4111-8111-111111111111";
  const actorId = "22222222-2222-4222-8222-222222222222";

  async function setup() {
    const { app, token, repository } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const terms = await configuredPlan(app, {
      services: [
        { serviceId: SERVICE_ID, totalSessions: 8, totalValueInCents: 40000 },
      ],
      name: "Pilates mensal",
      serviceId: SERVICE_ID,
      totalSessions: 8,
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-01-10",
    });
    const createLead = async (phone: string) => {
      const lead = await app.inject({
        method: "POST",
        url: "/leads",
        headers,
        payload: {
          fullName: "Lia Conversão Guiada",
          phone,
          source: "Instagram",
          interest: "Pilates",
        },
      });
      expect(lead.statusCode, lead.body).toBe(201);
      return lead.json() as { id: string; phone: string };
    };
    const guided = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/patients/guided",
        headers,
        payload: {
          ...payload,
          patient: {
            fullName: "Lia Conversão Guiada",
            phone: "11966660001",
            cpf: nextTestCpf(),
            tags: [],
            ...testPatientContact,
            ...(payload.patient as object),
          },
        },
      });
    const read = async <T>(url: string) => {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode, response.body).toBe(200);
      return response.json() as T;
    };
    const leadOf = async (id: string) =>
      (
        await read<
          { id: string; stage: string; convertedPatientId?: string }[]
        >("/leads")
      ).find((item) => item.id === id)!;
    const patientCount = async () =>
      (await read<unknown[]>("/patients")).length;
    return {
      app,
      headers,
      repository,
      terms,
      createLead,
      guided,
      read,
      leadOf,
      patientCount,
    };
  }

  it("creates the client with the plan and converts the lead in the same operation", async () => {
    const { app, headers, terms, createLead, guided, read, leadOf } =
      await setup();
    const lead = await createLead("11966660001");
    const [professionals, rooms, services] = await Promise.all([
      read<{ id: string }[]>("/professionals"),
      read<{ id: string }[]>("/rooms"),
      read<{ id: string }[]>("/services"),
    ]);
    const trial = await app.inject({
      method: "POST",
      url: `/leads/${lead.id}/appointments`,
      headers,
      payload: {
        professionalId: professionals[0]!.id,
        roomId: rooms[0]!.id,
        serviceId: services[0]!.id,
        startsAt: "2031-05-06T13:00:00.000Z",
        visitType: "trial",
      },
    });
    expect(trial.statusCode, trial.body).toBe(201);

    const response = await guided({
      next: "plan",
      leadId: lead.id,
      plan: { ...terms, kind: "recurring" },
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json();
    expect(result.plan).toMatchObject({ patientId: result.patient.id });
    expect(result.lead).toMatchObject({
      id: lead.id,
      stage: "won",
      convertedPatientId: result.patient.id,
    });
    expect(result.patient.tags).toContain("Convertido do CRM");
    expect(result.patient.interests).toContain("Pilates");
    expect(await leadOf(lead.id)).toMatchObject({
      stage: "won",
      convertedPatientId: result.patient.id,
    });
    const agenda = await read<{ id: string; patientId?: string }[]>(
      "/appointments?from=2031-05-06T00:00:00.000Z&to=2031-05-07T00:00:00.000Z",
    );
    expect(agenda.find((item) => item.id === trial.json().id)).toMatchObject({
      patientId: result.patient.id,
    });

    const again = await guided({ next: "none", leadId: lead.id });
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("LEAD_ALREADY_CONVERTED");
    await app.close();
  });

  it("refuses a CPF already registered and creates a new client for the same phone", async () => {
    const { app, createLead, guided, leadOf, patientCount, repository } =
      await setup();
    const cpf = nextTestCpf();
    const existing = await repository.createPatient(clinicId, {
      fullName: "Cliente Já Cadastrada",
      phone: "11966660002",
      cpf,
      tags: [],
      ...testPatientContact,
    });
    const lead = await createLead(existing.phone);
    const before = await patientCount();

    const sameCpf = await guided({
      next: "none",
      leadId: lead.id,
      patient: { cpf, phone: existing.phone },
    });
    expect(sameCpf.statusCode).toBe(409);
    expect(sameCpf.json()).toMatchObject({
      code: "LEAD_PATIENT_EXISTS",
      message: expect.stringContaining("Cliente Já Cadastrada"),
    });
    expect(await leadOf(lead.id)).not.toHaveProperty("convertedPatientId");

    // Só o CPF identifica o cliente: o mesmo telefone com outro CPF é um cadastro novo.
    const samePhone = await guided({
      next: "none",
      leadId: lead.id,
      patient: { phone: existing.phone },
    });
    expect(samePhone.statusCode, samePhone.body).toBe(201);
    expect(samePhone.json().patient.id).not.toBe(existing.id);
    expect(await patientCount()).toBe(before + 1);
    await app.close();
  });

  it("keeps the lead open when a later step fails (all or nothing)", async () => {
    const { app, createLead, guided, read, leadOf, patientCount } =
      await setup();
    const lead = await createLead("11966660003");
    const [rooms, services] = await Promise.all([
      read<{ id: string }[]>("/rooms"),
      read<{ id: string }[]>("/services"),
    ]);
    const before = await patientCount();
    const response = await guided({
      next: "demonstration",
      leadId: lead.id,
      appointment: {
        professionalId: "99999999-9999-4999-8999-999999999999",
        roomId: rooms[0]!.id,
        serviceId: services[0]!.id,
        startsAt: "2031-05-07T13:00:00.000Z",
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(await patientCount()).toBe(before);
    expect(await leadOf(lead.id)).toMatchObject({ stage: "new_contact" });
    expect(await leadOf(lead.id)).not.toHaveProperty("convertedPatientId");
    await app.close();
  });

  it("requires the lead conversion permission", async () => {
    const { app, repository, createLead, guided } = await setup();
    const lead = await createLead("11966660004");
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Só cadastra clientes",
        email: "patients-only@test.local",
        password: "Password123",
        role: "user",
        permissions: ["patients.view", "patients.create"],
      },
      "unused-hash",
    );
    const response = await app.inject({
      method: "POST",
      url: "/patients/guided",
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
      payload: {
        next: "none",
        leadId: lead.id,
        patient: {
          fullName: "Sem Permissão",
          phone: "11966660004",
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        },
      },
    });
    expect(response.statusCode).toBe(403);
    // O cadastro normal (sem lead) continua liberado.
    const plain = await guided({ next: "none" });
    expect(plain.statusCode, plain.body).toBe(201);
    await app.close();
  });
});
