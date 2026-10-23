import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  roleSub,
  seedRoleUsers,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("Alertas clínicos", () => {
  it("fixa alertas no prontuário do mais grave ao mais leve e arquiva", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const patient = patients.json()[0];

    const invalid = await app.inject({
      method: "POST",
      url: "/clinical-alerts",
      headers,
      payload: { patientId: patient.id, severity: "warning", text: "ok" },
    });
    expect(invalid.statusCode).toBe(400);

    const info = await app.inject({
      method: "POST",
      url: "/clinical-alerts",
      headers,
      payload: {
        patientId: patient.id,
        severity: "info",
        text: "Prefere atendimento pela manhã.",
      },
    });
    expect(info.statusCode).toBe(201);
    const critical = await app.inject({
      method: "POST",
      url: "/clinical-alerts",
      headers,
      payload: {
        patientId: patient.id,
        severity: "critical",
        text: "Alergia a esparadrapo.",
      },
    });
    expect(critical.statusCode).toBe(201);
    expect(critical.json()).toMatchObject({
      severity: "critical",
      authorName: expect.any(String),
    });

    let workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(
      workspace.json().alerts.map((alert: { text: string }) => alert.text),
    ).toEqual(["Alergia a esparadrapo.", "Prefere atendimento pela manhã."]);

    const archived = await app.inject({
      method: "DELETE",
      url: `/clinical-alerts/${critical.json().id}`,
      headers,
    });
    expect(archived.statusCode).toBe(204);
    const again = await app.inject({
      method: "DELETE",
      url: `/clinical-alerts/${critical.json().id}`,
      headers,
    });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toMatchObject({ code: "CLINICAL_ALERT_NOT_FOUND" });

    workspace = await app.inject({
      method: "GET",
      url: `/clinical-workspace/${patient.id}`,
      headers,
    });
    expect(workspace.json().alerts).toHaveLength(1);
    await app.close();
  });

  it("recusa alerta de cliente de outra clínica e de quem não edita prontuário", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const missing = await app.inject({
      method: "POST",
      url: "/clinical-alerts",
      headers,
      payload: {
        patientId: "12345678-1234-4123-8123-123456789abc",
        severity: "warning",
        text: "Cliente inexistente.",
      },
    });
    expect(missing.statusCode).toBe(404);

    await seedRoleUsers(app);
    const reception = app.jwt.sign({
      sub: roleSub(app, "reception"),
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "user",
    });
    const patients = await app.inject({
      method: "GET",
      url: "/patients",
      headers,
    });
    const denied = await app.inject({
      method: "POST",
      url: "/clinical-alerts",
      headers: { authorization: `Bearer ${reception}` },
      payload: {
        patientId: patients.json()[0].id,
        severity: "warning",
        text: "Sem permissão.",
      },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
