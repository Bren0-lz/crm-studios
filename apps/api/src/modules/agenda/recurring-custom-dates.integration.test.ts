import type { Appointment } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { authenticatedApp } from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

describe("recurring appointments on manually chosen dates", () => {
  it("creates one appointment per chosen date in the same series", async () => {
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
    const at = (days: number, hours = 0) =>
      new Date(
        base.getTime() + (days * 24 + hours) * 60 * 60 * 1000,
      ).toISOString();
    const payload = {
      patientId: patients.json()[0].id,
      professionalId: professionals.json()[0].id,
      roomId: rooms.json()[0].id,
      serviceId: services.json()[0].id,
      startsAt: at(0),
    };
    const series = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...payload,
        occurrences: 3,
        customStartsAt: [at(9, 2), at(3)],
      },
    });
    expect(series.statusCode).toBe(201);
    const created = series.json<Appointment[]>();
    expect(created.map((item) => item.startsAt)).toEqual([
      at(0),
      at(3),
      at(9, 2),
    ]);
    expect(new Set(created.map((item) => item.seriesId)).size).toBe(1);

    const mismatch = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...payload,
        startsAt: at(20),
        occurrences: 4,
        customStartsAt: [at(21)],
      },
    });
    expect(mismatch.statusCode).toBe(400);
    const repeated = await app.inject({
      method: "POST",
      url: "/appointments/recurring",
      headers,
      payload: {
        ...payload,
        startsAt: at(20),
        occurrences: 2,
        customStartsAt: [at(20)],
      },
    });
    expect(repeated.statusCode).toBe(400);
    await app.close();
  });
});
