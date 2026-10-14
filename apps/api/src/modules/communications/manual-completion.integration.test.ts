import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe("manual message completion", () => {
  it("records the operator, refuses duplicate completion and respects a changed preference", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const [patient] = await repository.listPatients(clinicId);
    const message = await repository.queueManualMessage(clinicId, {
      patientId: patient!.id,
      channel: "whatsapp",
      body: "Lembrete",
    });
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    const result = await app.inject({
      method: "POST",
      url: `/communications/messages/${message.id}/complete`,
      headers,
      payload: { status: "sent" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      status: "sent",
      manualCompletion: { actorId, status: "sent" },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/communications/messages/${message.id}/complete`,
          headers,
          payload: { status: "sent" },
        })
      ).statusCode,
    ).toBe(409);
    const pending = await repository.queueManualMessage(clinicId, {
      patientId: patient!.id,
      channel: "whatsapp",
      body: "Outro lembrete",
    });
    await repository.setCommunicationPreference(clinicId, {
      patientId: patient!.id,
      channel: "whatsapp",
      allowed: false,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/communications/messages/${pending.id}/complete`,
          headers,
          payload: { status: "sent" },
        })
      ).statusCode,
    ).not.toBe(200);
    expect(
      (await repository.getCommunicationCenter(clinicId)).messages.find(
        (item) => item.id === pending.id,
      )?.status,
    ).toBe("queued");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/communications/messages/${pending.id}/complete`,
          headers,
          payload: { status: "cancelled" },
        })
      ).statusCode,
    ).toBe(200);
  });
});
