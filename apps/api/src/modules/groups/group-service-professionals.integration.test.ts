import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(false);
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const [first, second] = await repository.listProfessionals(clinicId);
  const [room] = await repository.listRooms(clinicId);
  const service = await repository.createService(clinicId, {
    name: "Pilates restrito",
    durationMinutes: 60,
    priceInCents: 0,
    color: "#336699",
    professionalIds: [first!.id],
  });
  const open = await repository.createService(clinicId, {
    name: "Pilates livre",
    durationMinutes: 60,
    priceInCents: 0,
    color: "#336699",
  });
  const input = {
    serviceId: service.id,
    professionalId: first!.id,
    roomId: room!.id,
    capacity: 1,
    weeklySlots: [{ weekday: 2, startTime: "06:00", endTime: "07:00" }],
  };
  return { app, headers, input, other: second!.id, openServiceId: open.id };
}

describe("group professional must serve the service", () => {
  it("refuses a professional not linked to the service", async () => {
    const { app, headers, input, other } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: { ...input, professionalId: other },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SERVICE_NOT_AVAILABLE");
  });

  it("accepts a linked professional and anyone when the service has no links", async () => {
    const { app, headers, input, other, openServiceId } = await setup();
    const linked = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: input,
    });
    expect(linked.statusCode).toBe(201);
    const unrestricted = await app.inject({
      method: "POST",
      url: "/groups",
      headers,
      payload: {
        ...input,
        serviceId: openServiceId,
        professionalId: other,
        weeklySlots: [{ weekday: 3, startTime: "06:00", endTime: "07:00" }],
      },
    });
    expect(unrestricted.statusCode).toBe(201);
  });
});
