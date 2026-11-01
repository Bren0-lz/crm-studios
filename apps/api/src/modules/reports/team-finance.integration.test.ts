import { nextTestCpf } from "../../test-support/cpf.js";
import type { ManagementReport } from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2039-01-01T12:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const [professional] = await repository.listProfessionals(clinicId),
    room = (await repository.listRooms(clinicId)).find(
      (item) => item.capacity >= 2,
    ),
    [service] = await repository.listServices(clinicId);
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Cliente turma métricas",
    phone: "11988887777",
    tags: [],
  });
  const group = await repository.createGroupClass(clinicId, {
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 2,
    weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  });
  await repository.createGroupEnrollment(clinicId, {
    groupId: group.id,
    patientId: patient.id,
  });
  const terms = {
    name: "Pacote turma",
    totalValueInCents: 20000,
    services: [
      { serviceId: service!.id, totalSessions: 2, totalValueInCents: 20000 },
    ],
    kind: "custom" as const,
  };
  const template = await repository.createPlanTemplate(clinicId, actorId, {
    ...terms,
    planType: null,
  });
  await repository.createPatientPlan(clinicId, actorId, {
    ...terms,
    patientId: patient.id,
    planTemplateId: template.id,
    installments: 1,
    firstDueDate: "2039-01-01",
    validFrom: "2039-01-01",
    validUntil: "2039-12-31",
    autoRenew: false,
  });
  await repository.createCommissionRule(clinicId, {
    professionalId: professional!.id,
    percentage: 10,
    effectiveFrom: "2039-01-01",
  });
  const workspace = await repository.getGroupWorkspace(
    clinicId,
    "2039-01-01T00:00:00Z",
    "2039-01-31T00:00:00Z",
  );
  const meeting = workspace.sessions.find((item) => item.groupId === group.id)!;
  await repository.recordGroupAttendance(
    clinicId,
    actorId,
    meeting.id,
    patient.id,
    { status: "present" },
  );
  return {
    app,
    repository,
    professional: professional!,
    service: service!,
    group,
  };
}

const url = "/reports/management?from=2039-01-01&to=2039-01-31";

describe("team finance report", () => {
  it("values sessions by the client's plan, forecasts commissions and projects full groups", async () => {
    const { app, repository, professional, service, group } = await setup();
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
    };
    // Base da comissão: a sessão do plano consumido na presença (20000 ÷ 2).
    const expectedCommission = Math.round(10000 * 0.1);
    let report = (await app.inject({ url, headers })).json<ManagementReport>();
    expect(report.teamFinance?.commissionMonths).toEqual(["2039-01"]);
    expect(
      report.teamFinance?.byProfessional.find(
        (item) => item.id === professional.id,
      ),
    ).toMatchObject({
      completedSessions: 1,
      generatedInCents: 10000,
      commission: {
        paidInCents: 0,
        openInCents: 0,
        pendingInCents: expectedCommission,
        totalInCents: expectedCommission,
      },
    });
    expect(
      report.teamFinance?.byService.find((item) => item.id === service.id),
    ).toMatchObject({
      completedSessions: 1,
      generatedInCents: 10000,
      averageTicketInCents: 10000,
    });
    expect(
      report.teamFinance?.byGroup.find((item) => item.id === group.id),
    ).toMatchObject({
      capacity: 2,
      activeEnrollments: 1,
      occupancyRate: 50,
      monthlySessions: 4,
      monthlyRevenueInCents: 40000,
      potentialRevenueInCents: 80000,
      idleRevenueInCents: 40000,
    });

    await repository.generateCommissions(clinicId, "2039-01");
    report = (await app.inject({ url, headers })).json<ManagementReport>();
    expect(
      report.teamFinance?.byProfessional.find(
        (item) => item.id === professional.id,
      )?.commission,
    ).toEqual({
      paidInCents: 0,
      openInCents: expectedCommission,
      pendingInCents: 0,
      totalInCents: expectedCommission,
    });
  });

  it("omits the values without the team finance permission", async () => {
    const { app, repository } = await setup();
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Gerencial sem valores",
        email: "management-only@test.local",
        password: "Password123",
        role: "user",
        permissions: ["reports.view", "reports.management"],
      },
      "unused",
    );
    const response = await app.inject({
      url,
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: user.id, clinicId, role: "user" })}`,
      },
    });
    expect(response.statusCode).toBe(200);
    const report = response.json<ManagementReport>();
    expect(report.byProfessional.length).toBeGreaterThan(0);
    expect(report).not.toHaveProperty("teamFinance");
  });
});
