import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

// RC8: o cadastro guiado vende o avulso com o contrato emitido e a sessão reservada.
describe("guided registration with contract and sessions (RC8)", () => {
  const PROFESSIONAL_ID = "33333333-3333-4333-8333-333333333333";
  const SERVICE_ID = "77777777-7777-4777-8777-777777777777";

  async function setup() {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const rooms = (
      await app.inject({ method: "GET", url: "/rooms", headers })
    ).json() as { id: string }[];
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
    const template = await app.inject({
      method: "POST",
      url: "/document-templates",
      headers,
      payload: {
        name: "Contrato do avulso",
        kind: "consent",
        body: "Eu, {{paciente_nome}}, contrato a sessão avulsa do estúdio.",
      },
    });
    expect(template.statusCode, template.body).toBe(201);
    const guided = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/patients/guided",
        headers,
        payload: {
          ...payload,
          patient: {
            cpf: nextTestCpf(),
            ...testPatientContact,
            ...(payload.patient as object),
          },
        },
      });
    const appointment = {
      professionalId: PROFESSIONAL_ID,
      roomId: rooms[0]!.id,
      serviceId: SERVICE_ID,
      startsAt: "2098-03-17T13:00:00.000Z",
    };
    return {
      app,
      terms,
      guided,
      appointment,
      template: template.json() as { id: string; name: string },
    };
  }

  it("returns the issued document and the booked session of the single", async () => {
    const { app, terms, guided, appointment, template } = await setup();
    const response = await guided({
      next: "single",
      patient: { fullName: "Lia Avulsa", phone: "11977773001" },
      plan: terms,
      document: { templateId: template.id, title: template.name },
      appointments: [appointment],
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json();
    expect(result.document).toMatchObject({
      status: "issued",
      planId: result.plan.id,
      patientId: result.patient.id,
    });
    expect(result.appointments).toEqual([
      expect.objectContaining({
        planId: result.plan.id,
        startsAt: appointment.startsAt,
      }),
    ]);
    await app.close();
  });

  it("refuses a session outside the plan's services and saves nothing", async () => {
    const { app, terms, guided, appointment } = await setup();
    const response = await guided({
      next: "single",
      patient: { fullName: "Serviço Errado", phone: "11977773002" },
      plan: terms,
      appointments: [
        { ...appointment, serviceId: "88888888-8888-4888-8888-888888888888" },
      ],
    });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ code: "PLAN_SCHEDULE_MISMATCH" });
    await app.close();
  });
});
