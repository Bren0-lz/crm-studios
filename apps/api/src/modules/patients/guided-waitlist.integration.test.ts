import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";
import { testPatientContact } from "../../test-support/patient-contact.js";

// TW3: turma cheia no cadastro guiado não vende plano; o cliente vai para a Lista de espera.
describe("guided registration with a full group (TW3)", () => {
  const PROFESSIONAL_ID = "33333333-3333-4333-8333-333333333333";
  const SERVICE_ID = "77777777-7777-4777-8777-777777777777";
  const OTHER_SERVICE_ID = "88888888-8888-4888-8888-888888888888";

  async function setup() {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const rooms = (
      await app.inject({ method: "GET", url: "/rooms", headers })
    ).json() as { id: string; capacity: number }[];
    const roomId = rooms.find((room) => room.capacity >= 4)!.id;
    const terms = await configuredPlan(app, {
      services: [
        { serviceId: SERVICE_ID, totalSessions: 8, totalValueInCents: 40000 },
      ],
      name: "Pilates mensal",
      serviceId: SERVICE_ID,
      totalSessions: 8,
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-01-10",
    });
    let weekday = 0;
    const createGroup = async (serviceId: string, capacity: number) => {
      weekday += 1;
      const group = await app.inject({
        method: "POST",
        url: "/groups",
        headers,
        payload: {
          capacity,
          serviceId,
          professionalId: PROFESSIONAL_ID,
          roomId,
          weeklySlots: [{ weekday, startTime: "20:00", endTime: "21:00" }],
        },
      });
      expect(group.statusCode, group.body).toBe(201);
      return group.json() as { id: string; name: string };
    };
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
    const read = async <T>(url: string) => {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode, response.body).toBe(200);
      return response.json() as T;
    };
    const count = async () => {
      const [plans, finance, waitlist, patients] = await Promise.all([
        read<unknown[]>("/plans"),
        read<{ summary: { receivables: unknown[] } }>("/finance/workspace"),
        read<unknown[]>("/waitlist"),
        read<unknown[]>("/patients"),
      ]);
      return {
        plans: plans.length,
        receivables: finance.summary.receivables.length,
        waitlist: waitlist.length,
        patients: patients.length,
      };
    };
    return { app, terms, createGroup, guided, count };
  }

  it("puts the client only on the service waitlist, without plan or charges", async () => {
    const { app, createGroup, guided, count } = await setup();
    const group = await createGroup(SERVICE_ID, 1);
    const before = await count();
    const response = await guided({
      next: "waitlist",
      patient: { fullName: "Espera Sem Plano", phone: "11977772001" },
      waitlist: [{ serviceId: SERVICE_ID, groupId: group.id }],
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json();
    expect(result.plan).toBeUndefined();
    expect(result.waitlistEntries).toEqual([
      expect.objectContaining({
        patientId: result.patient.id,
        kind: "service",
        serviceId: SERVICE_ID,
        status: "waiting",
        notes: `Turma desejada: ${group.name}`,
      }),
    ]);
    const after = await count();
    expect(after).toEqual({
      ...before,
      patients: before.patients + 1,
      waitlist: before.waitlist + 1,
    });
    await app.close();
  });

  it("sells the plan with a seat and waitlists the full group's service", async () => {
    const { app, terms, createGroup, guided } = await setup();
    const open = await createGroup(SERVICE_ID, 4);
    const full = await createGroup(OTHER_SERVICE_ID, 1);
    const response = await guided({
      next: "plan",
      patient: { fullName: "Espera Misto", phone: "11977772002" },
      plan: { ...terms, kind: "recurring" },
      groupId: open.id,
      waitlist: [{ serviceId: OTHER_SERVICE_ID, groupId: full.id }],
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json();
    expect(result.enrollment).toMatchObject({ status: "active" });
    expect(result.waitlistEntries).toEqual([
      expect.objectContaining({ serviceId: OTHER_SERVICE_ID }),
    ]);
    await app.close();
  });

  it("refuses a plan for a group that filled up and saves nothing", async () => {
    const { app, terms, createGroup, guided, count } = await setup();
    const group = await createGroup(SERVICE_ID, 1);
    const first = await guided({
      next: "plan",
      patient: { fullName: "Espera Ocupa Vaga", phone: "11977772003" },
      plan: { ...terms, kind: "recurring" },
      groupId: group.id,
    });
    expect(first.statusCode, first.body).toBe(201);
    const before = await count();
    const late = await guided({
      next: "plan",
      patient: { fullName: "Espera Atrasada", phone: "11977772004" },
      plan: { ...terms, kind: "recurring" },
      groupId: group.id,
    });
    expect(late.statusCode, late.body).toBe(409);
    expect(late.json()).toMatchObject({ code: "GROUP_FULL" });
    expect(await count()).toEqual(before);
    await app.close();
  });

  it("rejects a desired group from another service", async () => {
    const { app, createGroup, guided, count } = await setup();
    const other = await createGroup(OTHER_SERVICE_ID, 1);
    const before = await count();
    const response = await guided({
      next: "waitlist",
      patient: { fullName: "Espera Turma Errada", phone: "11977772005" },
      waitlist: [{ serviceId: SERVICE_ID, groupId: other.id }],
    });
    expect(response.statusCode).toBe(400);
    expect(await count()).toEqual(before);
    await app.close();
  });
});
