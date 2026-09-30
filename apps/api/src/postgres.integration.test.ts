import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations, seedDemoData } from "./database.js";
import { databaseConnectionConfig } from "./database-connection.js";
import { PostgresClinicRepository } from "./postgres-repository.js";
import { DomainError } from "./repository.js";
import { defaultRelationshipSettings, saoPauloToday } from "@crm/contracts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const clinicId = "11111111-1111-4111-8111-111111111111";
const testCpf = "98765432100";
const duplicateCpf = "98765432101";
const relationshipCpf = "98765432102";
const birthdayCpf = "98765432103";
const satisfactionCpf = "98765432104";
const timelineCpf = "98765432105";
const appointmentMarker = "postgres-integration-test";
const rescheduleMarker = "postgres-reschedule-test";
const salesMarker = "postgres-sales-test";
const renewalMarker = "postgres-renewal-test";
const satisfactionMarker = "postgres-satisfaction-test";
const timelineMarker = "postgres-timeline-test";
const leadAppointmentMarker = "postgres-lead-appointment-test";
const leadAppointmentPhone = "11900001133";
// Mês bem à frente, só com os atendimentos deste teste (comissões e lembretes).
const leadAppointmentDay = new Date(Date.now() + 600 * 24 * 60 * 60 * 1000);
leadAppointmentDay.setUTCHours(12, 0, 0, 0);
const ownerId = "22222222-2222-4222-8222-222222222222";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;
  let repository: PostgresClinicRepository;

  async function cleanupLeadAppointments() {
    const effectiveFrom = leadAppointmentDay.toISOString().slice(0, 10);
    await pool.query(
      `DELETE FROM commission_entries WHERE appointment_id IN
         (SELECT id FROM appointments WHERE notes = $1)
       OR rule_id IN (SELECT id FROM commission_rules WHERE clinic_id = $2 AND effective_from = $3::date)`,
      [leadAppointmentMarker, clinicId, effectiveFrom],
    );
    await pool.query(
      "DELETE FROM commission_rules WHERE clinic_id = $1 AND effective_from = $2::date",
      [clinicId, effectiveFrom],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      leadAppointmentMarker,
    ]);
    await pool.query(
      `DELETE FROM appointments WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = $2)`,
      [clinicId, leadAppointmentPhone],
    );
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = $2)`,
      [clinicId, leadAppointmentPhone],
    );
    await pool.query("DELETE FROM leads WHERE clinic_id = $1 AND phone = $2", [
      clinicId,
      leadAppointmentPhone,
    ]);
  }

  beforeAll(async () => {
    pool = new Pool(
      databaseConnectionConfig({
        url: databaseUrl!,
        ssl: (process.env.DATABASE_SSL as "auto" | "disable" | "require" | "verify" | undefined) ?? "auto",
        ...(process.env.DATABASE_SSL_CA ? { caCertPath: process.env.DATABASE_SSL_CA } : {}),
      }),
    );
    await runMigrations(pool);
    await seedDemoData(pool);
    repository = new PostgresClinicRepository(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await cleanupLeadAppointments();
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
       (SELECT r.id FROM receivables r JOIN patient_plans pp ON pp.id=r.plan_id WHERE pp.name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query(
      `DELETE FROM receivables WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker, timelineMarker]],
    );
    await pool.query("DELETE FROM patient_plans WHERE name = ANY($1::text[])", [
      [salesMarker, renewalMarker, timelineMarker],
    ]);
    await pool.query("TRUNCATE appointment_reschedules");
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [satisfactionCpf, timelineCpf]],
    );
    await pool.query(
      `DELETE FROM outbound_messages WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, timelineCpf],
    );
    await pool.query("DELETE FROM appointments WHERE notes = ANY($1::text[])", [
      [appointmentMarker, rescheduleMarker, satisfactionMarker, timelineMarker],
    ]);
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [relationshipCpf, birthdayCpf, timelineCpf]],
    );
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[])", [
      clinicId,
      [testCpf, duplicateCpf, relationshipCpf, birthdayCpf, satisfactionCpf, timelineCpf],
    ]);
    await pool.query("DELETE FROM relationship_settings WHERE clinic_id = $1", [
      clinicId,
    ]);
    await pool.end();
  });

  it("persists a patient across repository instances", async () => {
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      testCpf,
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente de Integração",
      phone: "11999998888",
      cpf: testCpf,
      tags: ["Teste"],
    });

    const anotherInstance = new PostgresClinicRepository(pool);
    const persisted = await anotherInstance.listPatients(
      clinicId,
      patient.recordNumber,
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe(patient.id);
    const updated = await repository.updatePatient(clinicId, patient.id, {
      fullName: "Cliente Corrigido",
      phone: "11999997777",
      cpf: testCpf,
      tags: ["Retorno"],
    });
    expect(updated).toMatchObject({
      id: patient.id,
      recordNumber: patient.recordNumber,
      fullName: "Cliente Corrigido",
    });
    expect((await anotherInstance.listPatients(clinicId, patient.recordNumber))[0]?.fullName).toBe("Cliente Corrigido");
    const other = await repository.createPatient(clinicId, {
      fullName: "Cliente Sem CPF",
      phone: "11911112222",
      cpf: duplicateCpf,
      tags: [],
    });
    await expect(
      repository.updatePatient(clinicId, other.id, {
        fullName: other.fullName,
        phone: other.phone,
        cpf: testCpf,
        tags: [],
      }),
    ).rejects.toMatchObject({ code: "PATIENT_DUPLICATE" });
  });

  it("lets PostgreSQL reject concurrent schedule conflicts", async () => {
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      appointmentMarker,
    ]);
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 30);
    startsAt.setUTCHours(15, 0, 0, 0);
    const input = {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: appointmentMarker,
      visitType: "regular" as const,
    };

    const results = await Promise.allSettled([
      repository.createAppointment(clinicId, input),
      repository.createAppointment(clinicId, input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining<Partial<DomainError>>({
        code: "APPOINTMENT_CONFLICT",
      }),
    });
  });

  it("persists one reschedule and rolls back an occupied time", async () => {
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const base = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    base.setUTCHours(18, 0, 0, 0);
    const at = (hours: number) =>
      new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
    const input = {
      patientId: patients.find((item) => item.recordNumber === "PAC-00001")!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      notes: rescheduleMarker,
    };
    const first = await repository.createAppointment(clinicId, {
      ...input,
      startsAt: at(0),
      visitType: "evaluation",
    });
    expect(first.visitType).toBe("evaluation");
    await repository.createAppointment(clinicId, {
      ...input,
      startsAt: at(2),
      visitType: "regular",
    });
    const move = {
      professionalId: input.professionalId,
      roomId: input.roomId,
      startsAt: at(1),
    };
    const moved = await repository.rescheduleAppointment(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      first.id,
      move,
    );
    expect(moved?.startsAt).toBe(at(1));
    expect(moved?.visitType).toBe("evaluation");
    const anotherInstance = new PostgresClinicRepository(pool);
    expect(await anotherInstance.listAppointmentReschedules(clinicId, first.id)).toMatchObject([
      { previousStartsAt: at(0), startsAt: at(1), actorName: "Mariana Costa" },
    ]);
    await expect(
      repository.rescheduleAppointment(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        first.id,
        { ...move, startsAt: at(2) },
      ),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    expect((await anotherInstance.listAppointments(clinicId, at(0), at(3))).find((item) => item.id === first.id)).toMatchObject({
      startsAt: at(1),
      visitType: "evaluation",
    });
    expect(await anotherInstance.listAppointmentReschedules(clinicId, first.id)).toHaveLength(1);
    await repository.updateAppointmentStatus(clinicId, first.id, "cancelled");
    await expect(
      repository.rescheduleAppointment(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        first.id,
        move,
      ),
    ).rejects.toMatchObject({ code: "APPOINTMENT_RESCHEDULE_FORBIDDEN" });
  });

  it("keeps the visit type in a recurring series and counts it in the report", async () => {
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const startsAt = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(23, 0, 0, 0);
    const series = await repository.createRecurringAppointments(clinicId, {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: appointmentMarker,
      visitType: "trial",
      occurrences: 2,
      intervalWeeks: 1,
    });
    expect(series.map((item) => item.visitType)).toEqual(["trial", "trial"]);
    const day = (value: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(value),
      );
    const report = await repository.getManagementReport(
      clinicId,
      day(series[0]!.startsAt),
      day(series[1]!.startsAt),
    );
    expect(report.appointments.byVisitType.trial).toBeGreaterThanOrEqual(2);
    expect(
      report.appointments.byVisitType.regular +
        report.appointments.byVisitType.trial +
        report.appointments.byVisitType.evaluation,
    ).toBe(report.appointments.total);
  });

  it("schedules a lead appointment and keeps it out of sessions, records, NPS and commissions", async () => {
    await cleanupLeadAppointments();
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const lead = await repository.createLead(clinicId, {
      fullName: "Lead de Integração",
      phone: leadAppointmentPhone,
      source: "Instagram",
      interest: "Pilates",
      tags: [],
    });
    const at = (hours: number) =>
      new Date(leadAppointmentDay.getTime() + hours * 60 * 60 * 1000).toISOString();
    const input = {
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: at(0),
      notes: leadAppointmentMarker,
      visitType: "trial" as const,
    };
    expect(
      await repository.createLeadAppointment(
        clinicId,
        "99999999-9999-4999-8999-000000000000",
        input,
      ),
    ).toBeNull();
    const trial = await repository.createLeadAppointment(clinicId, lead.id, input);
    expect(trial).toMatchObject({
      leadId: lead.id,
      leadName: "Lead de Integração",
      patientName: "Lead de Integração",
      visitType: "trial",
      status: "scheduled",
    });
    expect(trial).not.toHaveProperty("patientId");
    const anotherInstance = new PostgresClinicRepository(pool);
    expect(
      (await anotherInstance.listAppointments(clinicId, at(-1), at(1))).find(
        (item) => item.id === trial!.id,
      ),
    ).toMatchObject({ leadId: lead.id, leadName: "Lead de Integração" });

    // Conflito com cliente no mesmo profissional/horário vale normalmente.
    await expect(
      repository.createAppointment(clinicId, {
        ...input,
        patientId: patients[0]!.id,
        roomId: rooms[1]!.id,
        visitType: "regular",
      }),
    ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
    // O banco exige exatamente um dono: cliente ou lead.
    await expect(
      pool.query(
        `INSERT INTO appointments (clinic_id, professional_id, room_id, service_id, starts_at, ends_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [clinicId, input.professionalId, input.roomId, input.serviceId, at(5), at(6), leadAppointmentMarker],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `INSERT INTO appointments (clinic_id, patient_id, lead_id, professional_id, room_id, service_id, starts_at, ends_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [clinicId, patients[0]!.id, lead.id, input.professionalId, input.roomId, input.serviceId, at(5), at(6), leadAppointmentMarker],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Finalizar não consome sessão de plano algum.
    const plansBefore = await repository.listPatientPlans(clinicId);
    const completed = await repository.updateAppointmentStatus(clinicId, trial!.id, "completed");
    expect(completed).toMatchObject({ status: "completed", leadId: lead.id });
    expect(await repository.listPatientPlans(clinicId)).toEqual(plansBefore);

    await expect(
      repository.saveClinicalRecord(clinicId, ownerId, {
        appointmentId: trial!.id,
        subjective: "Relato",
        objective: "Exame",
        assessment: "Avaliação",
        plan: "Plano",
      }),
    ).rejects.toMatchObject({ code: "LEAD_APPOINTMENT_NOT_ALLOWED" });
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId: patients[0]!.id,
        appointmentId: trial!.id,
        score: 9,
      }),
    ).rejects.toMatchObject({ code: "LEAD_APPOINTMENT_NOT_ALLOWED" });

    // Lembretes ficam só no teste em memória: gerar aqui enfileiraria
    // cobranças reais da base compartilhada (vencidas até a data futura).
    const upcoming = await repository.createLeadAppointment(clinicId, lead.id, {
      ...input,
      startsAt: at(3),
      visitType: "evaluation",
    });
    expect(upcoming).toMatchObject({ leadId: lead.id, visitType: "evaluation" });
    const referenceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date(at(3)));

    // Comissão: atendimento de lead finalizado não gera lançamento.
    await repository.createCommissionRule(clinicId, {
      professionalId: input.professionalId,
      percentage: 30,
      effectiveFrom: leadAppointmentDay.toISOString().slice(0, 10),
    });
    const commissions = await repository.generateCommissions(
      clinicId,
      referenceDate.slice(0, 7),
    );
    expect(commissions.find((item) => item.appointmentId === trial!.id)).toBeUndefined();

    // Sugestões e linha do tempo leem a agenda sem quebrar e sem o lead.
    const suggestions = await repository.listContactSuggestions(clinicId, "owner");
    expect(JSON.stringify(suggestions)).not.toContain(trial!.id);
    const timeline = await repository.getPatientTimeline(clinicId, patients[0]!.id);
    expect(JSON.stringify(timeline)).not.toContain(trial!.id);

    // Relatório gerencial (agenda) conta pelo tipo.
    const report = await repository.getManagementReport(clinicId, referenceDate, referenceDate);
    expect(report.appointments.byVisitType.trial).toBeGreaterThanOrEqual(1);
    expect(report.appointments.byVisitType.evaluation).toBeGreaterThanOrEqual(1);
  });

  it("reconciles PostgreSQL sales, cancellation, payment and reversal movements", async () => {
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const plan = await repository.createPatientPlan(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      {
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: salesMarker,
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 24000,
        installments: 2,
        firstDueDate: date,
      },
    );
    const receivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id=$1 ORDER BY installment_number LIMIT 1",
      [plan.id],
    );
    await repository.settleReceivable(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      receivable.rows[0]!.id,
      "pix",
    );
    await repository.reverseReceivablePayment(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      receivable.rows[0]!.id,
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      plan.id,
      "cancelled",
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      plan.id,
      "cancelled",
    );
    const anotherInstance = new PostgresClinicRepository(pool);
    const report = await anotherInstance.getSalesReport(clinicId, date.slice(0, 7));
    const planMovements = report.sales.filter((item) => item.sourceId === plan.id);
    expect(planMovements).toHaveLength(2);
    expect(planMovements.reduce((sum, item) => sum + item.amountInCents, 0)).toBe(0);
    expect(planMovements.map((item) => item.kind).sort()).toEqual(["cancellation", "sale"]);
    const paymentMovements = report.payments.filter((item) => item.receivableId === receivable.rows[0]!.id);
    expect(paymentMovements).toHaveLength(2);
    expect(paymentMovements.reduce((sum, item) => sum + item.amountInCents, 0)).toBe(0);

    const partial = await repository.createPatientPlan(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      {
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: salesMarker,
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 24000,
        installments: 2,
        firstDueDate: date,
      },
    );
    const partialReceivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id=$1 ORDER BY installment_number LIMIT 1",
      [partial.id],
    );
    await repository.settleReceivable(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      partialReceivable.rows[0]!.id,
      "pix",
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      partial.id,
      "cancelled",
    );
    const partialReport = await anotherInstance.getSalesReport(clinicId, date.slice(0, 7));
    expect(
      partialReport.sales
        .filter((item) => item.sourceId === partial.id)
        .reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(12000);
    expect(
      partialReport.payments
        .filter((item) => item.receivableId === partialReceivable.rows[0]!.id)
        .reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(12000);
    const management = await anotherInstance.getManagementReport(
      clinicId,
      `${date.slice(0, 7)}-01`,
      date,
    );
    expect(management.finance.paidInPeriodInCents).toBe(
      partialReport.current.receivedInCents,
    );
  });

  it("renews due PostgreSQL plans once and blocks a second manual renewal", async () => {
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const now = new Date();
    const month = (offset: number, day: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day))
        .toISOString()
        .slice(0, 10);
    const plan = await repository.createPatientPlan(clinicId, ownerId, {
      patientId: patients[0]!.id,
      serviceId: services[0]!.id,
      name: renewalMarker,
      kind: "recurring",
      totalSessions: 4,
      validFrom: month(-2, 1),
      validUntil: month(-1, 0),
      totalValueInCents: 30000,
      installments: 1,
      firstDueDate: month(-2, 1),
    });
    expect(plan.autoRenew).toBe(true);
    await Promise.all([
      repository.renewDuePatientPlans(clinicId, ownerId),
      repository.renewDuePatientPlans(clinicId, ownerId),
    ]);
    const chain = (await repository.listPatientPlans(clinicId, patients[0]!.id))
      .filter((item) => item.name === renewalMarker)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    expect(chain.map((item) => item.validFrom)).toEqual([
      month(-2, 1),
      month(-1, 1),
      month(0, 1),
    ]);
    expect(chain[2]).toMatchObject({ status: "active", remainingSessions: 4 });
    expect(chain[1]!.renewedFromPlanId).toBe(plan.id);

    await expect(
      repository.renewPatientPlan(clinicId, ownerId, plan.id, {
        name: renewalMarker,
        totalSessions: 4,
        validFrom: month(0, 1),
        totalValueInCents: 30000,
        installments: 1,
        firstDueDate: month(0, 1),
      }),
    ).rejects.toMatchObject({ code: "PLAN_ALREADY_RENEWED" });
  });

  it("creates, lists by range and deletes holidays, one per date", async () => {
    const dates = ["2099-04-21", "2099-05-01"];
    await pool.query(
      "DELETE FROM holidays WHERE clinic_id = $1 AND date = ANY($2::date[])",
      [clinicId, dates],
    );
    const labor = await repository.createHoliday(clinicId, {
      date: dates[1]!,
      name: "Dia do Trabalho",
    });
    const tiradentes = await repository.createHoliday(clinicId, {
      date: dates[0]!,
      name: "Tiradentes",
    });
    expect(tiradentes).toMatchObject({ clinicId, date: dates[0], name: "Tiradentes" });
    await expect(
      repository.createHoliday(clinicId, { date: dates[0]!, name: "Outro" }),
    ).rejects.toMatchObject({ code: "HOLIDAY_DUPLICATE" });
    expect(
      (await repository.listHolidays(clinicId, "2099-01-01", "2099-12-31")).map(
        (item) => item.id,
      ),
    ).toEqual([tiradentes.id, labor.id]);
    expect(await repository.listHolidays(clinicId, "2099-04-22", "2099-05-01")).toEqual([
      labor,
    ]);
    expect((await repository.listHolidays(clinicId)).map((item) => item.id)).toEqual(
      expect.arrayContaining([tiradentes.id, labor.id]),
    );
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(true);
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(false);
    expect(await repository.deleteHoliday(clinicId, labor.id)).toBe(true);
  });

  it("returns default relationship settings and upserts changes", async () => {
    await pool.query("DELETE FROM relationship_settings WHERE clinic_id = $1", [
      clinicId,
    ]);
    expect(await repository.getRelationshipSettings(clinicId)).toEqual(
      defaultRelationshipSettings,
    );
    const changed = {
      ...defaultRelationshipSettings,
      birthdayDaysAhead: 3,
      formerClientMinDays: 15,
      formerClientMaxDays: 45,
      messages: { ...defaultRelationshipSettings.messages, birthday: "Parabéns, {{nome}}!" },
    };
    expect(await repository.updateRelationshipSettings(clinicId, changed)).toEqual(changed);
    const again = { ...changed, planExpiringDays: 12 };
    await repository.updateRelationshipSettings(clinicId, again);
    expect(
      await new PostgresClinicRepository(pool).getRelationshipSettings(clinicId),
    ).toEqual(again);
    const rows = await pool.query(
      "SELECT count(*)::int AS total FROM relationship_settings WHERE clinic_id = $1",
      [clinicId],
    );
    expect(rows.rows[0].total).toBe(1);
  });

  it("lists contact suggestions and hides them after a registered contact", async () => {
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, relationshipCpf],
    );
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      relationshipCpf,
    ]);
    const today = saoPauloToday();
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente Relacionamento",
      phone: "11944443333",
      cpf: relationshipCpf,
      birthDate: `1992-${today.slice(5)}`,
      tags: [],
    });
    const mine = async () =>
      (await repository.listContactSuggestions(clinicId, "reception")).filter(
        (item) => item.patientId === patient.id,
      );
    const birthday = (await mine()).find((item) => item.reason === "birthday");
    expect(birthday).toMatchObject({
      referenceKey: `${patient.id}:${today.slice(0, 4)}`,
      detail: "Aniversário hoje",
    });

    const activity = await repository.createContactActivity(clinicId, ownerId, {
      patientId: patient.id,
      reason: "birthday",
      referenceKey: birthday!.referenceKey,
      outcome: "contacted",
      notes: "Parabéns enviado",
    });
    expect(activity).toMatchObject({
      clinicId,
      patientId: patient.id,
      outcome: "contacted",
      notes: "Parabéns enviado",
      actorUserId: ownerId,
    });
    expect((await mine()).some((item) => item.reason === "birthday")).toBe(false);
    expect(
      await new PostgresClinicRepository(pool).listContactActivities(
        clinicId,
        patient.id,
      ),
    ).toEqual([activity]);
    await expect(
      repository.createContactActivity(clinicId, ownerId, {
        patientId: "fafafafa-fafa-4afa-8afa-fafafafafafa",
        reason: "birthday",
        referenceKey: "x",
        outcome: "contacted",
      }),
    ).rejects.toMatchObject({ code: "PATIENT_NOT_FOUND", statusCode: 404 });
  });

  it("lists the month's birthdays and marks the congratulated ones", async () => {
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, birthdayCpf],
    );
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      birthdayCpf,
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente Aniversário",
      phone: "11944443333",
      cpf: birthdayCpf,
      birthDate: "2000-02-29",
      tags: [],
    });
    const mine = async (month: string) =>
      (await repository.listBirthdays(clinicId, month)).filter(
        (item) => item.patientId === patient.id,
      );
    expect(await mine("2031-02")).toEqual([
      expect.objectContaining({
        patientName: "Cliente Aniversário",
        date: "2031-02-28",
        day: 28,
        ageTurning: 31,
        referenceKey: `${patient.id}:2031`,
        congratulated: false,
      }),
    ]);
    expect(await mine("2031-03")).toEqual([]);
    await repository.createContactActivity(clinicId, ownerId, {
      patientId: patient.id,
      reason: "birthday",
      referenceKey: `${patient.id}:2031`,
      outcome: "contacted",
    });
    expect((await mine("2031-02"))[0]?.congratulated).toBe(true);
    expect((await mine("2032-02"))[0]).toMatchObject({
      date: "2032-02-29",
      congratulated: false,
    });
  });

  it("records one satisfaction survey per completed appointment and filters by clinic date", async () => {
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, satisfactionCpf],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      satisfactionMarker,
    ]);
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      satisfactionCpf,
    ]);
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente Satisfação",
      phone: "11933332222",
      cpf: satisfactionCpf,
      tags: [],
    });
    const startsAt = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(13, 0, 0, 0);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: satisfactionMarker,
      visitType: "regular",
    });
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 9,
      }),
    ).rejects.toMatchObject({ code: "SATISFACTION_APPOINTMENT_NOT_COMPLETED" });
    await repository.updateAppointmentStatus(clinicId, appointment.id, "completed");
    const survey = await repository.createSatisfactionSurvey(clinicId, ownerId, {
      patientId: patient.id,
      appointmentId: appointment.id,
      score: 9,
      comment: "Gostei muito.",
    });
    expect(survey).toMatchObject({
      patientName: "Cliente Satisfação",
      appointmentId: appointment.id,
      score: 9,
      comment: "Gostei muito.",
      actorUserId: ownerId,
    });
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 2,
      }),
    ).rejects.toMatchObject({ code: "SATISFACTION_DUPLICATE" });
    const loose = await repository.createSatisfactionSurvey(clinicId, ownerId, {
      patientId: patient.id,
      score: 4,
    });
    expect(loose).not.toHaveProperty("appointmentId");
    const today = saoPauloToday();
    const mine = (await repository.listSatisfactionSurveys(clinicId, {
      from: today,
      to: today,
    })).filter((item) => item.patientId === patient.id);
    expect(mine.map((item) => item.id)).toEqual([loose.id, survey.id]);
    expect(
      (await repository.listSatisfactionSurveys(clinicId, { to: "2000-01-01" }))
        .filter((item) => item.patientId === patient.id),
    ).toEqual([]);
  });

  it("builds the PostgreSQL client timeline only from the client's own data", async () => {
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente Linha do Tempo",
      phone: "11933334444",
      whatsapp: "11933334444",
      cpf: timelineCpf,
      tags: [],
    });
    const startsAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(13, 0, 0, 0);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: timelineMarker,
      visitType: "regular",
    });
    await repository.updateAppointmentStatus(clinicId, appointment.id, "completed");
    const date = saoPauloToday();
    const plan = await repository.createPatientPlan(clinicId, ownerId, {
      patientId: patient.id,
      serviceId: services[0]!.id,
      name: timelineMarker,
      kind: "fixed_package",
      totalSessions: 2,
      validFrom: date,
      totalValueInCents: 20000,
      installments: 1,
      firstDueDate: date,
    });
    const receivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id=$1",
      [plan.id],
    );
    await repository.settleReceivable(clinicId, ownerId, receivable.rows[0]!.id, "pix");
    await repository.reverseReceivablePayment(clinicId, ownerId, receivable.rows[0]!.id);
    await repository.updatePatientPlanStatus(clinicId, ownerId, plan.id, "cancelled");
    await repository.createContactActivity(clinicId, ownerId, {
      patientId: patient.id,
      reason: "plan_expiring",
      referenceKey: plan.id,
      outcome: "contacted",
    });
    await repository.queueManualMessage(clinicId, {
      patientId: patient.id,
      channel: "whatsapp",
      body: "Olá!",
    });
    const survey = await repository.createSatisfactionSurvey(clinicId, ownerId, {
      patientId: patient.id,
      appointmentId: appointment.id,
      score: 8,
    });
    expect(
      (await repository.listSatisfactionSurveys(clinicId, { patientId: patient.id })).map(
        (item) => item.id,
      ),
    ).toEqual([survey.id]);

    const timeline = await new PostgresClinicRepository(pool).getPatientTimeline(
      clinicId,
      patient.id,
    );
    expect(timeline).not.toBeNull();
    expect(timeline!.map((item) => item.kind).sort()).toEqual([
      "appointment",
      "contact",
      "message",
      "payment",
      "payment_reversal",
      "plan_cancelled",
      "plan_created",
      "satisfaction",
    ]);
    const times = timeline!.map((item) => Date.parse(item.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(timeline!.find((item) => item.kind === "payment_reversal")).toMatchObject({
      amountInCents: -20000,
    });
    expect(timeline!.find((item) => item.kind === "appointment")).toMatchObject({
      id: `appointment:${appointment.id}`,
      status: "completed",
    });
    expect(
      await repository.getPatientTimeline(
        "12121212-1212-4121-8121-121212121212",
        patient.id,
      ),
    ).toBeNull();
    expect(
      await repository.getPatientTimeline(
        clinicId,
        "12121212-1212-4121-8121-121212121212",
      ),
    ).toBeNull();
  });

  it("fills professional variables on issued documents and exposes CREFITO on records", async () => {
    const [patient] = await repository.listPatients(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "postgres-document-professional-test",
      kind: "other",
      body: "Assinado por [{{profissional_nome}}] [{{profissional_crefito}}].",
    });
    try {
      const signed = await repository.createIssuedDocument(clinicId, ownerId, {
        templateId: template.id,
        patientId: patient!.id,
        professionalId: professional!.id,
        title: "Documento com profissional",
      });
      expect(signed.professionalId).toBe(professional!.id);
      expect(signed.snapshotBody).toContain(
        `[${professional!.fullName}] [${professional!.crefito}]`,
      );
      const unsigned = await repository.createIssuedDocument(clinicId, ownerId, {
        templateId: template.id,
        patientId: patient!.id,
        title: "Documento sem profissional",
      });
      expect(unsigned.snapshotBody).toContain("[] []");
      await expect(
        repository.createIssuedDocument(clinicId, ownerId, {
          templateId: template.id,
          patientId: patient!.id,
          professionalId: "fafafafa-fafa-4afa-8afa-fafafafafafa",
          title: "Documento inválido",
        }),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_NOT_FOUND", statusCode: 404 });
      for (const record of await repository.listClinicalRecords(clinicId))
        expect(record.professionalCrefito).toBeTruthy();
    } finally {
      await pool.query("DELETE FROM issued_documents WHERE template_id = $1", [
        template.id,
      ]);
      await pool.query("DELETE FROM document_templates WHERE id = $1", [
        template.id,
      ]);
    }
  });

  it("imports patients in one transaction and skips duplicates already in the database", async () => {
    const phones = ["11955501001", "11955501002", "11955501003"];
    const importCpf = "98765432106";
    try {
      const first = await repository.importPatients(clinicId, [
        { fullName: "Importada PG Um", phone: phones[0]!, cpf: importCpf, tags: [] },
        { fullName: "Importada PG Dois", phone: phones[1]!, tags: ["importada"] },
      ]);
      expect(first).toEqual({ created: 2, skipped: 0 });
      const listed = await repository.listPatients(clinicId, "Importada PG");
      expect(listed.map((patient) => patient.fullName)).toEqual([
        "Importada PG Dois",
        "Importada PG Um",
      ]);
      expect(new Set(listed.map((patient) => patient.recordNumber)).size).toBe(2);

      const again = await repository.importPatients(clinicId, [
        { fullName: "Importada PG Um", phone: phones[0]!, tags: [] },
        { fullName: "Mesmo CPF", phone: phones[2]!, cpf: "987.654.321-06", tags: [] },
        { fullName: "Importada PG Dois", phone: "11 95550-1002", tags: [] },
      ]);
      expect(again).toEqual({ created: 0, skipped: 3 });
      expect(await repository.importPatients(clinicId, [])).toEqual({ created: 0, skipped: 0 });
      expect(await repository.listPatients(clinicId, "Importada PG")).toHaveLength(2);
    } finally {
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND (phone = ANY($2::text[]) OR cpf = $3)",
        [clinicId, phones, importCpf],
      );
    }
  });
});
