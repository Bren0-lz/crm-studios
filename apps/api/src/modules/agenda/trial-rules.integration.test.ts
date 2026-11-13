import { describe, expect, it } from "vitest";
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
});
