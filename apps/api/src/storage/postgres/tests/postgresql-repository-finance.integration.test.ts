import { appModuleSchema, saoPauloToday } from "@crm/contracts";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  appointmentMarker,
  birthdayCpf,
  clinicId,
  dailyCashDay,
  dailyCashMarker,
  databaseUrl,
  duplicateCpf,
  exportAuditMarker,
  financeClassificationMarker,
  leadAppointmentDay,
  leadAppointmentMarker,
  leadAppointmentPhone,
  leadConversionMarker,
  leadConversionPhones,
  ownerId,
  permissionsUserEmail,
  recurringPayableMarker,
  relationshipCpf,
  renewalMarker,
  rescheduleMarker,
  salesMarker,
  satisfactionCpf,
  satisfactionMarker,
  testCpf,
  timelineCpf,
  timelineMarker,
  trialConversionMarker,
  trialConversionPhones,
} from "../../../test-support/postgres-fixtures.js";
import "../../../test-support/postgres-setup.js";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;

  let repository: PostgresClinicRepository;

  const templateIds: string[] = [];

  async function configuredPlan<
    const T extends {
      name: string;
      totalValueInCents: number;
      serviceId: string;
      totalSessions: number;
    },
  >(input: T) {
    const services = [
      {
        serviceId: input.serviceId,
        totalSessions: input.totalSessions,
        totalValueInCents: input.totalValueInCents,
      },
    ];
    const template = await repository.createPlanTemplate(clinicId, ownerId, {
      name: input.name,
      totalValueInCents: input.totalValueInCents,
      services,
    });
    templateIds.push(template.id);
    return { ...input, services, planTemplateId: template.id };
  }

  async function cleanupRecurringPayables() {
    const models = `SELECT id FROM recurring_payables WHERE clinic_id = $1 AND description = $2`;
    await pool.query(
      `DELETE FROM payable_events WHERE payable_id IN
       (SELECT id FROM payables WHERE recurring_payable_id IN (${models}))`,
      [clinicId, recurringPayableMarker],
    );
    await pool.query(
      `DELETE FROM payables WHERE recurring_payable_id IN (${models})`,
      [clinicId, recurringPayableMarker],
    );
    await pool.query(
      "DELETE FROM recurring_payables WHERE clinic_id = $1 AND description = $2",
      [clinicId, recurringPayableMarker],
    );
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
    const plans =
      "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${plans}))`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (${plans})`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(`DELETE FROM receivables WHERE plan_id IN (${plans})`, [
      clinicId,
      dailyCashMarker,
    ]);
    await pool.query(
      "DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2",
      [clinicId, dailyCashMarker],
    );
    const payables =
      "SELECT id FROM payables WHERE clinic_id = $1 AND description = $2";
    await pool.query(
      `DELETE FROM payable_events WHERE payable_id IN (${payables})`,
      [clinicId, dailyCashMarker],
    );
    await pool.query(
      "DELETE FROM payables WHERE clinic_id = $1 AND description = $2",
      [clinicId, dailyCashMarker],
    );
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
    const planFilter =
      "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
         (SELECT id FROM receivables WHERE plan_id IN (${planFilter}))`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (${planFilter})`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      `DELETE FROM receivables WHERE plan_id IN (${planFilter})`,
      [clinicId, trialConversionMarker],
    );
    await pool.query(
      "DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2",
      [clinicId, trialConversionMarker],
    );
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
        ssl:
          (process.env.DATABASE_SSL as
            "auto" | "disable" | "require" | "verify" | undefined) ?? "auto",
        ...(process.env.DATABASE_SSL_CA
          ? { caCertPath: process.env.DATABASE_SSL_CA }
          : {}),
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
    await pool.query(
      `DELETE FROM commission_entries WHERE clinic_id = $1 AND rule_id IN
         (SELECT id FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids}))`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `DELETE FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `UPDATE professionals SET user_id = NULL WHERE clinic_id = $1 AND user_id IN (${ids})`,
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
    await pool.query(
      "DELETE FROM financial_categories WHERE clinic_id = $1 AND name = $2",
      [clinicId, financeClassificationMarker],
    );
    await pool.query(
      "DELETE FROM cost_centers WHERE clinic_id = $1 AND name = $2",
      [clinicId, financeClassificationMarker],
    );
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
    // Surveys can belong to other seeded patients; remove references to these
    // fixture appointments before deleting the appointments themselves.
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE appointment_id IN
       (SELECT id FROM appointments WHERE clinic_id = $1 AND notes = ANY($2::text[]))`,
      [
        clinicId,
        [
          appointmentMarker,
          rescheduleMarker,
          satisfactionMarker,
          timelineMarker,
        ],
      ],
    );
    await pool.query("DELETE FROM appointments WHERE notes = ANY($1::text[])", [
      [appointmentMarker, rescheduleMarker, satisfactionMarker, timelineMarker],
    ]);
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [relationshipCpf, birthdayCpf, timelineCpf]],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[])",
      [
        clinicId,
        [
          testCpf,
          duplicateCpf,
          relationshipCpf,
          birthdayCpf,
          satisfactionCpf,
          timelineCpf,
        ],
      ],
    );
    await pool.query("DELETE FROM relationship_settings WHERE clinic_id = $1", [
      clinicId,
    ]);
    await pool.query(
      "DELETE FROM plan_templates WHERE id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM patient_plans WHERE plan_template_id=plan_templates.id)",
      [templateIds],
    );
    await pool.end();
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
      new Date(
        leadAppointmentDay.getTime() + hours * 60 * 60 * 1000,
      ).toISOString();
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
    const trial = await repository.createLeadAppointment(
      clinicId,
      lead.id,
      input,
    );
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
        [
          clinicId,
          input.professionalId,
          input.roomId,
          input.serviceId,
          at(5),
          at(6),
          leadAppointmentMarker,
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `INSERT INTO appointments (clinic_id, patient_id, lead_id, professional_id, room_id, service_id, starts_at, ends_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          clinicId,
          patients[0]!.id,
          lead.id,
          input.professionalId,
          input.roomId,
          input.serviceId,
          at(5),
          at(6),
          leadAppointmentMarker,
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Finalizar não consome sessão de plano algum.
    const plansBefore = await repository.listPatientPlans(clinicId);
    const completed = await repository.updateAppointmentStatus(
      clinicId,
      trial!.id,
      "completed",
    );
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
    expect(upcoming).toMatchObject({
      leadId: lead.id,
      visitType: "evaluation",
    });
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
    expect(
      commissions.find((item) => item.appointmentId === trial!.id),
    ).toBeUndefined();

    // Sugestões e linha do tempo leem a agenda sem quebrar e sem o lead.
    const suggestions = await repository.listContactSuggestions(
      clinicId,
      appModuleSchema.options,
    );
    expect(JSON.stringify(suggestions)).not.toContain(trial!.id);
    const timeline = await repository.getPatientTimeline(
      clinicId,
      patients[0]!.id,
    );
    expect(JSON.stringify(timeline)).not.toContain(trial!.id);

    // Relatório gerencial (agenda) conta pelo tipo.
    const report = await repository.getManagementReport(
      clinicId,
      referenceDate,
      referenceDate,
    );
    expect(report.appointments.byVisitType.trial).toBeGreaterThanOrEqual(1);
    expect(report.appointments.byVisitType.evaluation).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("builds the PostgreSQL daily cash by event date in the clinic time zone", async () => {
    await cleanupDailyCash();
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const [category, costCenter] = await testFinanceClassification();
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 1,
            totalValueInCents: 12_000,
          },
        ],
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: dailyCashMarker,
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: dailyCashDay,
        totalValueInCents: 12_000,
        installments: 1,
        firstDueDate: dailyCashDay,
      }),
    );
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
    await pool.query(
      "UPDATE payables SET paid_at = $2::timestamptz WHERE id = $1",
      [payable.id, `${dailyCashDay}T15:00:00.000Z`],
    );

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
    expect(following.movements.filter((item) => ownIds.has(item.id))).toEqual(
      [],
    );
    await cleanupDailyCash();
  });

  it("lists PostgreSQL payments and reversals by event date in the clinic time zone", async () => {
    await cleanupDailyCash();
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 1,
            totalValueInCents: 12_000,
          },
        ],
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: dailyCashMarker,
        kind: "fixed_package",
        totalSessions: 1,
        validFrom: dailyCashDay,
        totalValueInCents: 12_000,
        installments: 1,
        firstDueDate: dailyCashDay,
      }),
    );
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
      await pool.query(
        "UPDATE financial_events SET created_at = $2::timestamptz WHERE id = $1",
        [row.id, moves[index]],
      );

    const anotherInstance = new PostgresClinicRepository(pool);
    const onDay = (
      await anotherInstance.listReceivedPayments(
        clinicId,
        dailyCashDay,
        dailyCashDay,
      )
    ).filter((item) => item.receivableId === receivableId);
    expect(
      onDay.map((item) => [
        item.kind,
        Math.abs(item.amountInCents),
        item.occurredAt,
      ]),
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
      await anotherInstance.listReceivedPayments(
        clinicId,
        dailyCashDay,
        nextDate,
      )
    ).filter((item) => item.receivableId === receivableId);
    expect(both).toHaveLength(3);
    await cleanupDailyCash();
  });

  it("generates fixed expenses once per competence, respecting pause and end month", async () => {
    await cleanupRecurringPayables();
    try {
      const [category, costCenter] = await testFinanceClassification();
      const current = saoPauloToday().slice(0, 7);
      const shift = (months: number) => {
        const [year, month] = current.split("-").map(Number);
        return new Date(Date.UTC(year!, month! - 1 + months, 1))
          .toISOString()
          .slice(0, 7);
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

      const running = await repository.createRecurringPayable(
        clinicId,
        ownerId,
        base,
      );
      const paused = await repository.createRecurringPayable(
        clinicId,
        ownerId,
        {
          ...base,
          active: false,
        },
      );
      const ended = await repository.createRecurringPayable(clinicId, ownerId, {
        ...base,
        startMonth: shift(-3),
        endMonth: shift(-2),
      });
      expect(running).toMatchObject({
        dayOfMonth: 28,
        startMonth: shift(-2),
        active: true,
      });
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
      expect(
        (await competences(ended.id)).map((row) => row.competence),
      ).toEqual([shift(-3), shift(-2)]);
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      expect(await competences(running.id)).toHaveLength(3);
      const generated = (
        await repository.getFinancialWorkspace(clinicId)
      ).payables.find(
        (item) =>
          item.recurringPayableId === running.id && item.competence === current,
      );
      expect(generated).toMatchObject({
        description: recurringPayableMarker,
        supplier: "Fornecedor PG",
        amountInCents: 12_345,
        status: "open",
      });

      // Reativar gera só a partir do mês da reativação.
      const resumed = await repository.updateRecurringPayable(
        clinicId,
        ownerId,
        paused.id,
        {
          ...base,
          amountInCents: 20_000,
        },
      );
      expect(resumed).toMatchObject({
        active: true,
        resumedFromMonth: current,
        amountInCents: 20_000,
      });
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      expect(
        (await competences(paused.id)).map((row) => row.competence),
      ).toEqual([current]);

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
      ).rejects.toMatchObject({
        code: "RECURRING_PAYABLE_IN_USE",
        statusCode: 409,
      });
      const unused = await repository.createRecurringPayable(
        clinicId,
        ownerId,
        {
          ...base,
          startMonth: shift(12),
        },
      );
      expect(await repository.deleteRecurringPayable(clinicId, unused.id)).toBe(
        true,
      );
      expect(await repository.deleteRecurringPayable(clinicId, unused.id)).toBe(
        false,
      );
      expect(
        await repository.updateRecurringPayable(
          clinicId,
          ownerId,
          unused.id,
          base,
        ),
      ).toBeNull();
    } finally {
      await cleanupRecurringPayables();
    }
  });

  it("links a user to one professional and reads the commission rule in force today", async () => {
    const crefitos = ["PG-T050-A", "PG-T050-B"];
    const cleanup = async () => {
      const professionals = `SELECT id FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`;
      await pool.query(
        `DELETE FROM commission_rules WHERE clinic_id = $1 AND professional_id IN (${professionals})`,
        [clinicId, crefitos],
      );
      await pool.query(
        `DELETE FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`,
        [clinicId, crefitos],
      );
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
      // A comissão é do usuário: não exige profissional ligado.
      expect(
        await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
          percentage: 30,
          effectiveFrom: "2000-01-01",
        }),
      ).toMatchObject({
        commissionPercentage: 30,
        commissionEffectiveFrom: "2000-01-01",
      });
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

      const linked = await repository.setAdminUserProfessional(
        clinicId,
        ownerId,
        user.id,
        first!,
      );
      expect(linked).toMatchObject({
        professionalId: first,
        professionalName: "Profissional T050 0",
      });
      await expect(
        repository.setAdminUserProfessional(clinicId, ownerId, ownerId, first!),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_ALREADY_LINKED" });

      await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 35.5,
        effectiveFrom: "2001-01-01",
      });
      const withFuture = await repository.setAdminUserCommission(
        clinicId,
        ownerId,
        user.id,
        {
          percentage: 50,
          effectiveFrom: "2999-01-01",
        },
      );
      expect(withFuture).toMatchObject({
        commissionPercentage: 35.5,
        commissionEffectiveFrom: "2001-01-01",
      });
      // Mesma vigência e mesmo valor: nada muda (sem auditoria).
      expect(
        await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
          percentage: 35.5,
          effectiveFrom: "2001-01-01",
        }),
      ).toMatchObject({
        commissionPercentage: 35.5,
        commissionEffectiveFrom: "2001-01-01",
      });
      const listed = (await repository.listAdminUsers(clinicId)).find(
        (item) => item.id === user.id,
      );
      expect(listed).toMatchObject({
        professionalId: first,
        commissionPercentage: 35.5,
      });

      // A regra do usuário não aparece como regra do profissional no Financeiro.
      const professionalRules = await pool.query(
        "SELECT id FROM commission_rules WHERE professional_id = $1",
        [first],
      );
      expect(professionalRules.rows).toHaveLength(0);

      // Trocar a ligação libera o profissional anterior; a comissão acompanha o usuário.
      const switched = await repository.setAdminUserProfessional(
        clinicId,
        ownerId,
        user.id,
        second!,
      );
      expect(switched).toMatchObject({
        professionalId: second,
        commissionPercentage: 35.5,
      });
      const links = await pool.query<{ id: string; user_id: string | null }>(
        `SELECT id, user_id FROM professionals WHERE id = ANY($1) ORDER BY crefito`,
        [[first, second]],
      );
      expect(links.rows.map((row) => row.user_id)).toEqual([null, user.id]);
      const unlinked = await repository.setAdminUserProfessional(
        clinicId,
        ownerId,
        user.id,
        null,
      );
      expect(unlinked?.professionalId).toBeUndefined();
      expect(unlinked?.commissionPercentage).toBe(35.5);

      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.entityId === user.id &&
          ["users.professional_updated", "users.commission_updated"].includes(
            item.action,
          ),
      );
      expect(events).toHaveLength(6);
    } finally {
      await cleanup();
    }
  });

  it("creates a user with a commission and generates with the user's rule before the professional's", async () => {
    const crefitos = ["PG-T057-A", "PG-T057-B"];
    const marker = "postgres-t057-commission-test";
    const cleanup = async () => {
      const professionals = `SELECT id FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`;
      await pool.query(
        `DELETE FROM commission_entries WHERE clinic_id = $1 AND appointment_id IN
           (SELECT id FROM appointments WHERE clinic_id = $1 AND notes = $2)`,
        [clinicId, marker],
      );
      await pool.query(
        "DELETE FROM appointments WHERE clinic_id = $1 AND notes = $2",
        [clinicId, marker],
      );
      await pool.query(
        `DELETE FROM commission_rules WHERE clinic_id = $1 AND professional_id IN (${professionals})`,
        [clinicId, crefitos],
      );
      await cleanupPermissionsUser();
      await pool.query(
        `DELETE FROM professionals WHERE clinic_id = $1 AND crefito = ANY($2)`,
        [clinicId, crefitos],
      );
    };
    await cleanup();
    try {
      const [linkedProfessional, freeProfessional] = await Promise.all(
        crefitos.map(async (crefito, index) => {
          const inserted = await pool.query<{ id: string }>(
            `INSERT INTO professionals (clinic_id, full_name, crefito, specialty, color)
             VALUES ($1, $2, $3, 'Pilates', '#5c6f68') RETURNING id`,
            [clinicId, `Profissional T057 ${index}`, crefito],
          );
          return inserted.rows[0]!.id;
        }),
      );
      await repository.createCommissionRule(clinicId, {
        professionalId: linkedProfessional!,
        percentage: 10,
        effectiveFrom: "2097-01-01",
      });
      await repository.createCommissionRule(clinicId, {
        professionalId: freeProfessional!,
        percentage: 20,
        effectiveFrom: "2097-01-01",
      });
      await expect(
        repository.createAdminUser(
          clinicId,
          ownerId,
          {
            fullName: "Teste Comissão",
            email: permissionsUserEmail,
            role: "user",
            password: "Segura@1234",
            commission: { percentage: 35, effectiveFrom: "2097-05-15" },
          },
          "hash-de-teste",
        ),
      ).resolves.toMatchObject({ email: permissionsUserEmail });
      const user = (await repository.listAdminUsers(clinicId)).find(
        (item) => item.email === permissionsUserEmail,
      )!;
      // Vigência futura: gravada, ainda não vale hoje.
      expect(user.commissionPercentage).toBeUndefined();
      await repository.setAdminUserProfessional(
        clinicId,
        ownerId,
        user.id,
        linkedProfessional!,
      );
      const audit = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.entityId === user.id &&
          item.action === "users.commission_updated",
      );
      expect(audit.map((item) => item.metadata)).toEqual([
        expect.objectContaining({
          percentage: 35,
          effectiveFrom: "2097-05-15",
        }),
      ]);

      const [patients, rooms, services] = await Promise.all([
        repository.listPatients(clinicId),
        repository.listRooms(clinicId),
        repository.listServices(clinicId),
      ]);
      const appointment = async (professionalId: string, startsAt: string) => {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO appointments (clinic_id, patient_id, professional_id, room_id, service_id,
             starts_at, ends_at, notes, status)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz + interval '50 minutes', $7, 'completed')
           RETURNING id`,
          [
            clinicId,
            patients[0]!.id,
            professionalId,
            rooms[0]!.id,
            services[0]!.id,
            startsAt,
            marker,
          ],
        );
        return inserted.rows[0]!.id;
      };
      const beforeUserRule = await appointment(
        linkedProfessional!,
        "2097-05-06T15:00:00.000Z",
      );
      const withUserRule = await appointment(
        linkedProfessional!,
        "2097-05-20T15:00:00.000Z",
      );
      const unlinked = await appointment(
        freeProfessional!,
        "2097-05-20T17:00:00.000Z",
      );

      const first = await repository.generateCommissions(clinicId, "2097-05");
      const byAppointment = new Map(
        first.map((item) => [item.appointmentId, item]),
      );
      expect(byAppointment.get(beforeUserRule)).toMatchObject({
        percentage: 10,
      });
      expect(byAppointment.get(withUserRule)).toMatchObject({
        professionalId: linkedProfessional,
        percentage: 35,
      });
      expect(byAppointment.get(unlinked)).toMatchObject({ percentage: 20 });
      const second = await repository.generateCommissions(clinicId, "2097-05");
      expect(
        second.filter((item) =>
          Boolean(
            item.appointmentId &&
            [beforeUserRule, withUserRule, unlinked].includes(
              item.appointmentId,
            ),
          ),
        ),
      ).toHaveLength(3);
      expect(second).toHaveLength(first.length);

      // T060: a regra de 15/05 já tem lançamento, então não pode ser corrigida na mesma data.
      await expect(
        repository.setAdminUserCommission(clinicId, ownerId, user.id, {
          percentage: 40,
          effectiveFrom: "2097-05-15",
        }),
      ).rejects.toMatchObject({
        code: "COMMISSION_RULE_DUPLICATE",
        message:
          "Esta comissão já foi usada em lançamentos; escolha outra data de início.",
      });
      // Uma vigência sem lançamentos é corrigida no lugar (UPDATE), com auditoria antes/depois.
      await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 20,
        effectiveFrom: "2097-06-01",
      });
      await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 22.5,
        effectiveFrom: "2097-06-01",
      });
      await repository.setAdminUserCommission(clinicId, ownerId, user.id, {
        percentage: 22.5,
        effectiveFrom: "2097-06-01",
      });
      const userRules = await pool.query<{
        percentage: number;
        effective_from: string;
      }>(
        `SELECT percentage::float AS percentage, effective_from::text AS effective_from
         FROM commission_rules WHERE clinic_id = $1 AND user_id = $2 ORDER BY effective_from`,
        [clinicId, user.id],
      );
      expect(userRules.rows).toEqual([
        { percentage: 35, effective_from: "2097-05-15" },
        { percentage: 22.5, effective_from: "2097-06-01" },
      ]);
      const corrections = (
        await repository.listAdminAuditEvents(clinicId)
      ).filter(
        (item) =>
          item.entityId === user.id &&
          item.action === "users.commission_updated",
      );
      expect(corrections).toHaveLength(3);
      expect(corrections.map((item) => item.metadata)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            percentage: 22.5,
            previousPercentage: 20,
            effectiveFrom: "2097-06-01",
          }),
        ]),
      );
    } finally {
      await cleanup();
    }
  });
});
