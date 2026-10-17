import { appointmentStatusSchema, saoPauloToday } from "@crm/contracts";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import { DomainError } from "../../../repository.js";
import {
  appointmentMarker,
  birthdayCpf,
  clinicId,
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

  it("stores the professionals and rooms of a service", async () => {
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const name = `PG serviço vinculado ${Date.now()}`;
    try {
      const created = await repository.createService(clinicId, {
        name,
        durationMinutes: 50,
        priceInCents: 9000,
        color: "#547A6B",
        professionalIds: [professional!.id],
        roomIds: [room!.id],
      });
      expect(created).toMatchObject({
        professionalIds: [professional!.id],
        roomIds: [room!.id],
      });
      const listed = (await repository.listServices(clinicId)).find(
        (item) => item.id === created.id,
      );
      expect(listed?.professionalIds).toEqual([professional!.id]);
    } finally {
      await pool.query(
        "DELETE FROM services WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    }
  });

  it("loads the group workspace with each class's professional", async () => {
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
    );
    expect(Array.isArray(workspace.groups)).toBe(true);
    expect(Array.isArray(workspace.sessions)).toBe(true);
    for (const group of workspace.groups)
      expect(typeof group.professionalName).toBe("string");
  });

  it("lists only pending dashboard appointments even after their scheduled time", async () => {
    const ids: string[] = [];
    try {
      for (const date of ["2000-10-12", "2099-10-12"]) {
        const dayIds: string[] = [];
        for (const [
          index,
          status,
        ] of appointmentStatusSchema.options.entries()) {
          const created = await repository.createAppointment(clinicId, {
            patientId: "99999999-9999-4999-8999-999999999999",
            professionalId: "33333333-3333-4333-8333-333333333333",
            roomId: "55555555-5555-4555-8555-555555555555",
            serviceId: "77777777-7777-4777-8777-777777777777",
            startsAt: `${date}T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
            visitType: "regular",
            notes: "postgres-dashboard-test",
          });
          ids.push(created.id);
          dayIds.push(created.id);
          await pool.query(
            "UPDATE appointments SET status = $2 WHERE id = $1",
            [created.id, status],
          );
        }
        const dashboard = await repository.getDashboard(clinicId, date);
        expect(dashboard.appointmentsToday).toBe(7);
        expect(dashboard.nonCancelledAppointmentsToday).toBe(6);
        expect(dashboard.pendingToday).toBe(2);
        expect(dashboard.awaitingConfirmationToday).toBe(1);
        expect(dashboard.completedToday).toBe(1);
        expect(dashboard.nextAppointments.map((item) => item.id)).toEqual(
          dayIds.slice(0, 2),
        );
        expect(dashboard.nextAppointments.map((item) => item.status)).toEqual([
          "scheduled",
          "confirmed",
        ]);
      }
    } finally {
      await pool.query("DELETE FROM appointments WHERE id = ANY($1::uuid[])", [
        ids,
      ]);
    }
  });

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
    expect(tiradentes).toMatchObject({
      clinicId,
      date: dates[0],
      name: "Tiradentes",
    });
    await expect(
      repository.createHoliday(clinicId, { date: dates[0]!, name: "Outro" }),
    ).rejects.toMatchObject({ code: "HOLIDAY_DUPLICATE" });
    expect(
      (await repository.listHolidays(clinicId, "2099-01-01", "2099-12-31")).map(
        (item) => item.id,
      ),
    ).toEqual([tiradentes.id, labor.id]);
    expect(
      await repository.listHolidays(clinicId, "2099-04-22", "2099-05-01"),
    ).toEqual([labor]);
    expect(
      (await repository.listHolidays(clinicId)).map((item) => item.id),
    ).toEqual(expect.arrayContaining([tiradentes.id, labor.id]));
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(true);
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(false);
    expect(await repository.deleteHoliday(clinicId, labor.id)).toBe(true);
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
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const survey = await repository.createSatisfactionSurvey(
      clinicId,
      ownerId,
      {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 9,
        comment: "Gostei muito.",
      },
    );
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
    const mine = (
      await repository.listSatisfactionSurveys(clinicId, {
        from: today,
        to: today,
      })
    ).filter((item) => item.patientId === patient.id);
    expect(mine.map((item) => item.id)).toEqual([loose.id, survey.id]);
    expect(
      (
        await repository.listSatisfactionSurveys(clinicId, { to: "2000-01-01" })
      ).filter((item) => item.patientId === patient.id),
    ).toEqual([]);
  });
});
