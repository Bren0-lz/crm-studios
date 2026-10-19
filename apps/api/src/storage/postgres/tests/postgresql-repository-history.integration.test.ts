import { appModuleSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
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
import "../../../test-support/postgres-setup.js";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;

  let repository: PostgresClinicRepository;

  const templateIds: string[] = [];

  it("paginates all audit events with timestamp ties and clinic-scoped cursors", async () => {
    const marker = `history-${randomUUID()}`;
    const ids = Array.from({ length: 235 }, () => randomUUID());
    const newerId = randomUUID();
    const futureId = randomUUID();
    // Recente (o histórico não lista datas futuras), com microssegundos para o empate.
    const createdAt = new Date(Date.now() - 5_000)
      .toISOString()
      .replace("Z", "456Z");
    try {
      await pool.query(
        `INSERT INTO audit_events (id, clinic_id, actor_user_id, ip_address, action, entity_type, created_at)
         SELECT id, $1, $5::uuid, '192.0.2.1'::inet, $2, 'clinic', $3::timestamptz FROM unnest($4::uuid[]) AS id`,
        [clinicId, marker, createdAt, ids, ownerId],
      );
      const first = await repository.listAdminAuditPage(clinicId);
      expect(first.items).toHaveLength(50);
      expect(first.items[0]).toMatchObject({
        clinicId,
        actorUserId: ownerId,
        ipAddress: "192.0.2.1",
      });
      await pool.query(
        "INSERT INTO audit_events (id, clinic_id, action, entity_type, created_at) VALUES ($1, $2, $3, 'clinic', now()), ($4, $2, $3, 'clinic', '2100-01-01')",
        [newerId, clinicId, marker, futureId],
      );
      const found = first.items
        .filter((event) => event.action === marker)
        .map((event) => event.id);
      let page = first;
      while (page.nextCursor) {
        page = await repository.listAdminAuditPage(clinicId, page.nextCursor);
        found.push(
          ...page.items
            .filter((event) => event.action === marker)
            .map((event) => event.id),
        );
      }
      expect(found).toEqual([...ids].sort().reverse());
      expect(new Set(found).size).toBe(235);
      const latest = await repository.listAdminAuditPage(clinicId);
      expect(latest.items[0]!.id).toBe(newerId);
      expect(latest.items.some((event) => event.id === futureId)).toBe(false);
      const otherClinic = randomUUID();
      expect(await repository.listAdminAuditPage(otherClinic)).toEqual({
        items: [],
        nextCursor: null,
      });
      await expect(
        repository.listAdminAuditPage(otherClinic, first.nextCursor!),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        repository.listAdminAuditPage(clinicId, randomUUID()),
      ).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await pool.query(
        "DELETE FROM audit_events WHERE clinic_id = $1 AND action = $2",
        [clinicId, marker],
      );
    }
  });

  it("persists granular permissions, audits before/after and isolates clinics", async () => {
    const email = `operation-${randomUUID()}@test.local`;
    const user = await repository.createAdminUser(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      {
        fullName: "Operation User",
        email,
        role: "user",
        password: "Password123",
        permissions: ["finance.view", "finance.receive"],
      },
      "unused-hash",
    );
    try {
      expect(
        (await repository.findUserById(clinicId, user.id))?.permissions,
      ).toEqual(["finance.view", "finance.receive"]);
      expect(await repository.findUserById(randomUUID(), user.id)).toBeNull();
      expect(
        await repository.updateAdminUser(
          randomUUID(),
          "22222222-2222-4222-8222-222222222222",
          user.id,
          {
            fullName: user.fullName,
            role: "user",
            active: true,
            permissions: [],
          },
        ),
      ).toBeNull();
      await repository.updateAdminUser(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        user.id,
        { fullName: user.fullName, role: "user", active: true },
      );
      expect(
        (await repository.findUserById(clinicId, user.id))?.permissions,
      ).toEqual(["finance.view", "finance.receive"]);
      await repository.updateAdminUser(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        user.id,
        {
          fullName: user.fullName,
          role: "user",
          active: true,
          permissions: [],
        },
      );
      expect(
        (
          await pool.query("SELECT permissions FROM users WHERE id=$1", [
            user.id,
          ])
        ).rows[0].permissions,
      ).toEqual([]);
      expect(
        (await repository.listAdminAuditEvents(clinicId)).find(
          (event) =>
            event.entityId === user.id &&
            event.action === "users.permissions_updated" &&
            (event.metadata.permissions as string[]).length === 0,
        )?.metadata,
      ).toMatchObject({
        previousPermissions: ["finance.view", "finance.receive"],
        permissions: [],
      });
    } finally {
      await pool.query("DELETE FROM audit_events WHERE entity_id=$1", [
        user.id,
      ]);
      await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
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
          modules: ["finance", "agenda", "finance"],
        },
      );
      expect(custom).toMatchObject({
        customModules: true,
        modules: ["agenda", "finance"],
      });
      const kept = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          jobTitle: "",
        },
      );
      expect(kept).toMatchObject({ modules: ["agenda", "finance"] });
      expect(kept?.jobTitle).toBeUndefined();
      const stored = await pool.query<{
        modules: string[] | null;
        job_title: string | null;
      }>("SELECT modules, job_title FROM users WHERE id = $1", [created.id]);
      expect(stored.rows[0]).toEqual({
        modules: ["agenda", "finance"],
        job_title: null,
      });
      const reset = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: null,
        },
      );
      expect(reset).toMatchObject({ customModules: false, modules: [] });
      expect(
        (await repository.findUserById(clinicId, created.id))?.modules,
      ).toEqual([]);
      const promoted = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          role: "admin",
          modules: ["agenda"],
        },
      );
      expect(promoted).toMatchObject({ role: "admin", customModules: false });
      expect(promoted?.modules).toEqual(appModuleSchema.options);
      const promotedRow = await pool.query<{
        role: string;
        modules: string[] | null;
      }>("SELECT role, modules FROM users WHERE id = $1", [created.id]);
      expect(promotedRow.rows[0]).toEqual({ role: "admin", modules: null });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.action === "users.permissions_updated" &&
          item.entityId === created.id,
      );
      expect(events).toHaveLength(3);
    } finally {
      await cleanupPermissionsUser();
    }
  });
});
