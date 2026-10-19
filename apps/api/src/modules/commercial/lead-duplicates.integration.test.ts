import { afterEach, describe, expect, it } from "vitest";
import { leadInputSchema, patientInputSchema } from "@crm/contracts";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import {
  roleSub,
  seedRoleUsers,
  type TestApp,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  otherClinicId = "99999999-9999-4999-8999-999999999999",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: TestApp[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const patient = await repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      fullName: "Cliente Duplicidade QM10",
      phone: "(31) 97777-1234",
      email: "Duplicidade.QM10@Email.com",
      cpf: "529.982.247-25",
    }),
  );
  const lead = await repository.createLead(
    clinicId,
    leadInputSchema.parse({
      fullName: "Lead Duplicidade QM10",
      phone: "31966665555",
      email: "lead.qm10@email.com",
      source: "Instagram",
      interest: "Pilates",
    }),
  );
  return { app, repository, headers, patient, lead };
}

describe("lead duplicates", () => {
  it("finds a client by normalized phone, e-mail and CPF, exposing only id and name", async () => {
    const { app, headers, patient } = await setup();
    const response = await app.inject({
      method: "GET",
      url: `/leads/duplicates?phone=${encodeURIComponent("+55 31 97777-1234")}&email=${encodeURIComponent(" duplicidade.qm10@EMAIL.com ")}&cpf=52998224725`,
      headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      matches: [
        {
          kind: "patient",
          id: patient.id,
          fullName: "Cliente Duplicidade QM10",
          fields: ["phone", "email", "cpf"],
        },
      ],
    });
  });

  it("finds another open lead but not the lead being edited", async () => {
    const { app, headers, lead } = await setup();
    const query = "phone=31966665555&email=LEAD.qm10@email.com";
    const found = await app.inject({
      method: "GET",
      url: `/leads/duplicates?${query}`,
      headers,
    });
    expect(found.json().matches).toEqual([
      {
        kind: "lead",
        id: lead.id,
        fullName: "Lead Duplicidade QM10",
        fields: ["phone", "email"],
      },
    ]);
    const editing = await app.inject({
      method: "GET",
      url: `/leads/duplicates?${query}&excludeLeadId=${lead.id}`,
      headers,
    });
    expect(editing.json()).toEqual({ matches: [] });
  });

  it("ignores other clinics and empty fields", async () => {
    const { app, repository, headers } = await setup();
    await repository.createPatient(
      otherClinicId,
      patientInputSchema.parse({
        fullName: "Outra Clínica",
        phone: "31955554444",
      }),
    );
    const outside = await app.inject({
      method: "GET",
      url: "/leads/duplicates?phone=31955554444",
      headers,
    });
    expect(outside.json()).toEqual({ matches: [] });
    const empty = await app.inject({
      method: "GET",
      url: "/leads/duplicates?phone=&email=&cpf=",
      headers,
    });
    expect(empty.json()).toEqual({ matches: [] });
  });

  it("is available to whoever registers leads and blocked for others", async () => {
    const { app } = await setup();
    await seedRoleUsers(app);
    const as = (role: "reception" | "physiotherapist") => ({
      authorization: `Bearer ${app.jwt.sign({ sub: roleSub(app, role), clinicId, role: "user" })}`,
    });
    const url = "/leads/duplicates?phone=31977771234";
    const reception = await app.inject({
      method: "GET",
      url,
      headers: as("reception"),
    });
    expect(reception.statusCode, reception.body).toBe(200);
    expect(reception.json().matches).toHaveLength(1);
    const physio = await app.inject({
      method: "GET",
      url,
      headers: as("physiotherapist"),
    });
    expect(physio.statusCode).toBe(403);
  });
});
