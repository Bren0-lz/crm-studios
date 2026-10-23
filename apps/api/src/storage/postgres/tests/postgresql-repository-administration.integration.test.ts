import {
  appModuleSchema,
  effectiveEditModules,
  effectiveModules,
  permissionKeys,
  type AppModule,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import {
  legacyEffectiveEditModules,
  legacyEffectiveModules,
  legacyRoleDefaultModules,
  migrateLegacyUser,
  type LegacyRole,
} from "../../../modules/administration/legacy-roles.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
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
import { atInstant } from "../../../test-support/clock.js";
import "../../../test-support/postgres-setup.js";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;

  let repository: PostgresClinicRepository;

  const templateIds: string[] = [];

  it("serializes draft creation and checks update permission before overwriting", async () => {
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Clinical Permission Test",
        email: `${randomUUID()}@test.local`,
        role: "user",
        password: "Password123",
        permissions: ["clinical.view", "clinical.records_create"],
      },
      "unused-hash",
    );
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: "2039-02-10T12:00:00.000Z",
      visitType: "regular",
      notes: "permission-concurrency",
    });
    const input = {
      appointmentId: appointment.id,
      subjective: "Original",
      objective: "",
      assessment: "",
      plan: "",
    };
    const cleanupFixture = async () => {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        // The existing clinical trigger prevents physical deletion. This setting
        // is local to fixture cleanup in the disposable test database and transaction.
        await cleanup.query("SET LOCAL session_replication_role = replica");
        await cleanup.query(
          "DELETE FROM clinical_record_revisions WHERE clinical_record_id IN (SELECT id FROM clinical_records WHERE appointment_id=$1)",
          [appointment.id],
        );
        await cleanup.query(
          "DELETE FROM clinical_records WHERE appointment_id=$1",
          [appointment.id],
        );
        await cleanup.query("DELETE FROM appointments WHERE id=$1", [
          appointment.id,
        ]);
        await cleanup.query("DELETE FROM audit_events WHERE entity_id=$1", [
          user.id,
        ]);
        await cleanup.query("DELETE FROM users WHERE id=$1", [user.id]);
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK");
        throw error;
      } finally {
        cleanup.release();
      }
    };
    try {
      // Evolução só vale a partir de 15 min antes do início (QC3).
      const results = await atInstant(appointment.startsAt, () =>
        Promise.allSettled(
          [1, 2].map(() =>
            repository.saveClinicalRecord(clinicId, user.id, input),
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({
        reason: {
          statusCode: 403,
          details: { permission: "clinical.records_update" },
        },
      });
      expect(
        (
          await pool.query(
            "SELECT version,subjective FROM clinical_records WHERE appointment_id=$1",
            [appointment.id],
          )
        ).rows[0],
      ).toMatchObject({ version: 1, subjective: "Original" });
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        role: "user",
        active: true,
        permissions: ["clinical.view", "clinical.records_update"],
      });
      await atInstant(appointment.startsAt, () =>
        repository.saveClinicalRecord(clinicId, user.id, {
          ...input,
          subjective: "Changed",
        }),
      );
      expect(
        (
          await pool.query(
            "SELECT version,subjective FROM clinical_records WHERE appointment_id=$1",
            [appointment.id],
          )
        ).rows[0],
      ).toMatchObject({ version: 2, subjective: "Changed" });
    } finally {
      await cleanupFixture();
    }
  });

  it("serializes simultaneous demotions and retains one active administrator", async () => {
    const clinic = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    await pool.query(
      "INSERT INTO clinics(id,name,timezone) VALUES ($1,'Concurrent Permissions','America/Sao_Paulo')",
      [clinic],
    );
    try {
      for (const id of [first, second])
        await pool.query(
          "INSERT INTO users(id,clinic_id,full_name,email,role,password_hash) VALUES ($1,$2,'Admin Test',$3,'admin','unused')",
          [id, clinic, `${id}@test.local`],
        );
      expect(
        (await repository.findUserById(clinic, first))?.permissions,
      ).toEqual(permissionKeys);
      const results = await Promise.allSettled(
        [first, second].map((id) =>
          repository.updateAdminUser(clinic, id, id, {
            fullName: "Former Admin",
            role: "user",
            active: true,
            permissions: [],
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "LAST_ADMIN" } });
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM users WHERE clinic_id=$1 AND active AND role='admin'",
            [clinic],
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await pool.query("DELETE FROM audit_events WHERE clinic_id=$1", [clinic]);
      await pool.query("DELETE FROM users WHERE clinic_id=$1", [clinic]);
      await pool.query("DELETE FROM clinics WHERE id=$1", [clinic]);
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
      const base = {
        fullName: "Teste Permissões",
        role: "user" as const,
        active: true,
      };
      const custom = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          editModules: ["patients", "finance", "clinical", "patients"],
        },
      );
      expect(custom).toMatchObject({
        customModules: true,
        editModules: ["patients", "clinical"],
      });
      const stored = await pool.query<{
        modules: string[] | null;
        edit_modules: string[] | null;
      }>("SELECT modules, edit_modules FROM users WHERE id = $1", [created.id]);
      expect(stored.rows[0]).toEqual({
        modules: ["agenda", "groups", "patients", "plans", "clinical"],
        edit_modules: ["patients", "clinical"],
      });
      const narrowed = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: ["agenda", "clinical"],
        },
      );
      expect(narrowed).toMatchObject({
        modules: ["agenda", "clinical"],
        editModules: ["clinical"],
      });
      expect(
        (await repository.findUserById(clinicId, created.id))?.editModules,
      ).toEqual(["clinical"]);
      const reset = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: null,
          editModules: null,
        },
      );
      expect(reset).toMatchObject({
        customModules: false,
        modules: [],
        editModules: [],
      });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.action === "users.permissions_updated" &&
          item.entityId === created.id,
      );
      expect(events).toHaveLength(4);
    } finally {
      await cleanupPermissionsUser();
    }
  });

  it("updates the own profile, photo and linked professional in one transaction", async () => {
    const crefito = `PERFIL-${randomUUID().slice(0, 8)}`;
    const cleanup = async () => {
      await cleanupPermissionsUser();
      await pool.query(
        "DELETE FROM professionals WHERE clinic_id = $1 AND crefito = $2",
        [clinicId, crefito],
      );
    };
    await cleanup();
    try {
      const user = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Perfil",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      expect(await repository.getOwnProfile(clinicId, user.id)).toMatchObject({
        fullName: "Teste Perfil",
        avatarDataUrl: "",
        professional: null,
      });
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO professionals (clinic_id, user_id, full_name, crefito, specialty, color)
         VALUES ($1, $2, 'Perfil Agenda', $3, 'Pilates', '#5c6f68') RETURNING id`,
        [clinicId, user.id, crefito],
      );
      const photo = "data:image/png;base64,iVBORw0KGgo=";
      const updated = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
        avatarDataUrl: photo,
        agendaName: "Perfil na Agenda",
        agendaColor: "#123456",
      });
      expect(updated).toMatchObject({
        fullName: "Teste Perfil Novo",
        avatarDataUrl: photo,
        professional: {
          id: inserted.rows[0]!.id,
          fullName: "Perfil na Agenda",
          color: "#123456",
        },
      });
      const kept = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
      });
      expect(kept).toMatchObject({
        avatarDataUrl: photo,
        professional: { fullName: "Perfil na Agenda" },
      });
      const removed = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
        avatarDataUrl: "",
      });
      expect(removed?.avatarDataUrl).toBe("");
      expect(
        await repository.updateOwnProfile(clinicId, randomUUID(), {
          fullName: "Ninguém",
        }),
      ).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("refuses to demote or deactivate the last active admin of a clinic", async () => {
    const lonelyClinic = "0f550000-0000-4000-8000-000000000055";
    const cleanup = async () => {
      await pool.query("DELETE FROM audit_events WHERE clinic_id = $1", [
        lonelyClinic,
      ]);
      await pool.query("DELETE FROM users WHERE clinic_id = $1", [
        lonelyClinic,
      ]);
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
      const base = {
        fullName: "Única Admin",
        role: "admin" as const,
        active: true,
      };
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          role: "user",
        }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          active: false,
        }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      expect(
        await repository.findUserById(lonelyClinic, admin.id),
      ).toMatchObject({
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
      fileURLToPath(
        new URL("../../../../migrations/0042_user_types.sql", import.meta.url),
      ),
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
      {
        id: "physiotherapist",
        role: "physiotherapist",
        modules: null,
        editModules: null,
      },
      { id: "finance", role: "finance", modules: null, editModules: null },
      {
        id: "reception-custom",
        role: "reception",
        modules: ["agenda", "finance"],
        editModules: null,
      },
      {
        id: "physio-edit",
        role: "physiotherapist",
        modules: null,
        editModules: ["patients", "clinical"],
      },
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
        expect(
          effectiveEditModules(after.role, after.modules, after.editModules),
        ).toEqual(
          legacyEffectiveEditModules(
            before.role,
            before.modules,
            before.editModules,
          ),
        );
      }
      const column = await client.query<{ data_type: string }>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 't055_migration' AND table_name = 'users' AND column_name = 'role'`,
      );
      expect(column.rows[0]?.data_type).toBe("text");
      await client.query("SAVEPOINT legacy_value");
      await expect(
        client.query(
          "INSERT INTO users (id, role) VALUES ('late', 'reception')",
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("ROLLBACK TO SAVEPOINT legacy_value");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("stores the demo admin as admin after the migrations", async () => {
    const owner = await pool.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1",
      [ownerId],
    );
    expect(owner.rows[0]?.role).toBe("admin");
    expect(await repository.findUserById(clinicId, ownerId)).toMatchObject({
      role: "admin",
      modules: appModuleSchema.options,
    });
  });

  it("migration 0043 copies the linked professionals' rules to their users without losing any", async () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../migrations/0043_user_commission_rules.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const clinic = "11111111-1111-4111-8111-000000000043";
    const linkedUser = "22222222-2222-4222-8222-000000000043";
    const freeUser = "33333333-3333-4333-8333-000000000043";
    const linkedProfessional = "44444444-4444-4444-8444-000000000043";
    const freeProfessional = "55555555-5555-4555-8555-000000000043";
    // Esquema temporário com as tabelas como estavam antes da 0043; tudo desfeito no ROLLBACK.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA t057_migration");
      await client.query("SET LOCAL search_path TO t057_migration");
      await client.query("CREATE TABLE users (id uuid PRIMARY KEY)");
      await client.query(
        `CREATE TABLE professionals (id uuid PRIMARY KEY, clinic_id uuid NOT NULL,
           user_id uuid REFERENCES users(id))`,
      );
      await client.query(
        `CREATE TABLE commission_rules (
           id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
           clinic_id uuid NOT NULL,
           professional_id uuid NOT NULL REFERENCES professionals(id),
           percentage numeric(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
           effective_from date NOT NULL,
           active boolean NOT NULL DEFAULT true,
           created_at timestamptz NOT NULL DEFAULT now(),
           UNIQUE (clinic_id, professional_id, effective_from))`,
      );
      await client.query(
        `CREATE TABLE commission_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
           rule_id uuid NOT NULL REFERENCES commission_rules(id))`,
      );
      await client.query("INSERT INTO users (id) VALUES ($1), ($2)", [
        linkedUser,
        freeUser,
      ]);
      await client.query(
        "INSERT INTO professionals (id, clinic_id, user_id) VALUES ($1, $3, $4), ($2, $3, NULL)",
        [linkedProfessional, freeProfessional, clinic, linkedUser],
      );
      const before = await client.query<{ id: string }>(
        `INSERT INTO commission_rules (clinic_id, professional_id, percentage, effective_from, active)
         VALUES ($1, $2, 30, '2020-01-01', true), ($1, $2, 40.5, '2021-01-01', false),
                ($1, $3, 20, '2020-01-01', true)
         RETURNING id`,
        [clinic, linkedProfessional, freeProfessional],
      );
      await client.query(
        "INSERT INTO commission_entries (rule_id) VALUES ($1)",
        [before.rows[0]!.id],
      );
      const snapshot = `SELECT id, clinic_id, professional_id, user_id, percentage::float AS percentage,
          effective_from::text AS effective_from, active
        FROM commission_rules ORDER BY effective_from, percentage`;

      await client.query(sql);
      const once = await client.query(snapshot);
      await client.query(sql); // pode rodar de novo sem erro nem efeito
      const twice = await client.query(snapshot);
      expect(twice.rows).toEqual(once.rows);

      // As regras originais continuam iguais; os lançamentos seguem apontando para elas.
      const originals = twice.rows.filter(
        (row) => row.professional_id !== null,
      );
      expect(originals.map((row) => row.id).sort()).toEqual(
        before.rows.map((row) => row.id).sort(),
      );
      expect(originals.every((row) => row.user_id === null)).toBe(true);
      const entries = await client.query(
        "SELECT rule_id FROM commission_entries",
      );
      expect(entries.rows).toEqual([{ rule_id: before.rows[0]!.id }]);

      // Só o profissional ligado ganha cópia no usuário (mesmo percentual, vigência e situação).
      const copies = twice.rows.filter((row) => row.user_id !== null);
      expect(
        copies.map(
          ({ clinic_id, user_id, percentage, effective_from, active }) => ({
            clinic_id,
            user_id,
            percentage,
            effective_from,
            active,
          }),
        ),
      ).toEqual([
        {
          clinic_id: clinic,
          user_id: linkedUser,
          percentage: 30,
          effective_from: "2020-01-01",
          active: true,
        },
        {
          clinic_id: clinic,
          user_id: linkedUser,
          percentage: 40.5,
          effective_from: "2021-01-01",
          active: false,
        },
      ]);

      // Exatamente um dono por regra; vigência única por usuário.
      for (const [professionalId, userId] of [
        [null, null],
        [freeProfessional, freeUser],
      ]) {
        await client.query("SAVEPOINT owner_check");
        await expect(
          client.query(
            `INSERT INTO commission_rules (clinic_id, professional_id, user_id, percentage, effective_from)
             VALUES ($1, $2, $3, 10, '2022-01-01')`,
            [clinic, professionalId, userId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK TO SAVEPOINT owner_check");
      }
      await client.query("SAVEPOINT user_unique");
      await expect(
        client.query(
          `INSERT INTO commission_rules (clinic_id, user_id, percentage, effective_from)
           VALUES ($1, $2, 10, '2020-01-01')`,
          [clinic, linkedUser],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT user_unique");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
