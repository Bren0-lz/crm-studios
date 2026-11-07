import { withAppointmentPlan } from "../../test-support/appointment-plan.js";
import type { AgendaConflict } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

async function setup() {
  const { app, token } = await authenticatedApp();
  const headers = { authorization: `Bearer ${token}` };
  const [patients, professionals, rooms, services] = await Promise.all(
    ["/patients", "/professionals", "/rooms", "/services"].map((url) =>
      app.inject({ method: "GET", url, headers }),
    ),
  );
  return {
    app,
    headers,
    patientId: patients!.json()[0].id as string,
    professionalId: professionals!.json()[0].id as string,
    roomId: rooms!.json()[0].id as string,
    serviceId: services!.json()[0].id as string,
  };
}

const at = (local: string) => new Date(`${local}:00-03:00`).toISOString();

describe("agenda conflict check before saving", () => {
  it("flags appointments, blocks, holidays and clashes inside the batch without writing", async () => {
    const { app, headers, patientId, professionalId, roomId, serviceId } =
      await setup();
    const booked = await app.inject({
      method: "POST",
      url: "/appointments",
      headers,
      payload: await withAppointmentPlan(
        app,
        {
          patientId,
          professionalId,
          roomId,
          serviceId,
          startsAt: at("2039-03-01T14:00"),
        },
        headers,
      ),
    });
    expect(booked.statusCode, booked.body).toBe(201);
    const block = await app.inject({
      method: "POST",
      url: "/schedule-blocks",
      headers,
      payload: {
        professionalId,
        startsAt: at("2039-03-08T13:00"),
        endsAt: at("2039-03-08T18:00"),
        reason: "Curso",
      },
    });
    expect(block.statusCode, block.body).toBe(201);
    const holiday = await app.inject({
      method: "POST",
      url: "/holidays",
      headers,
      payload: { date: "2039-03-15", name: "Feriado municipal" },
    });
    expect(holiday.statusCode, holiday.body).toBe(201);
    const item = (key: string, local: string) => ({
      key,
      professionalId,
      roomId,
      serviceId,
      startsAt: at(local),
    });
    const before = await app.inject({
      method: "GET",
      url: `/appointments?from=${at("2039-02-01T00:00")}&to=${at("2039-05-01T00:00")}`,
      headers,
    });
    const response = await app.inject({
      method: "POST",
      url: "/appointments/conflicts",
      headers,
      payload: {
        items: [
          item("1", "2039-03-01T14:00"),
          item("2", "2039-03-08T14:00"),
          item("3", "2039-03-15T14:00"),
          item("4", "2039-03-22T14:00"),
          item("5", "2039-03-29T14:00"),
          item("6", "2039-03-29T14:00"),
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const conflicts = response.json<AgendaConflict[]>();
    expect(conflicts.map(({ key, kind }) => ({ key, kind }))).toEqual([
      { key: "1", kind: "appointment" },
      { key: "2", kind: "block" },
      { key: "3", kind: "holiday" },
      { key: "5", kind: "batch" },
      { key: "6", kind: "batch" },
    ]);
    expect(conflicts[2]!.label).toBe("Feriado: Feriado municipal");
    const after = await app.inject({
      method: "GET",
      url: `/appointments?from=${at("2039-02-01T00:00")}&to=${at("2039-05-01T00:00")}`,
      headers,
    });
    expect(after.json()).toHaveLength(before.json().length);
    await app.close();
  });

  it("refuses a purchase that books more times than the sessions bought", async () => {
    const { app, headers, patientId, professionalId, roomId, serviceId } =
      await setup();
    const plan = await configuredPlan(app, {
      patientId,
      serviceId,
      name: "Massoterapia 4 sessões",
      kind: "fixed_package" as const,
      totalSessions: 4,
      validFrom: "2039-03-01",
      totalValueInCents: 40_000,
      installments: 1,
      firstDueDate: "2039-03-01",
    });
    const appointments = (count: number, hour: string) =>
      Array.from({ length: count }, (_, index) => ({
        professionalId,
        roomId,
        serviceId,
        startsAt: at(
          `2039-${String(3 + Math.floor(index / 4)).padStart(2, "0")}-${String(1 + (index % 4) * 7).padStart(2, "0")}T${hour}`,
        ),
        visitType: "regular",
        notes: "",
      }));
    const tooMany = await app.inject({
      method: "POST",
      url: "/plans/purchases",
      headers,
      payload: {
        idempotencyKey: "0b7c2f9e-3d1a-4e5b-9c8d-7f6e5d4c3b2a",
        plan,
        appointments: appointments(10, "10:00"),
      },
    });
    expect(tooMany.statusCode, tooMany.body).toBe(409);
    expect(tooMany.json()).toMatchObject({
      code: "PLAN_SCHEDULE_SESSIONS_MISMATCH",
    });
    const exact = await app.inject({
      method: "POST",
      url: "/plans/purchases",
      headers,
      payload: {
        idempotencyKey: "1c8d3f0a-4e2b-4f6c-8d9e-8a7f6e5d4c3b",
        plan,
        appointments: appointments(4, "10:00"),
      },
    });
    expect(exact.statusCode, exact.body).toBe(201);
    expect(exact.json().appointments).toHaveLength(4);
    await app.close();
  });
});
