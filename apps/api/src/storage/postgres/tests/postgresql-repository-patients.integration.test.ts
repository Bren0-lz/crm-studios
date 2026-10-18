import { legacyPermissions, saoPauloToday } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { legacyRoleDefaultModules } from "../../../modules/administration/legacy-roles.js";
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
  leadConversionDay,
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

  it("migrates legacy service terms, balances and movements and deactivates incomplete templates", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const schema = `migration_services_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query(`
        CREATE TABLE services(id uuid PRIMARY KEY, clinic_id uuid NOT NULL, name text NOT NULL);
        CREATE TABLE plan_templates(id uuid PRIMARY KEY, clinic_id uuid NOT NULL, service_id uuid, total_sessions integer CHECK(total_sessions BETWEEN 1 AND 1000), total_value_in_cents integer NOT NULL, active boolean DEFAULT true, UNIQUE(clinic_id,id));
        CREATE TABLE patient_plans(id uuid PRIMARY KEY, clinic_id uuid NOT NULL, service_id uuid NOT NULL, total_sessions integer NOT NULL, remaining_sessions integer NOT NULL, total_value_in_cents integer NOT NULL);
        CREATE TABLE session_movements(id uuid PRIMARY KEY, clinic_id uuid NOT NULL, plan_id uuid NOT NULL, quantity integer NOT NULL);
      `);
      const service = randomUUID(),
        plan = randomUUID(),
        complete = randomUUID(),
        incomplete = randomUUID(),
        movement = randomUUID();
      await client.query(
        "INSERT INTO services VALUES ($1,$2,'Serviço antigo')",
        [service, clinicId],
      );
      await client.query(
        "INSERT INTO patient_plans VALUES ($1,$2,$3,1200,1198,10001)",
        [plan, clinicId, service],
      );
      await client.query(
        "INSERT INTO plan_templates VALUES ($1,$3,$4,8,10001,true),($2,$3,NULL,NULL,20000,true)",
        [complete, incomplete, clinicId, service],
      );
      await client.query("INSERT INTO session_movements VALUES ($1,$2,$3,-1)", [
        movement,
        clinicId,
        plan,
      ]);
      await client.query(
        readFileSync(
          fileURLToPath(
            new URL(
              "../../../../migrations/0049_plan_services.sql",
              import.meta.url,
            ),
          ),
          "utf8",
        ),
      );
      expect(
        (
          await client.query(
            "SELECT service_id,service_name,total_sessions,remaining_sessions,total_value_in_cents FROM patient_plan_services",
          )
        ).rows,
      ).toEqual([
        {
          service_id: service,
          service_name: "Serviço antigo",
          total_sessions: 1200,
          remaining_sessions: 1198,
          total_value_in_cents: 10001,
        },
      ]);
      expect(
        (
          await client.query(
            "SELECT service_id,quantity FROM session_movements WHERE id=$1",
            [movement],
          )
        ).rows[0],
      ).toEqual({ service_id: service, quantity: -1 });
      expect(
        (
          await client.query("SELECT active FROM plan_templates WHERE id=$1", [
            incomplete,
          ])
        ).rows[0],
      ).toEqual({ active: false });
      expect(
        (
          await client.query(
            "SELECT total_sessions,total_value_in_cents FROM plan_template_services WHERE template_id=$1",
            [complete],
          )
        ).rows[0],
      ).toEqual({ total_sessions: 8, total_value_in_cents: 10001 });
      await client.query(
        "UPDATE plan_templates SET total_sessions=1800 WHERE id=$1",
        [complete],
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("imports historical sources once, redacts clinical contents and journals row changes atomically", async () => {
    const isolatedClinic = randomUUID();
    const patientId = randomUUID();
    const revisionId = randomUUID();
    const marker = `history-source-${randomUUID()}`;
    try {
      await pool.query("INSERT INTO clinics (id,name) VALUES ($1,$2)", [
        isolatedClinic,
        marker,
      ]);
      await pool.query(
        "INSERT INTO patients (id,clinic_id,full_name,record_number,phone) VALUES ($1,$2,$3,'HISTORY','11900000000')",
        [patientId, isolatedClinic, marker],
      );
      let page = await repository.listAdminAuditPage(
        isolatedClinic,
        undefined,
        { search: marker, module: "patients" },
      );
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        action: "patient.created",
        entityId: patientId,
      });
      await pool.query("UPDATE patients SET full_name=$2 WHERE id=$1", [
        patientId,
        `${marker}-changed`,
      ]);
      page = await repository.listAdminAuditPage(isolatedClinic, undefined, {
        module: "patients",
      });
      expect(
        page.items.some((event) => event.action === "patients.updated"),
      ).toBe(true);
      const snapshot = {
        id: revisionId,
        clinic_id: isolatedClinic,
        author_user_id: ownerId,
        clinical_record_id: randomUUID(),
        version: 2,
        created_at: "2025-01-01T12:00:00Z",
        snapshot: { subjective: "DO_NOT_COPY_CLINICAL_CONTENT" },
      };
      for (let i = 0; i < 2; i++)
        await pool.query(
          "SELECT project_system_history('clinical_record_revisions','clinical','clinical.revision','Versão de prontuário registrada',true,$1::jsonb,true)",
          [JSON.stringify(snapshot)],
        );
      page = await repository.listAdminAuditPage(isolatedClinic, undefined, {
        module: "clinical",
      });
      expect(page.items).toHaveLength(1);
      expect(JSON.stringify(page)).not.toContain(
        "DO_NOT_COPY_CLINICAL_CONTENT",
      );
      expect(
        (await repository.listAdminAuditPage(clinicId)).items.every(
          (event) => event.clinicId !== isolatedClinic,
        ),
      ).toBe(true);
      const before = (await repository.listAdminAuditPage(isolatedClinic)).items
        .length;
      const transaction = await pool.connect();
      try {
        await transaction.query("BEGIN");
        await transaction.query(
          "UPDATE patients SET full_name='rolled back' WHERE id=$1",
          [patientId],
        );
        await transaction.query("ROLLBACK");
      } finally {
        transaction.release();
      }
      expect(
        (await repository.listAdminAuditPage(isolatedClinic)).items,
      ).toHaveLength(before);
    } finally {
      await pool.query("DELETE FROM patients WHERE clinic_id=$1", [
        isolatedClinic,
      ]);
      await pool.query("DELETE FROM audit_events WHERE clinic_id=$1", [
        isolatedClinic,
      ]);
      await pool.query("DELETE FROM clinics WHERE id=$1", [isolatedClinic]);
    }
  });

  it("backfills operation permissions exactly once and preserves granular changes", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA operation_permission_migration");
      await client.query(
        "SET LOCAL search_path TO operation_permission_migration, public",
      );
      await client.query(
        "CREATE TABLE users(id text PRIMARY KEY, role text, modules text[], edit_modules text[])",
      );
      const cases = [
        { id: "empty", role: "user", modules: [], editModules: [] },
        {
          id: "view",
          role: "user",
          modules: ["patients", "clinical", "reports"],
          editModules: [],
        },
        {
          id: "edit",
          role: "user",
          modules: ["agenda", "patients", "finance"],
          editModules: ["agenda", "patients", "finance"],
        },
        {
          id: "invalid-edit",
          role: "user",
          modules: ["agenda"],
          editModules: ["patients", "agenda"],
        },
        { id: "admin", role: "admin", modules: [], editModules: [] },
      ] as const;
      for (const item of cases)
        await client.query("INSERT INTO users VALUES ($1,$2,$3,$4)", [
          item.id,
          item.role,
          item.modules,
          item.editModules,
        ]);
      const sql = readFileSync(
        new URL(
          "../../../../migrations/0045_operation_permissions.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(sql);
      for (const item of cases) {
        const row = await client.query(
          "SELECT permissions FROM users WHERE id=$1",
          [item.id],
        );
        expect(row.rows[0].permissions.sort()).toEqual(
          (item.role === "admin"
            ? []
            : legacyPermissions(item.role, item.modules, item.editModules)
          ).sort(),
        );
      }
      await client.query(
        "UPDATE users SET permissions=ARRAY['agenda.view'] WHERE id='edit'",
      );
      await client.query(sql);
      expect(
        (await client.query("SELECT permissions FROM users WHERE id='edit'"))
          .rows[0].permissions,
      ).toEqual(["agenda.view"]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

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
    for (const search of [testCpf, "987.654.321-00"]) {
      expect(
        (await anotherInstance.listPatients(clinicId, search)).map(
          (item) => item.id,
        ),
      ).toContain(patient.id);
    }
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
    expect(
      (await anotherInstance.listPatients(clinicId, patient.recordNumber))[0]
        ?.fullName,
    ).toBe("Cliente Corrigido");
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
    expect(
      await anotherInstance.listAppointmentReschedules(clinicId, first.id),
    ).toMatchObject([
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
    expect(
      (await anotherInstance.listAppointments(clinicId, at(0), at(3))).find(
        (item) => item.id === first.id,
      ),
    ).toMatchObject({
      startsAt: at(1),
      visitType: "evaluation",
    });
    expect(
      await anotherInstance.listAppointmentReschedules(clinicId, first.id),
    ).toHaveLength(1);
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
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value));
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

  it("moves the lead appointments to the created or reused client on conversion", async () => {
    await cleanupLeadConversion();
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const at = (hours: number) =>
      new Date(
        leadConversionDay.getTime() + hours * 60 * 60 * 1000,
      ).toISOString();
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
    const evaluation = await repository.createLeadAppointment(
      clinicId,
      lead.id,
      {
        ...input,
        startsAt: at(2),
        visitType: "evaluation",
      },
    );
    const conversion = await repository.convertLead(clinicId, ownerId, lead.id);
    expect(conversion).toMatchObject({
      reusedExisting: false,
      lead: { stage: "won" },
    });
    const patientId = conversion!.patient.id;
    const anotherInstance = new PostgresClinicRepository(pool);
    const moved = (
      await anotherInstance.listAppointments(clinicId, at(-1), at(4))
    ).filter((item) => item.id === trial!.id || item.id === evaluation!.id);
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
    const secondTrial = await repository.createLeadAppointment(
      clinicId,
      secondLead.id,
      {
        ...input,
        startsAt: at(5),
        visitType: "trial",
      },
    );
    const reused = await repository.convertLead(
      clinicId,
      ownerId,
      secondLead.id,
    );
    expect(reused).toMatchObject({
      reusedExisting: true,
      patient: { id: existing.id },
    });
    const movedToExisting = (
      await repository.listAppointments(clinicId, at(4), at(7))
    ).find((item) => item.id === secondTrial!.id);
    expect(movedToExisting).toMatchObject({
      patientId: existing.id,
      patientName: "Cliente Já Cadastrado",
      visitType: "trial",
    });
    expect(movedToExisting).not.toHaveProperty("leadId");
  });

  it("fills CPF, emergency contact and address asked only on conversion", async () => {
    await cleanupLeadConversion();
    try {
      const lead = await repository.createLead(clinicId, {
        fullName: "Lead Só Nome e Telefone",
        phone: leadConversionPhones[1]!,
        source: "Instagram",
        interest: "Pilates",
        tags: [],
      });
      const conversion = await repository.convertLead(
        clinicId,
        ownerId,
        lead.id,
        {
          cpf: "52998224725",
          emergencyContactName: "Joana Mãe",
          emergencyContactPhone: "11988887777",
          postalCode: "01310-100",
          address: "Avenida Paulista, 1000",
          city: "São Paulo",
          state: "SP",
          neighborhood: "",
        },
      );
      expect(conversion?.patient).toMatchObject({
        cpf: "52998224725",
        emergencyContactName: "Joana Mãe",
        emergencyContactPhone: "11988887777",
        postalCode: "01310-100",
        address: "Avenida Paulista, 1000",
        city: "São Paulo",
        state: "SP",
      });
    } finally {
      await cleanupLeadConversion();
    }
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
      (
        await repository.listContactSuggestions(
          clinicId,
          legacyRoleDefaultModules.reception,
        )
      ).filter((item) => item.patientId === patient.id);
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
    expect((await mine()).some((item) => item.reason === "birthday")).toBe(
      false,
    );
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
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "completed",
    );
    const date = saoPauloToday();
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 2,
            totalValueInCents: 20000,
          },
        ],
        patientId: patient.id,
        serviceId: services[0]!.id,
        name: timelineMarker,
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 20000,
        installments: 1,
        firstDueDate: date,
      }),
    );
    const receivable = await pool.query<{ id: string }>(
      "SELECT id FROM receivables WHERE plan_id=$1",
      [plan.id],
    );
    await repository.settleReceivable(
      clinicId,
      ownerId,
      receivable.rows[0]!.id,
      "pix",
    );
    await repository.reverseReceivablePayment(
      clinicId,
      ownerId,
      receivable.rows[0]!.id,
    );
    await repository.updatePatientPlanStatus(
      clinicId,
      ownerId,
      plan.id,
      "cancelled",
    );
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
    const survey = await repository.createSatisfactionSurvey(
      clinicId,
      ownerId,
      {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 8,
      },
    );
    expect(
      (
        await repository.listSatisfactionSurveys(clinicId, {
          patientId: patient.id,
        })
      ).map((item) => item.id),
    ).toEqual([survey.id]);

    const timeline = await new PostgresClinicRepository(
      pool,
    ).getPatientTimeline(clinicId, patient.id);
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
    expect(
      timeline!.find((item) => item.kind === "payment_reversal"),
    ).toMatchObject({
      amountInCents: -20000,
    });
    expect(timeline!.find((item) => item.kind === "appointment")).toMatchObject(
      {
        id: `appointment:${appointment.id}`,
        status: "completed",
      },
    );
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
      const unsigned = await repository.createIssuedDocument(
        clinicId,
        ownerId,
        {
          templateId: template.id,
          patientId: patient!.id,
          title: "Documento sem profissional",
        },
      );
      expect(unsigned.snapshotBody).toContain("[] []");
      await expect(
        repository.createIssuedDocument(clinicId, ownerId, {
          templateId: template.id,
          patientId: patient!.id,
          professionalId: "fafafafa-fafa-4afa-8afa-fafafafafafa",
          title: "Documento inválido",
        }),
      ).rejects.toMatchObject({
        code: "PROFESSIONAL_NOT_FOUND",
        statusCode: 404,
      });
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
    const importCpf = "12345678577";
    try {
      const first = await repository.importPatients(clinicId, [
        {
          fullName: "Importada PG Um",
          phone: phones[0]!,
          cpf: importCpf,
          tags: [],
        },
        {
          fullName: "Importada PG Dois",
          phone: phones[1]!,
          tags: ["importada"],
        },
      ]);
      expect(first).toEqual({ created: 2, skipped: 0 });
      const listed = await repository.listPatients(clinicId, "Importada PG");
      expect(listed.map((patient) => patient.fullName)).toEqual([
        "Importada PG Dois",
        "Importada PG Um",
      ]);
      expect(new Set(listed.map((patient) => patient.recordNumber)).size).toBe(
        2,
      );

      const again = await repository.importPatients(clinicId, [
        { fullName: "Importada PG Um", phone: phones[0]!, tags: [] },
        {
          fullName: "Mesmo CPF",
          phone: phones[2]!,
          cpf: "123.456.785-77",
          tags: [],
        },
        { fullName: "Importada PG Dois", phone: "11 95550-1002", tags: [] },
      ]);
      expect(again).toEqual({ created: 0, skipped: 3 });
      expect(await repository.importPatients(clinicId, [])).toEqual({
        created: 0,
        skipped: 0,
      });
      expect(
        await repository.listPatients(clinicId, "Importada PG"),
      ).toHaveLength(2);
    } finally {
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND (phone = ANY($2::text[]) OR cpf = $3)",
        [clinicId, phones, importCpf],
      );
    }
  });

  it("records a patient export in the administrative audit", async () => {
    await cleanupExportAudit();
    try {
      await repository.recordAdminAuditEvent(
        clinicId,
        ownerId,
        "patients.exported",
        "patient",
        {
          marker: exportAuditMarker,
          format: "csv",
          columns: ["fullName"],
          filters: { tags: ["vip"] },
          count: 3,
        },
      );
      const events = await repository.listAdminAuditEvents(clinicId);
      const event = events.find(
        (item) =>
          item.action === "patients.exported" &&
          item.metadata.marker === exportAuditMarker,
      );
      expect(event).toMatchObject({
        entityType: "patient",
        actorName: expect.any(String),
        metadata: {
          format: "csv",
          columns: ["fullName"],
          filters: { tags: ["vip"] },
          count: 3,
        },
      });
      expect(event?.entityId).toBeUndefined();
      expect(
        (
          await repository.listAdminAuditEvents(
            "99999999-9999-4999-8999-999999999999",
          )
        ).some((item) => item.metadata.marker === exportAuditMarker),
      ).toBe(false);
    } finally {
      await cleanupExportAudit();
    }
  });

  it("configures the demo clients' tags after the seed", async () => {
    const used = await pool.query<{ tag: string }>(
      "SELECT DISTINCT unnest(tags) AS tag FROM patients WHERE clinic_id = $1 AND tags && ARRAY['Pós-operatório','Pilates']",
      [clinicId],
    );
    const tags = await repository.listPatientTags(clinicId);
    for (const { tag } of used.rows)
      expect(
        tags.map((item) => item.name),
        tag,
      ).toContain(tag);
    expect(
      tags.find((item) => item.name === "Pilates")?.patientCount,
    ).toBeGreaterThan(0);
  });

  it("creates, renames with the clients, recolors and deletes tags only when unused", async () => {
    const phone = "11977770620";
    const names = ["PG Etiqueta T062", "PG Etiqueta T062 Nova"];
    const cleanup = async () => {
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND phone = $2",
        [clinicId, phone],
      );
      await pool.query(
        "DELETE FROM patient_tags WHERE clinic_id = $1 AND name = ANY($2)",
        [clinicId, names],
      );
    };
    await cleanup();
    try {
      const tag = await repository.createPatientTag(clinicId, ownerId, {
        name: names[0]!,
        color: "#aa3366",
      });
      expect(tag).toMatchObject({
        clinicId,
        name: names[0],
        color: "#aa3366",
        patientCount: 0,
      });
      await expect(
        repository.createPatientTag(clinicId, ownerId, {
          name: "pg etiquetá t062",
          color: "#000000",
        }),
      ).rejects.toMatchObject({ code: "PATIENT_TAG_DUPLICATE" });

      const patient = await repository.createPatient(clinicId, {
        fullName: "Cliente Etiqueta PG",
        phone,
        tags: [names[0]!, "Outra coisa"],
      });
      const renamed = await repository.updatePatientTag(
        clinicId,
        ownerId,
        tag.id,
        {
          name: names[1]!,
        },
      );
      expect(renamed).toMatchObject({
        id: tag.id,
        name: names[1],
        color: "#aa3366",
        patientCount: 1,
      });
      const [stored] = await repository.listPatients(clinicId, phone);
      expect(stored?.id).toBe(patient.id);
      expect(stored?.tags).toEqual([names[1], "Outra coisa"]);
      await expect(
        repository.updatePatientTag(clinicId, ownerId, tag.id, {
          name: "pilates",
        }),
      ).rejects.toMatchObject({ code: "PATIENT_TAG_DUPLICATE" });
      expect(
        await repository.updatePatientTag(clinicId, ownerId, tag.id, {
          color: "#112233",
        }),
      ).toMatchObject({ name: names[1], color: "#112233" });
      // V3: categoria opcional (migração 0080).
      expect(
        await repository.updatePatientTag(clinicId, ownerId, tag.id, {
          category: "financial",
        }),
      ).toMatchObject({ color: "#112233", category: "financial" });
      const cleared = await repository.updatePatientTag(
        clinicId,
        ownerId,
        tag.id,
        { category: null },
      );
      expect(cleared).not.toHaveProperty("category");
      expect(
        await repository.updatePatientTag(
          clinicId,
          ownerId,
          "12121212-1212-4121-8121-121212121212",
          {
            color: "#112233",
          },
        ),
      ).toBeNull();

      const inUse = await repository
        .deletePatientTag(clinicId, ownerId, tag.id)
        .catch((error: unknown) => error);
      expect(inUse).toBeInstanceOf(DomainError);
      expect(inUse).toMatchObject({
        code: "PATIENT_TAG_IN_USE",
        statusCode: 409,
        details: { patientCount: 1 },
      });
      await repository.updatePatient(clinicId, patient.id, {
        fullName: patient.fullName,
        phone,
        tags: [],
      });
      expect(await repository.deletePatientTag(clinicId, ownerId, tag.id)).toBe(
        true,
      );
      expect(await repository.deletePatientTag(clinicId, ownerId, tag.id)).toBe(
        false,
      );

      const audit = await pool.query<{
        action: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT action, metadata FROM audit_events
         WHERE clinic_id = $1 AND entity_type = 'patient_tag' AND entity_id = $2
         ORDER BY created_at`,
        [clinicId, tag.id],
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        "patient_tag.created",
        "patient_tag.updated",
        "patient_tag.updated",
        "patient_tag.deleted",
      ]);
      expect(audit.rows[1]?.metadata).toMatchObject({
        previousName: names[0],
        patientsUpdated: 1,
      });
    } finally {
      await cleanup();
    }
  });

  it("creates the client with the next step in one transaction and lists subscribers without a group", async () => {
    const marker = "postgres-guided-t064";
    const phones = [
      "11955506401",
      "11955506402",
      "11955506403",
      "11955506404",
      "11955506405",
      "11955506406",
    ];
    const serviceId = "77777777-7777-4777-8777-777777777777";
    const otherServiceId = "88888888-8888-4888-8888-888888888888";
    const professionalId = "44444444-4444-4444-8444-444444444444";
    const day = new Date(Date.now() + 650 * 24 * 60 * 60 * 1000);
    day.setUTCHours(12, 0, 0, 0);
    const terms = await configuredPlan({
      services: [
        { serviceId: serviceId, totalSessions: 8, totalValueInCents: 40000 },
      ],
      name: marker,
      serviceId,
      totalSessions: 8,
      validFrom: saoPauloToday(),
      validUntil: "2099-12-31",
      totalValueInCents: 40000,
      installments: 2,
      firstDueDate: saoPauloToday(),
    });
    const patients =
      "SELECT id FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])";
    const plans = `SELECT id FROM patient_plans WHERE patient_id IN (${patients})`;
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM appointments WHERE patient_id IN (${patients})`,
        [clinicId, phones],
      );
      await pool.query(
        `DELETE FROM group_enrollments WHERE patient_id IN (${patients})`,
        [clinicId, phones],
      );
      await pool.query(
        `DELETE FROM financial_events WHERE receivable_id IN
           (SELECT id FROM receivables WHERE plan_id IN (${plans}))`,
        [clinicId, phones],
      );
      await pool.query(
        `DELETE FROM session_movements WHERE plan_id IN (${plans})`,
        [clinicId, phones],
      );
      await pool.query(`DELETE FROM receivables WHERE plan_id IN (${plans})`, [
        clinicId,
        phones,
      ]);
      await pool.query(`DELETE FROM patient_plans WHERE id IN (${plans})`, [
        clinicId,
        phones,
      ]);
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
        [clinicId, phones],
      );
      await pool.query(
        "DELETE FROM group_classes WHERE clinic_id = $1 AND name = $2",
        [clinicId, marker],
      );
    };
    await cleanup();
    try {
      const appointment = {
        serviceId,
        professionalId,
        roomId: "55555555-5555-4555-8555-555555555555",
        startsAt: day.toISOString(),
        notes: marker,
      };
      const demo = await repository.createPatientWithNextStep(
        clinicId,
        ownerId,
        {
          next: "demonstration",
          patient: { fullName: "Guiada PG Demo", phone: phones[0]!, tags: [] },
          appointment,
        },
      );
      expect(demo.appointment).toMatchObject({
        patientId: demo.patient.id,
        visitType: "trial",
        status: "scheduled",
      });
      // Conflito na agenda: o cliente gravado na mesma transação é desfeito.
      await expect(
        repository.createPatientWithNextStep(clinicId, ownerId, {
          next: "demonstration",
          patient: {
            fullName: "Guiada PG Conflito",
            phone: phones[1]!,
            tags: [],
          },
          appointment,
        }),
      ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
      expect(await repository.listPatients(clinicId, phones[1])).toEqual([]);

      const group = await pool.query<{ id: string }>(
        `INSERT INTO group_classes
           (clinic_id, name, sequence, service_id, professional_id, room_id, capacity, weekly_slots)
         VALUES ($1, $2, 9064, $3, $4, '66666666-6666-4666-8666-666666666666', 4, '[]'::jsonb)
         RETURNING id`,
        [clinicId, marker, serviceId, professionalId],
      );
      const groupId = group.rows[0]!.id;
      const enrolled = await repository.createPatientWithNextStep(
        clinicId,
        ownerId,
        {
          next: "plan",
          patient: { fullName: "Guiada PG Turma", phone: phones[2]!, tags: [] },
          plan: { ...terms, kind: "recurring" },
          groupId,
        },
      );
      expect(enrolled.plan).toMatchObject({
        kind: "recurring",
        status: "active",
        remainingSessions: 8,
      });
      expect(enrolled.enrollment).toMatchObject({
        groupId,
        patientId: enrolled.patient.id,
        status: "active",
      });
      const noGroup = await repository.createPatientWithNextStep(
        clinicId,
        ownerId,
        {
          next: "plan",
          patient: {
            fullName: "Guiada PG Sem Turma",
            phone: phones[3]!,
            tags: [],
          },
          plan: { ...terms, kind: "fixed_package" },
        },
      );
      const single = await repository.createPatientWithNextStep(
        clinicId,
        ownerId,
        {
          next: "single",
          patient: {
            fullName: "Guiada PG Avulso",
            phone: phones[4]!,
            tags: [],
          },
          plan: {
            ...terms,
            services: terms.services.map((entry) => ({
              ...entry,
              totalSessions: 1,
            })),
            installments: 1,
          },
        },
      );
      expect(single.plan?.kind).toBe("single");
      const receivables = await pool.query(
        "SELECT 1 FROM receivables WHERE clinic_id = $1 AND plan_id = $2",
        [clinicId, enrolled.plan!.id],
      );
      expect(receivables.rowCount).toBe(2);

      const withoutGroup =
        await repository.listSubscriberIdsWithoutGroup(clinicId);
      expect(withoutGroup).toContain(noGroup.patient.id);
      expect(withoutGroup).not.toContain(enrolled.patient.id);
      expect(withoutGroup).not.toContain(single.patient.id);
      expect(withoutGroup).not.toContain(demo.patient.id);

      // Turma de outro serviço e serviço inexistente: nada fica gravado.
      await expect(
        repository.createPatientWithNextStep(clinicId, ownerId, {
          next: "plan",
          patient: {
            fullName: "Guiada PG Desfeita",
            phone: phones[5]!,
            tags: [],
          },
          plan: {
            ...terms,
            services: [
              {
                serviceId: otherServiceId,
                totalSessions: 8,
                totalValueInCents: terms.totalValueInCents,
              },
            ],
            kind: "recurring",
          },
          groupId,
        }),
      ).rejects.toMatchObject({
        code: "GROUP_SERVICE_MISMATCH",
        statusCode: 400,
      });
      await expect(
        repository.createPatientWithNextStep(clinicId, ownerId, {
          next: "single",
          patient: {
            fullName: "Guiada PG Desfeita",
            phone: phones[5]!,
            tags: [],
          },
          plan: {
            ...terms,
            services: [
              {
                serviceId: "12121212-1212-4121-8121-121212121212",
                totalSessions: 8,
                totalValueInCents: terms.totalValueInCents,
              },
            ],
          },
        }),
      ).rejects.toMatchObject({ code: "PLAN_SERVICE_COMPOSITION_MISMATCH" });
      expect(await repository.listPatients(clinicId, phones[5])).toEqual([]);
      const stored = await pool.query(
        "SELECT 1 FROM patient_plans WHERE clinic_id = $1 AND name = $2",
        [clinicId, marker],
      );
      expect(stored.rowCount).toBe(3);
    } finally {
      await cleanup();
    }
  });

  it("migration 0044 configures the clients' existing tags without losing any", async () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../migrations/0044_patient_tags.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const clinic = "11111111-1111-4111-8111-000000000044";
    const other = "11111111-1111-4111-8111-000000000045";
    // Esquema temporário com as tabelas como estavam antes da 0044; tudo desfeito no ROLLBACK.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA t062_migration");
      await client.query("SET LOCAL search_path TO t062_migration");
      await client.query("CREATE TABLE clinics (id uuid PRIMARY KEY)");
      await client.query(
        `CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
           clinic_id uuid NOT NULL REFERENCES clinics(id), full_name text NOT NULL,
           tags text[] NOT NULL DEFAULT '{}')`,
      );
      await client.query("INSERT INTO clinics (id) VALUES ($1), ($2)", [
        clinic,
        other,
      ]);
      await client.query(
        `INSERT INTO patients (clinic_id, full_name, tags) VALUES
           ($1, 'Ana', ARRAY['Pós-operatório', 'VIP']),
           ($1, 'Bia', ARRAY['pos-operatorio', 'Pós-operatório']),
           ($1, 'Caio', ARRAY['Pós-operatório']),
           ($1, 'Davi', ARRAY[]::text[]),
           ($2, 'Eva', ARRAY['vip', ''])`,
        [clinic, other],
      );
      const tagsSnapshot = `SELECT clinic_id, name, name_key, color FROM patient_tags ORDER BY clinic_id, name`;
      const patientsSnapshot = `SELECT full_name, tags FROM patients ORDER BY full_name`;

      await client.query(sql);
      const once = [
        await client.query(tagsSnapshot),
        await client.query(patientsSnapshot),
      ];
      await client.query(sql); // pode rodar de novo sem erro nem efeito
      const twice = [
        await client.query(tagsSnapshot),
        await client.query(patientsSnapshot),
      ];
      expect(twice.map((result) => result.rows)).toEqual(
        once.map((result) => result.rows),
      );

      // Uma etiqueta por nome (sem diferenciar maiúsculas/acentos), por clínica, com a cor padrão;
      // a grafia mais usada vence.
      expect(twice[0]!.rows).toEqual([
        {
          clinic_id: clinic,
          name: "Pós-operatório",
          name_key: "pos-operatorio",
          color: "#64748b",
        },
        { clinic_id: clinic, name: "VIP", name_key: "vip", color: "#64748b" },
        { clinic_id: other, name: "vip", name_key: "vip", color: "#64748b" },
      ]);
      // Clientes passam à grafia configurada, sem repetir; nada some.
      expect(twice[1]!.rows).toEqual([
        { full_name: "Ana", tags: ["Pós-operatório", "VIP"] },
        { full_name: "Bia", tags: ["Pós-operatório"] },
        { full_name: "Caio", tags: ["Pós-operatório"] },
        { full_name: "Davi", tags: [] },
        { full_name: "Eva", tags: ["vip", ""] },
      ]);

      await client.query("SAVEPOINT unique_key");
      await expect(
        client.query(
          "INSERT INTO patient_tags (clinic_id, name, name_key) VALUES ($1, 'Vip', 'vip')",
          [clinic],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT unique_key");
      await client.query("SAVEPOINT color_check");
      await expect(
        client.query(
          "INSERT INTO patient_tags (clinic_id, name, name_key, color) VALUES ($1, 'Nova', 'nova', 'azul')",
          [clinic],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT color_check");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("merges clients moving plan, balance and receivables in one transaction", async () => {
    const marker = `Mescla PG ${randomUUID()}`;
    const phones = ["11955502001", "11955502002"];
    const plans =
      "SELECT id FROM patient_plans WHERE clinic_id = $1 AND name = $2";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM financial_events WHERE receivable_id IN
           (SELECT id FROM receivables WHERE plan_id IN (${plans}))`,
        [clinicId, marker],
      );
      await pool.query(
        `DELETE FROM session_movements WHERE plan_id IN (${plans})`,
        [clinicId, marker],
      );
      await pool.query(`DELETE FROM receivables WHERE plan_id IN (${plans})`, [
        clinicId,
        marker,
      ]);
      await pool.query(
        "DELETE FROM patient_plans WHERE clinic_id = $1 AND name = $2",
        [clinicId, marker],
      );
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[]) AND merged_into_patient_id IS NOT NULL",
        [clinicId, phones],
      );
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND phone = ANY($2::text[])",
        [clinicId, phones],
      );
    };
    try {
      const source = await repository.createPatient(clinicId, {
        fullName: "Mescla PG duplicado",
        phone: phones[0]!,
        tags: [],
      });
      const target = await repository.createPatient(clinicId, {
        fullName: "Mescla PG principal",
        phone: phones[1]!,
        tags: [],
      });
      const [service] = await repository.listServices(clinicId);
      const today = saoPauloToday();
      const plan = await repository.createPatientPlan(
        clinicId,
        ownerId,
        await configuredPlan({
          patientId: source.id,
          serviceId: service!.id,
          name: marker,
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: today,
          totalValueInCents: 40_000,
          installments: 2,
          firstDueDate: today,
        }),
      );
      const receivableIds = (
        await pool.query<{ id: string }>(
          "SELECT id FROM receivables WHERE plan_id = $1 ORDER BY due_date",
          [plan.id],
        )
      ).rows.map((row) => row.id);
      expect(receivableIds).toHaveLength(2);
      await repository.settleReceivable(
        clinicId,
        ownerId,
        receivableIds[0]!,
        "pix",
      );
      const preview = await repository.previewPatientMerge(
        clinicId,
        source.id,
        target.id,
      );
      await repository.mergePatients(clinicId, ownerId, {
        sourceId: source.id,
        targetId: target.id,
        fieldSources: Object.fromEntries(
          preview.fields.map((field) => [field.key, "target" as const]),
        ),
      });
      const another = new PostgresClinicRepository(pool);
      expect(await another.listPatientPlans(clinicId, source.id)).toEqual([]);
      expect(
        (await another.listPatientPlans(clinicId, target.id)).find(
          (item) => item.id === plan.id,
        ),
      ).toMatchObject({ patientId: target.id, remainingSessions: 4 });
      const receivables = (await another.getFinancialSummary(clinicId))
        .receivables;
      expect(
        receivables.filter((item) => item.patientId === source.id),
      ).toEqual([]);
      const moved = receivables.filter((item) => item.planId === plan.id);
      expect(moved.map((item) => item.patientId)).toEqual([
        target.id,
        target.id,
      ]);
      expect(moved.find((item) => item.id === receivableIds[0])?.status).toBe(
        "paid",
      );
    } finally {
      await cleanup();
    }
  });
});
