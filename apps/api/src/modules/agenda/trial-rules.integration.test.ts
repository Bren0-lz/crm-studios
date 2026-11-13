import type { Appointment } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import { testPatientContact } from "../../test-support/patient-contact.js";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

/** Regras da aula experimental (EX1–EX2): avulsa, de lead ou de cliente sem plano do serviço. */
describe("aula experimental", () => {
  async function setup() {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [patients, professionals, rooms, services] = await Promise.all([
      app.inject({ method: "GET", url: "/patients", headers }),
      app.inject({ method: "GET", url: "/professionals", headers }),
      app.inject({ method: "GET", url: "/rooms", headers }),
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    base.setUTCHours(13, 0, 0, 0);
    const at = (days: number) =>
      new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const resources = {
      professionalId: professionals.json()[0].id as string,
      roomId: rooms.json()[0].id as string,
      serviceId: services.json()[0].id as string,
    };
    return {
      app,
      headers,
      at,
      resources,
      patientId: patients.json()[0].id as string,
      serviceIds: services
        .json()
        .map((item: { id: string }) => item.id) as string[],
    };
  }

  it("não repete a experimental em série", async () => {
    const { app, headers, at, resources, patientId } = await setup();
    const series = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...resources,
        patientId,
        startsAt: at(0),
        occurrences: 4,
        visitType: "trial",
      },
    });
    expect(series.statusCode).toBe(400);
    await app.close();
  });

  it("agenda só experimental para o lead", async () => {
    const { app, headers, at, resources } = await setup();
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Experimental",
        phone: "11955554444",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    expect(lead.statusCode).toBe(201);
    const url = `/leads/${lead.json<{ id: string }>().id}/appointments`;
    const evaluation = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { ...resources, startsAt: at(1), visitType: "evaluation" },
    });
    expect(evaluation.statusCode).toBe(400);
    const trial = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { ...resources, startsAt: at(1) },
    });
    expect(trial.statusCode).toBe(201);
    expect(trial.json()).toMatchObject({ visitType: "trial" });
    await app.close();
  });

  it("recusa experimental de serviço que o plano do cliente cobre (EX2)", async () => {
    const { app, headers, at, resources, patientId, serviceIds } =
      await setup();
    // Atendimento normal cria (via helper) um plano do cliente para o 1º serviço.
    const regular = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        { ...resources, patientId, startsAt: at(0) },
        headers,
      ),
    });
    expect(regular.statusCode).toBe(201);
    const covered = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: { ...resources, patientId, startsAt: at(1), visitType: "trial" },
    });
    expect(covered.statusCode).toBe(409);
    expect(covered.json()).toMatchObject({ code: "TRIAL_SERVICE_IN_PLAN" });
    // Plano avulso do outro serviço não bloqueia a experimental.
    const otherServiceId = serviceIds.find((id) => id !== resources.serviceId)!;
    const composition = [
      { serviceId: otherServiceId, totalSessions: 1, totalValueInCents: 0 },
    ];
    const template = await app.inject({
      method: "POST",
      url: "/plan-templates",
      headers,
      payload: {
        name: "Avulso da experimental",
        services: composition,
        totalValueInCents: 0,
        kind: "single",
      },
    });
    expect(template.statusCode, template.body).toBe(201);
    const single = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        patientId,
        planTemplateId: template.json().id,
        name: "Avulso da experimental",
        kind: "single",
        services: composition,
        validFrom: "1900-01-01",
        validUntil: "2199-12-31",
        totalValueInCents: 0,
        installments: 1,
        firstDueDate: at(0).slice(0, 10),
        autoRenew: false,
      },
    });
    expect(single.statusCode, single.body).toBe(201);
    const outside = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        ...resources,
        serviceId: otherServiceId,
        patientId,
        startsAt: at(2),
        visitType: "trial",
      },
    });
    expect(outside.statusCode, outside.body).toBe(201);
    // Repetida só avisa: a segunda experimental do mesmo serviço também entra.
    const again = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: {
        ...resources,
        serviceId: otherServiceId,
        patientId,
        startsAt: at(3),
        visitType: "trial",
      },
    });
    expect(again.statusCode, again.body).toBe(201);
    const history = await app.inject({
      method: "GET",
      url: `/appointments/trials?patientId=${patientId}`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json<Appointment[]>().map((item) => item.id)).toEqual([
      again.json().id,
      outside.json().id,
    ]);
    await app.close();
  });

  it("lista as experimentais do lead e passa a listá-las no cliente convertido", async () => {
    const { app, headers, at, resources } = await setup();
    const lead = await app.inject({
      method: "POST",
      url: "/leads",
      headers,
      payload: {
        fullName: "Lead Histórico",
        phone: "11955553333",
        source: "Instagram",
        interest: "Pilates",
      },
    });
    const leadId = lead.json<{ id: string }>().id;
    const trial = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/appointments`,
      headers,
      payload: { ...resources, startsAt: at(1) },
    });
    expect(trial.statusCode).toBe(201);
    const byLead = await app.inject({
      method: "GET",
      url: `/appointments/trials?leadId=${leadId}`,
      headers,
    });
    expect(byLead.json<Appointment[]>().map((item) => item.id)).toEqual([
      trial.json().id,
    ]);
    const invalid = await app.inject({
      method: "GET",
      url: `/appointments/trials?leadId=${leadId}&patientId=${leadId}`,
      headers,
    });
    expect(invalid.statusCode).toBe(400);
    const converted = await app.inject({
      method: "POST",
      url: `/leads/${leadId}/convert`,
      headers,
      payload: { cpf: nextTestCpf(), ...testPatientContact },
    });
    expect(converted.statusCode, converted.body).toBe(200);
    const patientId = converted.json<{ patient: { id: string } }>().patient.id;
    const byPatient = await app.inject({
      method: "GET",
      url: `/appointments/trials?patientId=${patientId}`,
      headers,
    });
    expect(byPatient.json<Appointment[]>().map((item) => item.id)).toEqual([
      trial.json().id,
    ]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/appointments/trials?leadId=${leadId}`,
          headers,
        })
      ).json(),
    ).toEqual([]);
    await app.close();
  });
});
