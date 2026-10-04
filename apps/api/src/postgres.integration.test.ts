import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations, seedDemoData } from "./database.js";
import { databaseConnectionConfig } from "./database-connection.js";
import {
  legacyEffectiveEditModules,
  legacyEffectiveModules,
  legacyRoleDefaultModules,
  migrateLegacyUser,
  type LegacyRole,
} from "./legacy-roles.js";
import { PostgresClinicRepository } from "./postgres-repository.js";
import { DomainError } from "./repository.js";
import {
  appModuleSchema,
  defaultRelationshipSettings,
  effectiveEditModules,
  effectiveModules,
  saoPauloToday,
  type AppModule,
} from "@crm/contracts";

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
const leadConversionMarker = "postgres-lead-conversion-test";
const leadConversionPhones = ["11900001144", "11900001155"];
const leadConversionDay = new Date(Date.now() + 610 * 24 * 60 * 60 * 1000);
leadConversionDay.setUTCHours(12, 0, 0, 0);
const trialConversionMarker = "postgres-trial-conversion-test";
const trialConversionPhones = ["11900001166", "11900001177", "11900001188"];
// Dia exclusivo deste teste, para contar as experimentais com valores exatos.
const trialConversionDay = new Date(Date.now() + 620 * 24 * 60 * 60 * 1000);
trialConversionDay.setUTCHours(12, 0, 0, 0);
const ownerId = "22222222-2222-4222-8222-222222222222";
const recurringPayableMarker = "postgres-recurring-payable-test";
const dailyCashMarker = "postgres-daily-cash-test";
const financeClassificationMarker = "postgres-finance-classification-test";
const exportAuditMarker = "postgres-export-audit-test";
const permissionsUserEmail = "postgres-permissions-test@movimenta.local";
// Dia exclusivo deste teste (aaaa-mm-dd), bem à frente de qualquer movimento real.
const dailyCashDay = new Date(Date.now() + 640 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;
  let repository: PostgresClinicRepository;

  async function cleanupRecurringPayables() {
    const models = `SELECT id FROM recurring_payables WHERE clinic_id = $1 AND description = $2`;
    await pool.query(
      `DELETE FROM payable_events WHERE payable_id IN
       (SELECT id FROM payables WHERE recurring_payable_id IN (${models}))`,
      [clinicId, recurringPayableMarker],
    );
    await pool.query(`DELETE FROM payables WHERE recurring_payable_id IN (${models})`, [
      clinicId,
      recurringPayableMarker,
    ]);
    await pool.query("DELETE FROM recurring_payables WHERE clinic_id = $1 AND description = $2", [
      clinicId,
      recurringPayableMarker,
    ]);
  }

  // O banco não traz categorias nem centros de custo prontos: os testes criam os seus.
  async function testFinanceClassification() {
    const category = await pool.query<{ id: string }>(
      `INSERT INTO financial_categories (clinic_id, name, kind) VALUES ($1, $2, 'expense')
       ON CONFLICT (clinic_id, name, kind) DO UPDATE SET active = true
       RETURNING id`,
      [clinicId, financeClassificationMarker],
    );
    const costCenter = await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (clinic_id, name) VALUES ($1, $2)
       ON CONFLICT (clinic_id, name) DO UPDATE SET active = true
       RETURNING id`,
      [clinicId, financeClassificationMarker],
    );
    return [category, costCenter] as const;
  }

  async function cleanupDailyCash() {
    const plans = "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${plans}))`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(`DELETE FROM session_movements WHERE plan_id IN (${plans})`, [
      clinicId,
      dailyCashMarker,
    ]);
    await pool.query(`DELETE FROM receivables WHERE plan_id IN (${plans})`, [
      clinicId,
      dailyCashMarker,
    ]);
    await pool.query("DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2", [
      clinicId,
      dailyCashMarker,
    ]);
    const payables = "SELECT id FROM payables WHERE clinic_id = $1 AND description = $2";
    await pool.query(`DELETE FROM payable_events WHERE payable_id IN (${payables})`, [
      clinicId,
      dailyCashMarker,
    ]);
    await pool.query("DELETE FROM payables WHERE clinic_id = $1 AND description = $2", [
      clinicId,
      dailyCashMarker,
    ]);
  }

  async function cleanupLeadConversion() {
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
         (SELECT id FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, leadConversionPhones],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      leadConversionMarker,
    ]);
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, leadConversionPhones],
    );
    await pool.query(
      "DELETE FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, leadConversionPhones],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, leadConversionPhones],
    );
  }

  async function cleanupTrialConversion() {
    const planFilter = "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${planFilter}))`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (${planFilter})`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(`DELETE FROM receivables WHERE plan_id IN (${planFilter})`, [
      clinicId,
      trialConversionMarker,
    ]);
    await pool.query("DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2", [
      clinicId,
      trialConversionMarker,
    ]);
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      trialConversionMarker,
    ]);
    await pool.query(
      `DELETE FROM lead_stage_history WHERE lead_id IN
         (SELECT id FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[]))`,
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM leads WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
      [clinicId, trialConversionPhones],
    );
  }

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

  async function cleanupExportAudit() {
    await pool.query(
      "DELETE FROM audit_events WHERE clinic_id = $1 AND action = 'patients.exported' AND metadata->>'marker' = $2",
      [clinicId, exportAuditMarker],
    );
  }

  async function cleanupPermissionsUser() {
    const ids = `SELECT id FROM users WHERE clinic_id = $1 AND email = $2`;
    await pool.query(
      `DELETE FROM audit_events WHERE clinic_id = $1 AND entity_type = 'user' AND entity_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query("DELETE FROM users WHERE clinic_id = $1 AND email = $2", [
      clinicId,
      permissionsUserEmail,
    ]);
  }

  afterAll(async () => {
    if (!pool) return;
    await cleanupPermissionsUser();
    await cleanupExportAudit();
    await cleanupLeadAppointments();
    await cleanupLeadConversion();
    await cleanupTrialConversion();
    await cleanupRecurringPayables();
    await cleanupDailyCash();
    await pool.query("DELETE FROM financial_categories WHERE clinic_id = $1 AND name = $2", [
      clinicId,
      financeClassificationMarker,
    ]);
    await pool.query("DELETE FROM cost_centers WHERE clinic_id = $1 AND name = $2", [
      clinicId,
      financeClassificationMarker,
    ]);
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
      { previousStartsAt: at(0), startsAt: at(1), actorName: "Aryana Dutra" },
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
    const suggestions = await repository.listContactSuggestions(clinicId, appModuleSchema.options);
    expect(JSON.stringify(suggestions)).not.toContain(trial!.id);
    const timeline = await repository.getPatientTimeline(clinicId, patients[0]!.id);
    expect(JSON.stringify(timeline)).not.toContain(trial!.id);

    // Relatório gerencial (agenda) conta pelo tipo.
    const report = await repository.getManagementReport(clinicId, referenceDate, referenceDate);
    expect(report.appointments.byVisitType.trial).toBeGreaterThanOrEqual(1);
    expect(report.appointments.byVisitType.evaluation).toBeGreaterThanOrEqual(1);
  });

  it("moves the lead appointments to the created or reused client on conversion", async () => {
    await cleanupLeadConversion();
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const at = (hours: number) =>
      new Date(leadConversionDay.getTime() + hours * 60 * 60 * 1000).toISOString();
    const input = {
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      notes: leadConversionMarker,
    };

    // Cliente criado na conversão.
    const lead = await repository.createLead(clinicId, {
      fullName: "Lead Convertido",
      phone: leadConversionPhones[0]!,
      source: "Instagram",
      interest: "Pilates",
      tags: [],
    });
    const trial = await repository.createLeadAppointment(clinicId, lead.id, {
      ...input,
      startsAt: at(0),
      visitType: "trial",
    });
    const evaluation = await repository.createLeadAppointment(clinicId, lead.id, {
      ...input,
      startsAt: at(2),
      visitType: "evaluation",
    });
    const conversion = await repository.convertLead(clinicId, ownerId, lead.id);
    expect(conversion).toMatchObject({ reusedExisting: false, lead: { stage: "won" } });
    const patientId = conversion!.patient.id;
    const anotherInstance = new PostgresClinicRepository(pool);
    const moved = (await anotherInstance.listAppointments(clinicId, at(-1), at(4))).filter(
      (item) => item.id === trial!.id || item.id === evaluation!.id,
    );
    expect(moved).toHaveLength(2);
    for (const item of moved) {
      expect(item).toMatchObject({ patientId, patientName: "Lead Convertido" });
      expect(item).not.toHaveProperty("leadId");
      expect(item).not.toHaveProperty("leadName");
    }
    const stored = await pool.query<{ lead_id: string | null }>(
      "SELECT lead_id FROM appointments WHERE id = ANY($1::uuid[])",
      [[trial!.id, evaluation!.id]],
    );
    expect(stored.rows.every((row) => row.lead_id === null)).toBe(true);
    const timeline = await repository.getPatientTimeline(clinicId, patientId);
    expect(JSON.stringify(timeline)).toContain(trial!.id);
    expect(JSON.stringify(timeline)).toContain(evaluation!.id);
    await repository.updateAppointmentStatus(clinicId, trial!.id, "completed");
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId,
        appointmentId: trial!.id,
        score: 9,
      }),
    ).resolves.toMatchObject({ patientId, appointmentId: trial!.id });

    // Cliente reaproveitado pelo telefone.
    const existing = await repository.createPatient(clinicId, {
      fullName: "Cliente Já Cadastrado",
      phone: leadConversionPhones[1]!,
      tags: [],
    });
    const secondLead = await repository.createLead(clinicId, {
      fullName: "Outro Nome no Lead",
      phone: leadConversionPhones[1]!,
      source: "Indicação",
      interest: "Fisioterapia",
      tags: [],
    });
    const secondTrial = await repository.createLeadAppointment(clinicId, secondLead.id, {
      ...input,
      startsAt: at(5),
      visitType: "trial",
    });
    const reused = await repository.convertLead(clinicId, ownerId, secondLead.id);
    expect(reused).toMatchObject({ reusedExisting: true, patient: { id: existing.id } });
    const movedToExisting = (await repository.listAppointments(clinicId, at(4), at(7))).find(
      (item) => item.id === secondTrial!.id,
    );
    expect(movedToExisting).toMatchObject({
      patientId: existing.id,
      patientName: "Cliente Já Cadastrado",
      visitType: "trial",
    });
    expect(movedToExisting).not.toHaveProperty("leadId");
  });

  it("reports trial conversion by plans created within 30 days of the completed trial", async () => {
    await cleanupTrialConversion();
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const at = (hours: number) =>
      new Date(trialConversionDay.getTime() + hours * 60 * 60 * 1000).toISOString();
    const input = {
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      notes: trialConversionMarker,
    };
    const day = trialConversionDay.toISOString().slice(0, 10);
    const createPlanAt = async (patientId: string, createdAt: string) => {
      const plan = await repository.createPatientPlan(clinicId, ownerId, {
        patientId,
        serviceId: input.serviceId,
        name: trialConversionMarker,
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: day,
        totalValueInCents: 40000,
        installments: 1,
        firstDueDate: day,
      });
      await pool.query("UPDATE patient_plans SET created_at = $2 WHERE id = $1", [
        plan.id,
        createdAt,
      ]);
    };
    const createLead = (fullName: string, phone: string) =>
      repository.createLead(clinicId, {
        fullName,
        phone,
        source: "Instagram",
        interest: "Pilates",
        tags: [],
      });

    // Lead convertido que contrata 2 dias depois: convertida.
    const converted = await createLead("Experimental Convertida", trialConversionPhones[0]!);
    const convertedTrial = await repository.createLeadAppointment(clinicId, converted.id, {
      ...input,
      startsAt: at(0),
      visitType: "trial",
    });
    await repository.updateAppointmentStatus(clinicId, convertedTrial!.id, "completed");
    const conversion = await repository.convertLead(clinicId, ownerId, converted.id);
    await createPlanAt(
      conversion!.patient.id,
      new Date(new Date(at(0)).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    );

    // Lead que não vira cliente: concluída, não convertida.
    const open = await createLead("Avaliação Sem Conversão", trialConversionPhones[1]!);
    const openEvaluation = await repository.createLeadAppointment(clinicId, open.id, {
      ...input,
      startsAt: at(2),
      visitType: "evaluation",
    });
    await repository.updateAppointmentStatus(clinicId, openEvaluation!.id, "completed");

    // Cliente que contrata depois de 40 dias: não convertida; cancelada fica de fora.
    const client = await repository.createPatient(clinicId, {
      fullName: "Cliente Contrata Tarde",
      phone: trialConversionPhones[2]!,
      tags: [],
    });
    const lateTrial = await repository.createAppointment(clinicId, {
      ...input,
      patientId: client.id,
      startsAt: at(4),
      visitType: "trial",
    });
    await repository.updateAppointmentStatus(clinicId, lateTrial.id, "completed");
    const cancelled = await repository.createAppointment(clinicId, {
      ...input,
      patientId: client.id,
      startsAt: at(6),
      visitType: "trial",
    });
    await repository.updateAppointmentStatus(clinicId, cancelled.id, "cancelled");
    await createPlanAt(
      client.id,
      new Date(new Date(at(4)).getTime() + 40 * 24 * 60 * 60 * 1000).toISOString(),
    );

    const reportDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(trialConversionDay);
    const report = await new PostgresClinicRepository(pool).getManagementReport(
      clinicId,
      reportDay,
      reportDay,
    );
    expect(report.trials).toEqual({
      scheduled: 3,
      completed: 3,
      converted: 1,
      conversionRate: 33,
    });
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

  it("builds the PostgreSQL daily cash by event date in the clinic time zone", async () => {
    await cleanupDailyCash();
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const [category, costCenter] = await testFinanceClassification();
    const plan = await repository.createPatientPlan(clinicId, ownerId, {
      patientId: patients[0]!.id,
      serviceId: services[0]!.id,
      name: dailyCashMarker,
      kind: "fixed_package",
      totalSessions: 1,
      validFrom: dailyCashDay,
      totalValueInCents: 12_000,
      installments: 1,
      firstDueDate: dailyCashDay,
    });
    const receivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id = $1",
      [plan.id],
    );
    const receivableId = receivable.rows[0]!.id;
    await repository.settleReceivable(clinicId, ownerId, receivableId, "cash");
    await repository.reverseReceivablePayment(clinicId, ownerId, receivableId);
    const payable = await repository.createPayable(clinicId, ownerId, {
      description: dailyCashMarker,
      supplier: "Fornecedor PG",
      categoryId: category.rows[0]!.id,
      costCenterId: costCenter.rows[0]!.id,
      dueDate: dailyCashDay,
      amountInCents: 4_000,
    });
    await repository.settlePayable(clinicId, ownerId, payable.id, "pix");

    // Leva os eventos para o dia exclusivo: 23h30/23h40 de São Paulo (dia
    // seguinte em UTC) e a conta paga às 12h.
    const nextDay = new Date(`${dailyCashDay}T12:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDate = nextDay.toISOString().slice(0, 10);
    await pool.query(
      `UPDATE financial_events SET created_at = $2::timestamptz
       WHERE receivable_id = $1 AND kind = 'payment'`,
      [receivableId, `${nextDate}T02:30:00.000Z`],
    );
    await pool.query(
      `UPDATE financial_events SET created_at = $2::timestamptz
       WHERE receivable_id = $1 AND kind = 'payment_reversal'`,
      [receivableId, `${nextDate}T02:40:00.000Z`],
    );
    await pool.query("UPDATE payables SET paid_at = $2::timestamptz WHERE id = $1", [
      payable.id,
      `${dailyCashDay}T15:00:00.000Z`,
    ]);

    const events = await pool.query<{ id: string }>(
      `SELECT id FROM financial_events
       WHERE receivable_id = $1 AND kind IN ('payment','payment_reversal')`,
      [receivableId],
    );
    const ownIds = new Set([
      `payable:${payable.id}`,
      ...events.rows.flatMap((item) => [
        `receipt:${item.id}`,
        `receipt_reversal:${item.id}`,
      ]),
    ]);
    const anotherInstance = new PostgresClinicRepository(pool);
    const cash = await anotherInstance.getDailyCash(clinicId, dailyCashDay);
    const ours = cash.movements.filter((item) => ownIds.has(item.id));
    expect(
      ours.map((item) => [item.kind, item.paymentMethod, item.amountInCents]),
    ).toEqual([
      ["payable", "pix", 4_000],
      ["receipt", "cash", 12_000],
      ["receipt_reversal", "cash", -12_000],
    ]);
    expect(cash.date).toBe(dailyCashDay);
    const following = await anotherInstance.getDailyCash(clinicId, nextDate);
    expect(
      following.movements.filter((item) => ownIds.has(item.id)),
    ).toEqual([]);
    await cleanupDailyCash();
  });

  it("lists PostgreSQL payments and reversals by event date in the clinic time zone", async () => {
    await cleanupDailyCash();
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const plan = await repository.createPatientPlan(clinicId, ownerId, {
      patientId: patients[0]!.id,
      serviceId: services[0]!.id,
      name: dailyCashMarker,
      kind: "fixed_package",
      totalSessions: 1,
      validFrom: dailyCashDay,
      totalValueInCents: 12_000,
      installments: 1,
      firstDueDate: dailyCashDay,
    });
    const receivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id = $1",
      [plan.id],
    );
    const receivableId = receivable.rows[0]!.id;
    await repository.settleReceivable(clinicId, ownerId, receivableId, "cash");
    await repository.reverseReceivablePayment(clinicId, ownerId, receivableId);
    await repository.settleReceivable(clinicId, ownerId, receivableId, "pix");
    const events = await pool.query<{ id: string }>(
      `SELECT id FROM financial_events
       WHERE receivable_id = $1 AND kind IN ('payment','payment_reversal')
       ORDER BY created_at, id`,
      [receivableId],
    );
    expect(events.rows).toHaveLength(3);
    const nextDay = new Date(`${dailyCashDay}T12:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDate = nextDay.toISOString().slice(0, 10);
    // 1º pagamento: 23h30 de São Paulo (dia seguinte em UTC); estorno ao meio-dia;
    // 2º pagamento já no dia seguinte.
    const moves = [
      `${nextDate}T02:30:00.000Z`,
      `${dailyCashDay}T15:00:00.000Z`,
      `${nextDate}T15:00:00.000Z`,
    ];
    for (const [index, row] of events.rows.entries())
      await pool.query("UPDATE financial_events SET created_at = $2::timestamptz WHERE id = $1", [
        row.id,
        moves[index],
      ]);

    const anotherInstance = new PostgresClinicRepository(pool);
    const onDay = (
      await anotherInstance.listReceivedPayments(clinicId, dailyCashDay, dailyCashDay)
    ).filter((item) => item.receivableId === receivableId);
    expect(
      onDay.map((item) => [item.kind, Math.abs(item.amountInCents), item.occurredAt]),
    ).toEqual([
      ["reversal", 12_000, moves[1]],
      ["payment", 12_000, moves[0]],
    ]);
    expect(onDay[1]).toMatchObject({
      patientId: patients[0]!.id,
      patientName: patients[0]!.fullName,
      sourceId: plan.id,
      paymentMethod: "cash",
    });
    const following = (
      await anotherInstance.listReceivedPayments(clinicId, nextDate, nextDate)
    ).filter((item) => item.receivableId === receivableId);
    expect(following.map((item) => [item.kind, item.paymentMethod])).toEqual([
      ["payment", "pix"],
    ]);
    const both = (
      await anotherInstance.listReceivedPayments(clinicId, dailyCashDay, nextDate)
    ).filter((item) => item.receivableId === receivableId);
    expect(both).toHaveLength(3);
    await cleanupDailyCash();
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
      (await repository.listContactSuggestions(clinicId, legacyRoleDefaultModules.reception)).filter(
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

  it("versions contract templates without changing issued snapshots", async () => {
    const name = "postgres-document-version-test";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM issued_documents WHERE template_id IN
           (SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2)`,
        [clinicId, name],
      );
      await pool.query(
        "DELETE FROM document_templates WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    };
    await cleanup();
    try {
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'issued_documents'`,
      );
      const columnNames = columns.rows.map((row) => row.column_name);
      expect(columnNames).toContain("professional_id");
      expect(columnNames).not.toContain("appointment_id");

      const [patient] = await repository.listPatients(clinicId);
      const template = await repository.createDocumentTemplate(clinicId, {
        name,
        kind: "contract",
        body: "Versão original para {{paciente_nome}} em {{clinica_nome}}.",
      });
      expect(template).toMatchObject({ version: 1, active: true });
      await expect(
        repository.createDocumentTemplate(clinicId, {
          name,
          kind: "contract",
          body: "Outro modelo ativo com o mesmo nome.",
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_TEMPLATE_DUPLICATE", statusCode: 409 });
      const document = await repository.createIssuedDocument(clinicId, ownerId, {
        templateId: template.id,
        patientId: patient!.id,
        title: "Contrato preservado",
      });
      expect(document).toMatchObject({ status: "draft", templateVersion: 1 });
      expect(document.snapshotBody).toBe(
        `Versão original para ${patient!.fullName} em Studios Aryana.`,
      );

      const next = await repository.createDocumentTemplateVersion(
        clinicId,
        template.id,
        "Nova versão do contrato para {{paciente_nome}}.",
      );
      expect(next).toMatchObject({
        version: 2,
        active: true,
        previousVersionId: template.id,
      });
      const versions = (await repository.listDocumentTemplates(clinicId)).filter(
        (item) => item.name === name,
      );
      expect(versions.map((item) => [item.version, item.active])).toEqual([
        [2, true],
        [1, false],
      ]);
      await expect(
        repository.createIssuedDocument(clinicId, ownerId, {
          templateId: template.id,
          patientId: patient!.id,
          title: "Versão inativa",
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_TEMPLATE_NOT_FOUND", statusCode: 404 });
      expect(
        (await repository.listIssuedDocuments(clinicId)).find(
          (item) => item.id === document.id,
        )?.snapshotBody,
      ).toContain("Versão original");

      const issued = await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "issued",
      );
      expect(issued).toMatchObject({ status: "issued" });
      expect(issued?.issuedAt).toBeTruthy();
      const cancelled = await repository.updateIssuedDocumentStatus(
        clinicId,
        document.id,
        "cancelled",
      );
      expect(cancelled).toMatchObject({ status: "cancelled" });
      expect(cancelled?.cancelledAt).toBeTruthy();
      await expect(
        repository.updateIssuedDocumentStatus(clinicId, document.id, "issued"),
      ).rejects.toMatchObject({ code: "DOCUMENT_ALREADY_CANCELLED", statusCode: 409 });
    } finally {
      await cleanup();
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

  it("generates fixed expenses once per competence, respecting pause and end month", async () => {
    await cleanupRecurringPayables();
    try {
      const [category, costCenter] = await testFinanceClassification();
      const current = saoPauloToday().slice(0, 7);
      const shift = (months: number) => {
        const [year, month] = current.split("-").map(Number);
        return new Date(Date.UTC(year!, month! - 1 + months, 1)).toISOString().slice(0, 7);
      };
      const base = {
        description: recurringPayableMarker,
        supplier: "Fornecedor PG",
        categoryId: category.rows[0]!.id,
        costCenterId: costCenter.rows[0]!.id,
        amountInCents: 12_345,
        dayOfMonth: 28,
        startMonth: shift(-2),
        active: true,
      };
      const competences = async (id: string) =>
        (
          await pool.query<{ competence: string; dueDate: string }>(
            `SELECT competence, due_date::text AS "dueDate" FROM payables
             WHERE clinic_id = $1 AND recurring_payable_id = $2 ORDER BY competence`,
            [clinicId, id],
          )
        ).rows;

      const running = await repository.createRecurringPayable(clinicId, ownerId, base);
      const paused = await repository.createRecurringPayable(clinicId, ownerId, {
        ...base,
        active: false,
      });
      const ended = await repository.createRecurringPayable(clinicId, ownerId, {
        ...base,
        startMonth: shift(-3),
        endMonth: shift(-2),
      });
      expect(running).toMatchObject({ dayOfMonth: 28, startMonth: shift(-2), active: true });
      expect(ended.endMonth).toBe(shift(-2));

      // Duas aberturas simultâneas do financeiro não duplicam competências.
      await Promise.all([
        repository.generateDueRecurringPayables(clinicId, ownerId),
        repository.generateDueRecurringPayables(clinicId, ownerId),
      ]);
      expect(await competences(running.id)).toEqual([
        { competence: shift(-2), dueDate: `${shift(-2)}-28` },
        { competence: shift(-1), dueDate: `${shift(-1)}-28` },
        { competence: current, dueDate: `${current}-28` },
      ]);
      expect(await competences(paused.id)).toEqual([]);
      expect((await competences(ended.id)).map((row) => row.competence)).toEqual([
        shift(-3),
        shift(-2),
      ]);
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      expect(await competences(running.id)).toHaveLength(3);
      const generated = (await repository.getFinancialWorkspace(clinicId)).payables.find(
        (item) => item.recurringPayableId === running.id && item.competence === current,
      );
      expect(generated).toMatchObject({
        description: recurringPayableMarker,
        supplier: "Fornecedor PG",
        amountInCents: 12_345,
        status: "open",
      });

      // Reativar gera só a partir do mês da reativação.
      const resumed = await repository.updateRecurringPayable(clinicId, ownerId, paused.id, {
        ...base,
        amountInCents: 20_000,
      });
      expect(resumed).toMatchObject({ active: true, resumedFromMonth: current, amountInCents: 20_000 });
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      expect((await competences(paused.id)).map((row) => row.competence)).toEqual([current]);

      // Pausar não apaga o que já foi gerado.
      await repository.updateRecurringPayable(clinicId, ownerId, running.id, {
        ...base,
        active: false,
      });
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      expect(await competences(running.id)).toHaveLength(3);

      const listed = (await repository.listRecurringPayables(clinicId)).filter(
        (item) => item.description === recurringPayableMarker,
      );
      expect(listed).toHaveLength(3);
      expect(listed.find((item) => item.id === running.id)).toMatchObject({
        active: false,
        lastCompetence: current,
      });
      await expect(
        repository.deleteRecurringPayable(clinicId, running.id),
      ).rejects.toMatchObject({ code: "RECURRING_PAYABLE_IN_USE", statusCode: 409 });
      const unused = await repository.createRecurringPayable(clinicId, ownerId, {
        ...base,
        startMonth: shift(12),
      });
      expect(await repository.deleteRecurringPayable(clinicId, unused.id)).toBe(true);
      expect(await repository.deleteRecurringPayable(clinicId, unused.id)).toBe(false);
      expect(
        await repository.updateRecurringPayable(clinicId, ownerId, unused.id, base),
      ).toBeNull();
    } finally {
      await cleanupRecurringPayables();
    }
  });

  it("records a patient export in the administrative audit", async () => {
    await cleanupExportAudit();
    try {
      await repository.recordAdminAuditEvent(clinicId, ownerId, "patients.exported", "patient", {
        marker: exportAuditMarker,
        format: "csv",
        columns: ["fullName"],
        filters: { tags: ["vip"] },
        count: 3,
      });
      const events = await repository.listAdminAuditEvents(clinicId);
      const event = events.find(
        (item) => item.action === "patients.exported" && item.metadata.marker === exportAuditMarker,
      );
      expect(event).toMatchObject({
        entityType: "patient",
        actorName: expect.any(String),
        metadata: { format: "csv", columns: ["fullName"], filters: { tags: ["vip"] }, count: 3 },
      });
      expect(event?.entityId).toBeUndefined();
      expect(
        (await repository.listAdminAuditEvents("99999999-9999-4999-8999-999999999999")).some(
          (item) => item.metadata.marker === exportAuditMarker,
        ),
      ).toBe(false);
    } finally {
      await cleanupExportAudit();
    }
  });

  it("persists job title and per-user modules and audits permission changes", async () => {
    await cleanupPermissionsUser();
    try {
      const created = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Permissões",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
          jobTitle: "Instrutora de Pilates",
        },
        "hash-de-teste",
      );
      // Usuário comum novo começa sem nenhum módulo.
      expect(created).toMatchObject({
        jobTitle: "Instrutora de Pilates",
        customModules: false,
        modules: [],
        editModules: [],
      });
      const base = { fullName: "Teste Permissões", role: "user" as const, active: true };
      const custom = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        modules: ["finance", "agenda", "finance"],
      });
      expect(custom).toMatchObject({ customModules: true, modules: ["agenda", "finance"] });
      const kept = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        jobTitle: "",
      });
      expect(kept).toMatchObject({ modules: ["agenda", "finance"] });
      expect(kept?.jobTitle).toBeUndefined();
      const stored = await pool.query<{ modules: string[] | null; job_title: string | null }>(
        "SELECT modules, job_title FROM users WHERE id = $1",
        [created.id],
      );
      expect(stored.rows[0]).toEqual({ modules: ["agenda", "finance"], job_title: null });
      const reset = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        modules: null,
      });
      expect(reset).toMatchObject({ customModules: false, modules: [] });
      expect((await repository.findUserById(clinicId, created.id))?.modules).toEqual([]);
      const promoted = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        role: "admin",
        modules: ["agenda"],
      });
      expect(promoted).toMatchObject({ role: "admin", customModules: false });
      expect(promoted?.modules).toEqual(appModuleSchema.options);
      const promotedRow = await pool.query<{ role: string; modules: string[] | null }>(
        "SELECT role, modules FROM users WHERE id = $1",
        [created.id],
      );
      expect(promotedRow.rows[0]).toEqual({ role: "admin", modules: null });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) => item.action === "users.permissions_updated" && item.entityId === created.id,
      );
      expect(events).toHaveLength(2);
    } finally {
      await cleanupPermissionsUser();
    }
  });

  it("persists per-user edit levels inside the visible modules", async () => {
    await cleanupPermissionsUser();
    try {
      const created = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Permissões",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
          modules: [...legacyRoleDefaultModules.physiotherapist],
        },
        "hash-de-teste",
      );
      expect(created).toMatchObject({ customModules: true, editModules: [] });
      const base = { fullName: "Teste Permissões", role: "user" as const, active: true };
      const custom = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        editModules: ["patients", "finance", "clinical", "patients"],
      });
      expect(custom).toMatchObject({ customModules: true, editModules: ["patients", "clinical"] });
      const stored = await pool.query<{ modules: string[] | null; edit_modules: string[] | null }>(
        "SELECT modules, edit_modules FROM users WHERE id = $1",
        [created.id],
      );
      expect(stored.rows[0]).toEqual({
        modules: ["agenda", "groups", "patients", "plans", "clinical"],
        edit_modules: ["patients", "clinical"],
      });
      const narrowed = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        modules: ["agenda", "clinical"],
      });
      expect(narrowed).toMatchObject({ modules: ["agenda", "clinical"], editModules: ["clinical"] });
      expect((await repository.findUserById(clinicId, created.id))?.editModules).toEqual([
        "clinical",
      ]);
      const reset = await repository.updateAdminUser(clinicId, ownerId, created.id, {
        ...base,
        modules: null,
        editModules: null,
      });
      expect(reset).toMatchObject({ customModules: false, modules: [], editModules: [] });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) => item.action === "users.permissions_updated" && item.entityId === created.id,
      );
      expect(events).toHaveLength(4);
    } finally {
      await cleanupPermissionsUser();
    }
  });

  it("refuses to demote or deactivate the last active admin of a clinic", async () => {
    const lonelyClinic = "0f550000-0000-4000-8000-000000000055";
    const cleanup = async () => {
      await pool.query("DELETE FROM audit_events WHERE clinic_id = $1", [lonelyClinic]);
      await pool.query("DELETE FROM users WHERE clinic_id = $1", [lonelyClinic]);
      await pool.query("DELETE FROM clinics WHERE id = $1", [lonelyClinic]);
    };
    await cleanup();
    try {
      await pool.query("INSERT INTO clinics (id, name) VALUES ($1, $2)", [
        lonelyClinic,
        "Clínica T055",
      ]);
      const admin = await repository.createAdminUser(
        lonelyClinic,
        ownerId,
        {
          fullName: "Única Admin",
          email: "t055-admin@movimenta.local",
          role: "admin",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      const other = await repository.createAdminUser(
        lonelyClinic,
        ownerId,
        {
          fullName: "Outra Pessoa",
          email: "t055-user@movimenta.local",
          role: "user",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      const base = { fullName: "Única Admin", role: "admin" as const, active: true };
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, { ...base, role: "user" }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, { ...base, active: false }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      expect(await repository.findUserById(lonelyClinic, admin.id)).toMatchObject({
        role: "admin",
        active: true,
      });
      await repository.updateAdminUser(lonelyClinic, admin.id, other.id, {
        fullName: "Outra Pessoa",
        role: "admin",
        active: true,
      });
      expect(
        await repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          role: "user",
        }),
      ).toMatchObject({ role: "user", modules: [] });
    } finally {
      await cleanup();
    }
  });

  it("migration 0042 turns the legacy profiles into admin/user without changing access", async () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../migrations/0042_user_types.sql", import.meta.url)),
      "utf8",
    );
    const legacyUsers: Array<{
      id: string;
      role: LegacyRole;
      modules: AppModule[] | null;
      editModules: AppModule[] | null;
    }> = [
      { id: "owner", role: "owner", modules: null, editModules: null },
      { id: "reception", role: "reception", modules: null, editModules: null },
      { id: "physiotherapist", role: "physiotherapist", modules: null, editModules: null },
      { id: "finance", role: "finance", modules: null, editModules: null },
      { id: "reception-custom", role: "reception", modules: ["agenda", "finance"], editModules: null },
      { id: "physio-edit", role: "physiotherapist", modules: null, editModules: ["patients", "clinical"] },
      { id: "finance-empty", role: "finance", modules: [], editModules: [] },
    ];
    // Esquema temporário com a tabela como estava antes da 0042; tudo desfeito no ROLLBACK.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA t055_migration");
      await client.query("SET LOCAL search_path TO t055_migration");
      await client.query(
        "CREATE TYPE user_role AS ENUM ('owner', 'reception', 'physiotherapist', 'finance')",
      );
      await client.query(
        `CREATE TABLE users (id text PRIMARY KEY, role user_role NOT NULL,
           modules text[] NULL, edit_modules text[] NULL)`,
      );
      for (const user of legacyUsers)
        await client.query(
          "INSERT INTO users (id, role, modules, edit_modules) VALUES ($1, $2, $3, $4)",
          [user.id, user.role, user.modules, user.editModules],
        );
      await client.query(sql);
      await client.query(sql); // pode rodar de novo sem erro nem efeito
      const migrated = await client.query<{
        id: string;
        role: "admin" | "user";
        modules: AppModule[] | null;
        editModules: AppModule[] | null;
      }>('SELECT id, role, modules, edit_modules AS "editModules" FROM users');
      expect(migrated.rows).toHaveLength(legacyUsers.length);
      for (const before of legacyUsers) {
        const after = migrated.rows.find((row) => row.id === before.id)!;
        expect(after.role).toBe(before.role === "owner" ? "admin" : "user");
        expect(after, before.id).toMatchObject(migrateLegacyUser(before));
        expect(effectiveModules(after.role, after.modules)).toEqual(
          legacyEffectiveModules(before.role, before.modules),
        );
        expect(effectiveEditModules(after.role, after.modules, after.editModules)).toEqual(
          legacyEffectiveEditModules(before.role, before.modules, before.editModules),
        );
      }
      const column = await client.query<{ data_type: string }>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 't055_migration' AND table_name = 'users' AND column_name = 'role'`,
      );
      expect(column.rows[0]?.data_type).toBe("text");
      await client.query("SAVEPOINT legacy_value");
      await expect(
        client.query("INSERT INTO users (id, role) VALUES ('late', 'reception')"),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT legacy_value");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("stores the demo admin as admin after the migrations", async () => {
    const owner = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [
      ownerId,
    ]);
    expect(owner.rows[0]?.role).toBe("admin");
    expect(await repository.findUserById(clinicId, ownerId)).toMatchObject({
      role: "admin",
      modules: appModuleSchema.options,
    });
  });

  it("links a user to one professional and reads the commission rule in force today", async () => {
    const crefitos = ["PG-T050-A", "PG-T050-B"];
    const cleanup = async () => {
      const professionals = `SELECT id FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`;
      await pool.query(
        `DELETE FROM commission_rules WHERE clinic_id = $1 AND professional_id IN (${professionals})`,
        [clinicId, crefitos],
      );
      await pool.query(`DELETE FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`, [
        clinicId,
        crefitos,
      ]);
      await cleanupPermissionsUser();
    };
    await cleanup();
    try {
      const [first, second] = await Promise.all(
        crefitos.map(async (crefito, index) => {
          const inserted = await pool.query<{ id: string }>(
            `INSERT INTO professionals (clinic_id, full_name, crefito, specialty, color)
             VALUES ($1, $2, $3, 'Pilates', '#5c6f68') RETURNING id`,
            [clinicId, `Profissional T050 ${index}`, crefito],
          );
          return inserted.rows[0]!.id;
        }),
      );
      const user = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Comissão",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      await expect(
        repository.setAdminUserCommission(clinicId, ownerId, user.id, {
          percentage: 30,
          effectiveFrom: "2001-01-01",
        }),
      ).rejects.toMatchObject({ code: "USER_NOT_PROFESSIONAL" });
      await expect(
        repository.setAdminUserProfessional(
          clinicId,
          ownerId,
          user.id,
          "99999999-9999-4999-8999-999999999999",
        ),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_NOT_FOUND" });
      expect(
        await repository.setAdminUserProfessional(
          clinicId,
          ownerId,
          "99999999-9999-4999-8999-999999999999",
          first!,
        ),
      ).toBeNull();

      const linked = await repository.setAdminUserProfessional(clinicId, ownerId, user.id, first!);
      expect(linked).toMatchObject({ professionalId: first, professionalName: "Profissional T050 0" });
      await expect(
        repository.setAdminUserProfessional(clinicId, ownerId, ownerId, first!),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_ALREADY_LINKED" });

      await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 35.5,
        effectiveFrom: "2001-01-01",
      });
      const withFuture = await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 50,
        effectiveFrom: "2999-01-01",
      });
      expect(withFuture).toMatchObject({
        commissionPercentage: 35.5,
        commissionEffectiveFrom: "2001-01-01",
      });
      await expect(
        repository.setAdminUserCommission(clinicId, ownerId, user.id, {
          percentage: 40,
          effectiveFrom: "2001-01-01",
        }),
      ).rejects.toMatchObject({ code: "COMMISSION_RULE_DUPLICATE" });
      const listed = (await repository.listAdminUsers(clinicId)).find((item) => item.id === user.id);
      expect(listed).toMatchObject({ professionalId: first, commissionPercentage: 35.5 });

      // Trocar a ligação libera o profissional anterior; desligar remove a comissão do usuário.
      const switched = await repository.setAdminUserProfessional(clinicId, ownerId, user.id, second!);
      expect(switched).toMatchObject({ professionalId: second });
      expect(switched?.commissionPercentage).toBeUndefined();
      const links = await pool.query<{ id: string; user_id: string | null }>(
        `SELECT id, user_id FROM professionals WHERE id = ANY($1) ORDER BY crefito`,
        [[first, second]],
      );
      expect(links.rows.map((row) => row.user_id)).toEqual([null, user.id]);
      const unlinked = await repository.setAdminUserProfessional(clinicId, ownerId, user.id, null);
      expect(unlinked?.professionalId).toBeUndefined();

      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.entityId === user.id &&
          ["users.professional_updated", "users.commission_updated"].includes(item.action),
      );
      expect(events).toHaveLength(5);
    } finally {
      await cleanup();
    }
  });

  it("queues a broadcast as manual outbox messages in one transaction", async () => {
    const broadcastPhone = "11977770391";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM outbound_messages WHERE patient_id IN
         (SELECT id FROM patients WHERE clinic_id = $1 AND phone = $2)`,
        [clinicId, broadcastPhone],
      );
      await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND phone = $2", [
        clinicId,
        broadcastPhone,
      ]);
    };
    await cleanup();
    try {
      const patient = await repository.createPatient(clinicId, {
        fullName: "Cliente Comunicado PG",
        phone: broadcastPhone,
        email: "comunicado.pg@example.com",
        tags: [],
      });
      expect(await repository.queueBroadcastMessages(clinicId, [])).toBe(0);
      expect(
        await repository.queueBroadcastMessages(clinicId, [
          {
            patientId: patient.id,
            channel: "email",
            recipient: "comunicado.pg@example.com",
            body: "Oi, Cliente!",
          },
        ]),
      ).toBe(1);
      // Destinatário de outra clínica (ou inexistente) desfaz o lote inteiro.
      await expect(
        repository.queueBroadcastMessages(clinicId, [
          { patientId: patient.id, channel: "whatsapp", recipient: broadcastPhone, body: "Oi" },
          {
            patientId: "12121212-1212-4121-8121-121212121212",
            channel: "whatsapp",
            recipient: "11900000000",
            body: "Oi",
          },
        ]),
      ).rejects.toMatchObject({ code: "PATIENT_NOT_FOUND" });
      const rows = await pool.query<{
        kind: string;
        channel: string;
        recipient: string;
        body: string;
        status: string;
        idempotency_key: string;
      }>(
        `SELECT kind, channel, recipient, body, status, idempotency_key
         FROM outbound_messages WHERE clinic_id = $1 AND patient_id = $2`,
        [clinicId, patient.id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        kind: "manual",
        channel: "email",
        recipient: "comunicado.pg@example.com",
        body: "Oi, Cliente!",
        status: "queued",
      });
      expect(rows.rows[0]!.idempotency_key).toMatch(/^broadcast:/);
    } finally {
      await cleanup();
    }
  });
});
