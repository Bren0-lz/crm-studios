import { saoPauloToday } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  trialConversionDay,
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

  it("persists the plan period and weekly frequency across repository instances", async () => {
    const template = await repository.createPlanTemplate(clinicId, ownerId, {
      name: "Integration periodic plan",
      planType: "semiannual",
      kind: "fixed_package",
      totalValueInCents: 16000,
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          sessionsPerWeek: 2,
          totalSessions: 48,
          totalValueInCents: 16000,
        },
      ],
    });
    templateIds.push(template.id);
    const another = new PostgresClinicRepository(pool);
    expect(
      (await another.listPlanTemplates(clinicId)).find(
        (item) => item.id === template.id,
      ),
    ).toMatchObject({
      planType: "semiannual",
      services: [{ sessionsPerWeek: 2, totalSessions: 48 }],
    });
    await another.updatePlanTemplate(clinicId, ownerId, template.id, {
      planType: "annual",
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          sessionsPerWeek: 2,
          totalSessions: 96,
          totalValueInCents: 16000,
        },
      ],
    });
    expect(
      (await repository.listPlanTemplates(clinicId)).find(
        (item) => item.id === template.id,
      ),
    ).toMatchObject({
      planType: "annual",
      services: [{ sessionsPerWeek: 2, totalSessions: 96 }],
    });
  });

  it("persists catalog defaults and negotiated snapshots, rejects foreign plans atomically and renews legacy contracts", async () => {
    const isolatedClinic = randomUUID();
    const foreignClinic = randomUUID();
    const marker = `catalog-${randomUUID()}`;
    let saleId: string | undefined;
    try {
      await pool.query("INSERT INTO clinics (id,name) VALUES ($1,$3),($2,$3)", [
        isolatedClinic,
        foreignClinic,
        marker,
      ]);
      const service = await repository.createService(isolatedClinic, {
        name: marker,
        priceInCents: 0,
        durationMinutes: 60,
        color: "#64748b",
      });
      const patient = await repository.createPatient(isolatedClinic, {
        fullName: marker,
        phone: "11987654321",
        tags: [],
      });
      const template = await repository.createPlanTemplate(
        isolatedClinic,
        ownerId,
        {
          name: marker,
          totalValueInCents: 45000,
          services: [
            {
              serviceId: service.id,
              totalSessions: 8,
              totalValueInCents: 45000,
            },
          ],
          kind: "recurring",
        },
      );
      const foreignService = await repository.createService(foreignClinic, {
        name: marker,
        priceInCents: 0,
        durationMinutes: 60,
        color: "#64748b",
      });
      const foreign = await repository.createPlanTemplate(
        foreignClinic,
        ownerId,
        {
          name: marker,
          totalValueInCents: 0,
          services: [
            {
              serviceId: foreignService.id,
              totalSessions: 1,
              totalValueInCents: 0,
            },
          ],
        },
      );
      const input = {
        planTemplateId: template.id,
        patientId: patient.id,
        serviceId: service.id,
        name: "Nome adulterado",
        services: [
          {
            serviceId: service.id,
            totalSessions: 10,
            totalValueInCents: 10001,
          },
        ],
        kind: "fixed_package" as const,
        totalSessions: 10,
        totalValueInCents: 10001,
        installments: 3,
        validFrom: "2035-01-01",
        firstDueDate: "2035-01-05",
      };
      const transition = await pool.connect();
      try {
        await transition.query("BEGIN");
        await transition.query(
          "UPDATE plan_templates SET active=false WHERE id=$1",
          [template.id],
        );
        const rejectedSale = expect(
          repository.createPatientPlan(isolatedClinic, ownerId, input),
        ).rejects.toMatchObject({ code: "PLAN_TEMPLATE_NOT_FOUND" });
        await vi.waitFor(
          async () => {
            const waiting = await pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT name FROM plan_templates%'",
            );
            expect(waiting.rowCount).toBe(1);
          },
          { timeout: 5000 },
        );
        await transition.query("COMMIT");
        await rejectedSale;
      } finally {
        await transition.query("ROLLBACK");
        transition.release();
      }
      await pool.query("UPDATE plan_templates SET active=true WHERE id=$1", [
        template.id,
      ]);
      expect(
        await repository.updatePlanTemplate(
          isolatedClinic,
          ownerId,
          foreign.id,
          { active: false },
        ),
      ).toBeNull();
      await expect(
        repository.createPlanTemplate(isolatedClinic, ownerId, {
          name: marker,
          totalValueInCents: 0,
          services: [
            {
              serviceId: "77777777-7777-4777-8777-777777777777",
              totalSessions: 1,
              totalValueInCents: 0,
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "PLAN_TEMPLATE_SERVICE_NOT_FOUND" });
      const sale = await repository.createPatientPlan(
        isolatedClinic,
        ownerId,
        input,
      );
      saleId = sale.id;
      expect(sale).toMatchObject({
        name: marker,
        planTemplateId: template.id,
        totalValueInCents: 10001,
        totalSessions: 10,
      });
      const installments = await pool.query<{ total: number; count: number }>(
        "SELECT sum(amount_in_cents)::int AS total,count(*)::int AS count FROM receivables WHERE plan_id=$1",
        [sale.id],
      );
      expect(installments.rows[0]).toEqual({ total: 10001, count: 3 });
      const updated = await repository.updatePlanTemplate(
        isolatedClinic,
        ownerId,
        template.id,
        {
          name: `${marker}-edited`,
          totalValueInCents: 55000,
          services: [
            {
              serviceId: service.id,
              totalSessions: 8,
              totalValueInCents: 55000,
            },
          ],
          kind: null,
          active: false,
        },
      );
      expect(updated).toMatchObject({ kind: null, active: false });
      expect(
        (await repository.listPatientPlans(isolatedClinic))[0],
      ).toMatchObject({ name: marker, totalValueInCents: 10001 });
      for (const planTemplateId of [foreign.id, template.id])
        await expect(
          repository.createPatientPlan(isolatedClinic, ownerId, {
            ...input,
            planTemplateId,
          }),
        ).rejects.toMatchObject({ code: "PLAN_TEMPLATE_NOT_FOUND" });
      await expect(
        repository.createPatientWithNextStep(isolatedClinic, ownerId, {
          next: "single",
          patient: {
            fullName: "Desfeito catálogo",
            phone: "11987654322",
            tags: [],
          },
          plan: { ...input, planTemplateId: foreign.id },
        }),
      ).rejects.toMatchObject({ code: "PLAN_TEMPLATE_NOT_FOUND" });
      expect(
        await repository.listPatients(isolatedClinic, "11987654322"),
      ).toEqual([]);
      const successor = await repository.renewPatientPlan(
        isolatedClinic,
        ownerId,
        sale.id,
        {
          ...input,
          name: marker,
          validFrom: "2035-02-01",
          firstDueDate: "2035-02-05",
        },
      );
      expect(successor).toMatchObject({
        planTemplateId: template.id,
        name: marker,
        totalValueInCents: 10001,
      });
      // Simulate an existing contract from before the additive migration.
      await pool.query(
        "UPDATE patient_plans SET plan_template_id=NULL WHERE id=$1",
        [successor!.id],
      );
      const legacyRenewal = await repository.renewPatientPlan(
        isolatedClinic,
        ownerId,
        successor!.id,
        {
          ...input,
          name: marker,
          validFrom: "2035-03-01",
          firstDueDate: "2035-03-05",
        },
      );
      expect(legacyRenewal).not.toHaveProperty("planTemplateId");
      const today = saoPauloToday();
      const monthStart = `${today.slice(0, 7)}-01`;
      const previousEnd = new Date(`${monthStart}T12:00:00Z`);
      previousEnd.setUTCDate(0);
      const lastDay = previousEnd.toISOString().slice(0, 10);
      await pool.query("UPDATE plan_templates SET active=true WHERE id=$1", [
        template.id,
      ]);
      const auto = await repository.createPatientPlan(isolatedClinic, ownerId, {
        ...input,
        kind: "recurring",
        autoRenew: true,
        validFrom: `${lastDay.slice(0, 7)}-01`,
        validUntil: lastDay,
        firstDueDate: `${lastDay.slice(0, 7)}-05`,
      });
      await pool.query("UPDATE plan_templates SET active=false WHERE id=$1", [
        template.id,
      ]);
      expect(
        await repository.renewDuePatientPlans(isolatedClinic, ownerId),
      ).toBe(1);
      const automatic = (
        await repository.listPatientPlans(isolatedClinic)
      ).find((item) => item.renewedFromPlanId === auto.id);
      expect(automatic).toMatchObject({
        name: `${marker}-edited`,
        totalValueInCents: input.totalValueInCents,
        planTemplateId: template.id,
        validFrom: monthStart,
      });
      expect(
        await repository.renewDuePatientPlans(isolatedClinic, ownerId),
      ).toBe(0);
      const events = await repository.listAdminAuditPage(
        isolatedClinic,
        undefined,
        { module: "settings" },
      );
      expect(
        events.items
          .filter((item) => item.entityId === template.id)
          .map((item) => item.action)
          .sort(),
      ).toEqual(["plan_template.created", "plan_template.updated"]);
      expect(await repository.listPlanTemplates(clinicId)).not.toContainEqual(
        expect.objectContaining({ id: template.id }),
      );
    } finally {
      const ids = [isolatedClinic, foreignClinic];
      await pool.query(
        "DELETE FROM financial_events WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM session_movements WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM receivables WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      // Break successor links only in the isolated test clinics before cleanup.
      if (saleId)
        await pool.query(
          "UPDATE patient_plans SET renewed_from_plan_id=NULL WHERE clinic_id=$1",
          [isolatedClinic],
        );
      await pool.query(
        "DELETE FROM patient_plans WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM plan_templates WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM patients WHERE clinic_id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.query("DELETE FROM services WHERE clinic_id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.query(
        "DELETE FROM audit_events WHERE clinic_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM clinics WHERE id=ANY($1::uuid[])", [ids]);
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

  it("persists and isolates catalog entries across repository instances", async () => {
    const created = await repository.createPlanCatalogEntry(clinicId, ownerId, {
      name: "Integration catalog Pilates",
      totalValueInCents: 12345,
    });
    try {
      const another = new PostgresClinicRepository(pool);
      expect(await another.listPlanCatalog(clinicId)).toContainEqual(created);
      const otherClinic = randomUUID();
      expect(await another.listPlanCatalog(otherClinic)).toEqual([]);
      expect(
        await another.updatePlanCatalogEntry(otherClinic, ownerId, created.id, {
          name: "Other clinic",
          totalValueInCents: 0,
        }),
      ).toBeNull();
      expect(
        await another.deletePlanCatalogEntry(otherClinic, ownerId, created.id),
      ).toBe(false);
      const updated = await another.updatePlanCatalogEntry(
        clinicId,
        ownerId,
        created.id,
        { name: "Integration catalog free", totalValueInCents: 0 },
      );
      expect(updated).toMatchObject({
        id: created.id,
        name: "Integration catalog free",
        totalValueInCents: 0,
      });
      expect(await repository.listPlanCatalog(clinicId)).toContainEqual(
        updated,
      );
      expect(
        await another.deletePlanCatalogEntry(clinicId, ownerId, created.id),
      ).toBe(true);
      expect(
        (await repository.listPlanCatalog(clinicId)).some(
          (item) => item.id === created.id,
        ),
      ).toBe(false);
    } finally {
      await pool.query(
        "DELETE FROM plan_catalog WHERE clinic_id = $1 AND id = $2",
        [clinicId, created.id],
      );
    }
  });

  it("reports trial conversion by plans created within 30 days of the completed trial", async () => {
    await cleanupTrialConversion();
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const at = (hours: number) =>
      new Date(
        trialConversionDay.getTime() + hours * 60 * 60 * 1000,
      ).toISOString();
    const input = {
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      notes: trialConversionMarker,
    };
    const day = trialConversionDay.toISOString().slice(0, 10);
    const createPlanAt = async (patientId: string, createdAt: string) => {
      const plan = await repository.createPatientPlan(
        clinicId,
        ownerId,
        await configuredPlan({
          services: [
            {
              serviceId: input.serviceId,
              totalSessions: 4,
              totalValueInCents: 40000,
            },
          ],
          patientId,
          serviceId: input.serviceId,
          name: trialConversionMarker,
          kind: "fixed_package",
          totalSessions: 4,
          validFrom: day,
          totalValueInCents: 40000,
          installments: 1,
          firstDueDate: day,
        }),
      );
      await pool.query(
        "UPDATE patient_plans SET created_at = $2 WHERE id = $1",
        [plan.id, createdAt],
      );
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
    const converted = await createLead(
      "Experimental Convertida",
      trialConversionPhones[0]!,
    );
    const convertedTrial = await repository.createLeadAppointment(
      clinicId,
      converted.id,
      {
        ...input,
        startsAt: at(0),
        visitType: "trial",
      },
    );
    await repository.updateAppointmentStatus(
      clinicId,
      convertedTrial!.id,
      "completed",
    );
    const conversion = await repository.convertLead(
      clinicId,
      ownerId,
      converted.id,
    );
    await createPlanAt(
      conversion!.patient.id,
      new Date(
        new Date(at(0)).getTime() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );

    // Lead que não vira cliente: concluída, não convertida.
    const open = await createLead(
      "Avaliação Sem Conversão",
      trialConversionPhones[1]!,
    );
    const openEvaluation = await repository.createLeadAppointment(
      clinicId,
      open.id,
      {
        ...input,
        startsAt: at(2),
        visitType: "evaluation",
      },
    );
    await repository.updateAppointmentStatus(
      clinicId,
      openEvaluation!.id,
      "completed",
    );

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
    await repository.updateAppointmentStatus(
      clinicId,
      lateTrial.id,
      "completed",
    );
    const cancelled = await repository.createAppointment(clinicId, {
      ...input,
      patientId: client.id,
      startsAt: at(6),
      visitType: "trial",
    });
    await repository.updateAppointmentStatus(
      clinicId,
      cancelled.id,
      "cancelled",
    );
    await createPlanAt(
      client.id,
      new Date(
        new Date(at(4)).getTime() + 40 * 24 * 60 * 60 * 1000,
      ).toISOString(),
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
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 2,
            totalValueInCents: 24000,
          },
        ],
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: salesMarker,
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 24000,
        installments: 2,
        firstDueDate: date,
      }),
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
    const report = await anotherInstance.getSalesReport(
      clinicId,
      date.slice(0, 7),
    );
    const planMovements = report.sales.filter(
      (item) => item.sourceId === plan.id,
    );
    expect(planMovements).toHaveLength(2);
    expect(
      planMovements.reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(0);
    expect(planMovements.map((item) => item.kind).sort()).toEqual([
      "cancellation",
      "sale",
    ]);
    const paymentMovements = report.payments.filter(
      (item) => item.receivableId === receivable.rows[0]!.id,
    );
    expect(paymentMovements).toHaveLength(2);
    expect(
      paymentMovements.reduce((sum, item) => sum + item.amountInCents, 0),
    ).toBe(0);

    const partial = await repository.createPatientPlan(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 2,
            totalValueInCents: 24000,
          },
        ],
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: salesMarker,
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: date,
        totalValueInCents: 24000,
        installments: 2,
        firstDueDate: date,
      }),
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
    const partialReport = await anotherInstance.getSalesReport(
      clinicId,
      date.slice(0, 7),
    );
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
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 4,
            totalValueInCents: 30000,
          },
        ],
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
      }),
    );
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
        services: [
          {
            serviceId: plan.serviceId,
            totalSessions: 4,
            totalValueInCents: 30000,
          },
        ],
        validFrom: month(0, 1),
        totalValueInCents: 30000,
        installments: 1,
        firstDueDate: month(0, 1),
      }),
    ).rejects.toMatchObject({ code: "PLAN_ALREADY_RENEWED" });
  });
});
