import type { PermissionKey } from "@crm/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const date = "2099-11-12";
const range = `from=${date}T00:00:00Z&to=2099-11-13T00:00:00Z`;

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const [first, second] = await repository.listProfessionals(clinicId);
  const rooms = await repository.listRooms(clinicId);
  for (const [index, professional] of [first!, second!].entries())
    await repository.createAppointment(clinicId, {
      patientId: "99999999-9999-4999-8999-999999999999",
      professionalId: professional.id,
      roomId: rooms[index]!.id,
      serviceId: "77777777-7777-4777-8777-777777777777",
      startsAt: `${date}T1${index + 2}:00:00Z`,
      visitType: "regular",
    });
  await repository.createScheduleBlock(clinicId, {
    professionalId: second!.id,
    startsAt: `${date}T18:00:00Z`,
    endsAt: `${date}T19:00:00Z`,
    reason: "Curso externo",
  });
  await repository.createScheduleBlock(clinicId, {
    roomId: rooms[0]!.id,
    startsAt: `${date}T20:00:00Z`,
    endsAt: `${date}T21:00:00Z`,
    reason: "Manutenção da sala",
  });
  let sequence = 0;
  async function signIn(
    permissions: PermissionKey[] | "admin",
    professionalId?: string,
  ) {
    if (permissions === "admin")
      return {
        authorization: `Bearer ${app.jwt.sign({ sub: actor, clinicId, role: "admin" })}`,
      };
    const user = await repository.createAdminUser(
      clinicId,
      actor,
      {
        fullName: "Usuária da agenda",
        email: `agenda-${++sequence}@example.com`,
        password: "Password123",
        role: "user",
        permissions,
      },
      "unused-hash",
    );
    if (professionalId)
      await repository.setAdminUserProfessional(
        clinicId,
        actor,
        user.id,
        professionalId,
      );
    return {
      authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
    };
  }
  const get = async (url: string, headers: Record<string, string>) => {
    const response = await app.inject({ method: "GET", url, headers });
    return { status: response.statusCode, body: response.json() };
  };
  return { first: first!, second: second!, signIn, get };
}

describe("visualização da agenda por profissional", () => {
  it("quem vê todos escolhe os profissionais do painel; contadores acompanham", async () => {
    const { first, second, signIn, get } = await setup();
    for (const headers of [
      await signIn("admin"),
      await signIn(["agenda.view", "agenda.view_all"], first.id),
    ]) {
      const all = await get(`/dashboard?date=${date}`, headers);
      expect(all.body).toMatchObject({
        appointmentsToday: 2,
        pendingToday: 2,
      });
      const one = await get(
        `/dashboard?date=${date}&professionalIds=${second.id}`,
        headers,
      );
      expect(one.body).toMatchObject({
        appointmentsToday: 1,
        pendingToday: 1,
        awaitingConfirmationToday: 1,
      });
      expect(
        one.body.nextAppointments.map(
          (item: { professionalId: string }) => item.professionalId,
        ),
      ).toEqual([second.id]);
      const both = await get(
        `/dashboard?date=${date}&professionalIds=${first.id},${second.id}`,
        headers,
      );
      expect(both.body.appointmentsToday).toBe(2);
      expect((await get(`/appointments?${range}`, headers)).body).toHaveLength(
        2,
      );
    }
    const invalid = await get(
      `/dashboard?date=${date}&professionalIds=abc`,
      await signIn("admin"),
    );
    expect(invalid.status).toBe(400);
  });

  it("sem 'ver todos' a agenda e o painel mostram só o profissional ligado", async () => {
    const { first, second, signIn, get } = await setup();
    const headers = await signIn(["agenda.view"], first.id);
    // A escolha enviada é ignorada: continua só a própria agenda.
    const dashboard = await get(
      `/dashboard?date=${date}&professionalIds=${second.id}`,
      headers,
    );
    expect(dashboard.body).toMatchObject({
      appointmentsToday: 1,
      pendingToday: 1,
    });
    expect(dashboard.body.nextAppointments[0].professionalId).toBe(first.id);
    const appointments = await get(`/appointments?${range}`, headers);
    expect(
      appointments.body.map(
        (item: { professionalId: string }) => item.professionalId,
      ),
    ).toEqual([first.id]);
    // Bloqueio só de sala continua visível; o de outro profissional, não.
    const blocks = await get(`/schedule-blocks?${range}`, headers);
    expect(blocks.body.map((item: { reason: string }) => item.reason)).toEqual([
      "Manutenção da sala",
    ]);
    const sessions = await get(`/group-sessions?${range}`, headers);
    expect(
      sessions.body.every(
        (item: { professionalId: string }) => item.professionalId === first.id,
      ),
    ).toBe(true);
  });

  it("sem 'ver todos' e sem profissional ligado não vê atendimentos", async () => {
    const { signIn, get } = await setup();
    const headers = await signIn(["agenda.view"]);
    expect((await get(`/appointments?${range}`, headers)).body).toEqual([]);
    expect((await get(`/dashboard?date=${date}`, headers)).body).toMatchObject({
      appointmentsToday: 0,
      nextAppointments: [],
    });
  });
});
