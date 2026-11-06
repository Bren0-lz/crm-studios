import { nextTestCpf } from "../../../test-support/cpf.js";
import { saoPauloToday } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { createDefaultBranch } from "../branches.js";
import {
  clinicId,
  databaseUrl,
  ownerId,
  renewalMarker,
  salesMarker,
  trialConversionDay,
  trialConversionMarker,
  trialConversionPhones,
} from "../../../test-support/mysql-fixtures.js";
import { atInstant } from "../../../test-support/clock.js";
import "../../../test-support/mysql-setup.js";
import { testPatientContact } from "../../../test-support/patient-contact.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

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

  it("records the pause and extends the validity by the paused days on reactivation", async () => {
    const found = await pool.query<{
      id: string;
      validUntil: string;
      status: string;
    }>(
      `SELECT id, valid_until AS "validUntil", status FROM patient_plans
       WHERE clinic_id = $1 AND status = 'active' AND valid_until IS NOT NULL AND source_tab_id IS NULL
       LIMIT 1`,
      [clinicId],
    );
    const plan = found.rows[0]!;
    try {
      const paused = await repository.updatePatientPlanStatus(
        clinicId,
        ownerId,
        plan.id,
        "paused",
        { reason: "Viagem", expectedReturn: "2099-01-10" },
      );
      expect(paused).toMatchObject({
        status: "paused",
        pauseReason: "Viagem",
        pauseExpectedReturn: "2099-01-10",
      });
      await pool.query(
        "UPDATE patient_plans SET paused_at = NOW(6) - INTERVAL 3 DAY WHERE id = $1",
        [plan.id],
      );
      const resumed = await repository.updatePatientPlanStatus(
        clinicId,
        ownerId,
        plan.id,
        "active",
      );
      const expected = new Date(`${plan.validUntil}T12:00:00Z`);
      expected.setUTCDate(expected.getUTCDate() + 3);
      expect(resumed?.validUntil).toBe(expected.toISOString().slice(0, 10));
      expect(resumed).not.toHaveProperty("pausedAt");
    } finally {
      await pool.query(
        "UPDATE patient_plans SET status = $2, valid_until = $3, paused_at = NULL, pause_reason = NULL, pause_expected_return = NULL WHERE id = $1",
        [plan.id, plan.status, plan.validUntil],
      );
    }
  });

  it("records the refund to the client when cancelling a plan", async () => {
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const date = saoPauloToday();
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        services: [
          {
            serviceId: services[0]!.id,
            totalSessions: 4,
            totalValueInCents: 20000,
          },
        ],
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: "Integration refund plan",
        kind: "fixed_package",
        totalSessions: 4,
        validFrom: date,
        totalValueInCents: 20000,
        installments: 1,
        firstDueDate: date,
      }),
    );
    await expect(
      repository.updatePatientPlanStatus(
        clinicId,
        ownerId,
        plan.id,
        "cancelled",
        {},
        { refundedInCents: 20001, refundPaymentMethod: "pix" },
      ),
    ).rejects.toMatchObject({ code: "PLAN_REFUND_TOO_HIGH" });
    const cancelled = await repository.updatePatientPlanStatus(
      clinicId,
      ownerId,
      plan.id,
      "cancelled",
      {},
      {
        refundedInCents: 7500,
        refundPaymentMethod: "pix",
        refundNote: "Devolvido via Pix",
      },
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      refundedInCents: 7500,
      refundPaymentMethod: "pix",
      refundNote: "Devolvido via Pix",
    });
    // O estorno sai do caixa: conta paga com evento de pagamento, na categoria de estornos.
    const payable = (
      await repository.getFinancialWorkspace(clinicId)
    ).payables.find((item) => item.id === cancelled?.refundPayableId);
    expect(payable).toMatchObject({
      status: "paid",
      amountInCents: 7500,
      paymentMethod: "pix",
      categoryName: "Estornos a clientes",
    });
    const events = await pool.query<{ kind: string; amountInCents: number }>(
      `SELECT kind, amount_in_cents AS "amountInCents" FROM payable_events
       WHERE payable_id = $1 ORDER BY kind`,
      [payable!.id],
    );
    expect(events.rows).toEqual([
      { kind: "created", amountInCents: 7500 },
      { kind: "payment", amountInCents: -7500 },
    ]);
    const another = new MysqlClinicRepository(pool);
    expect(
      (await another.listPatientPlans(clinicId)).find(
        (item) => item.id === plan.id,
      ),
    ).toMatchObject({ refundedInCents: 7500, refundNote: "Devolvido via Pix" });
  });

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
    const another = new MysqlClinicRepository(pool);
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
      await createDefaultBranch(pool, isolatedClinic);
      await createDefaultBranch(pool, foreignClinic);
      const service = await repository.createService(isolatedClinic, {
        name: marker,
        durationMinutes: 60,
      });
      const patient = await repository.createPatient(isolatedClinic, {
        cpf: nextTestCpf(),
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
        durationMinutes: 60,
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
              "SELECT 1 FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND COMMAND='Query' AND INFO LIKE 'SELECT name FROM plan_templates%'",
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
        "SELECT CAST(SUM(amount_in_cents) AS SIGNED) AS total,COUNT(*) AS count FROM receivables WHERE plan_id=$1",
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
            cpf: nextTestCpf(),
            fullName: "Desfeito catálogo",
            phone: "11987654322",
            whatsapp: "11987654322",
            emergencyContactName: "Desfeito catálogo",
            emergencyContactPhone: "11987654322",
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
        "DELETE FROM financial_events WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM session_movements WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM receivables WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      // Break successor links only in the isolated test clinics before cleanup.
      if (saleId)
        await pool.query(
          "UPDATE patient_plans SET renewed_from_plan_id=NULL WHERE clinic_id=$1",
          [isolatedClinic],
        );
      await pool.query(
        "DELETE FROM patient_plans WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM plan_templates WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM patients WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM services WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM audit_events WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      // Numeração sequencial da clínica (0085) referencia a clínica.
      await pool.query(
        "DELETE FROM clinic_sequences WHERE JSON_CONTAINS($1, JSON_QUOTE(clinic_id))",
        [ids],
      );
      await pool.query(
        "DELETE FROM clinics WHERE JSON_CONTAINS($1, JSON_QUOTE(id))",
        [ids],
      );
    }
  });

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
         (SELECT id FROM leads WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(phone)))`,
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM leads WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(phone))",
      [clinicId, trialConversionPhones],
    );
    await pool.query(
      "DELETE FROM patients WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(phone))",
      [clinicId, trialConversionPhones],
    );
  }

  beforeAll(async () => {
    database = await createTestDatabase("plans");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  it("persists and isolates catalog entries across repository instances", async () => {
    const created = await repository.createPlanCatalogEntry(clinicId, ownerId, {
      name: "Integration catalog Pilates",
      totalValueInCents: 12345,
    });
    try {
      const another = new MysqlClinicRepository(pool);
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
    // Realizado só vale a partir de 15 min antes do início (QC3).
    await atInstant(convertedTrial!.startsAt, () =>
      repository.updateAppointmentStatus(
        clinicId,
        convertedTrial!.id,
        "completed",
      ),
    );
    const conversion = await repository.convertLead(
      clinicId,
      ownerId,
      converted.id,
      { cpf: converted.cpf ?? nextTestCpf(), ...testPatientContact },
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
    // Realizado só vale a partir de 15 min antes do início (QC3).
    await atInstant(openEvaluation!.startsAt, () =>
      repository.updateAppointmentStatus(
        clinicId,
        openEvaluation!.id,
        "completed",
      ),
    );

    // Cliente que contrata depois de 40 dias: não convertida; cancelada fica de fora.
    const client = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
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
    // Realizado só vale a partir de 15 min antes do início (QC3).
    await atInstant(lateTrial.startsAt, () =>
      repository.updateAppointmentStatus(clinicId, lateTrial.id, "completed"),
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
    const report = await new MysqlClinicRepository(pool).getManagementReport(
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

  it("reconciles MySQL sales, cancellation, payment and reversal movements", async () => {
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
    const anotherInstance = new MysqlClinicRepository(pool);
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
    // Cancelamento carrega a data da venda: plano vendido e cancelado no mês abate o líquido.
    expect(
      planMovements.find((item) => item.kind === "cancellation")
        ?.saleOccurredAt,
    ).toBe(planMovements.find((item) => item.kind === "sale")?.occurredAt);

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
    // A parcela paga do plano conta como venda paga; a cancelada sai da situação.
    expect(partialReport.current.payment.paidInCents).toBeGreaterThanOrEqual(
      12000,
    );
    expect(
      partialReport.current.byItem.some((item) =>
        item.label.startsWith(salesMarker),
      ),
    ).toBe(true);

    // Histórico de contratações do cliente: sem filtro de data, mais recentes primeiro.
    const history = await anotherInstance.listPatientSales(
      clinicId,
      patients[0]!.id,
    );
    expect(
      history!.filter((item) => item.sourceId === plan.id).map((i) => i.kind),
    ).toEqual(["cancellation", "sale"]);
    expect(history!.every((item) => item.patientId === patients[0]!.id)).toBe(
      true,
    );
    expect(
      await anotherInstance.listPatientSales(clinicId, randomUUID()),
    ).toBeNull();
    const period = await anotherInstance.getSalesPeriodReport(
      clinicId,
      `${date.slice(0, 7)}-01`,
      date,
    );
    for (const item of period.patientsWithoutReturn)
      expect(typeof item.phone).toBe("string");
  });

  it("renews due MySQL plans once and blocks a second manual renewal", async () => {
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

  it("stores the prorated charge of a recurring plan before the full one", async () => {
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: `Proporcional ${randomUUID()}`,
        kind: "recurring",
        totalSessions: 8,
        validFrom: "2026-10-01",
        validUntil: "2026-10-31",
        totalValueInCents: 40_000,
        installments: 1,
        firstDueDate: "2026-10-15",
        proratedChargeInCents: 20_000,
      }),
    );
    const receivables = await pool.query<{
      dueDate: string;
      amountInCents: number;
    }>(
      `SELECT due_date AS "dueDate", amount_in_cents AS "amountInCents"
       FROM receivables WHERE plan_id = $1 ORDER BY due_date`,
      [plan.id],
    );
    expect(plan.totalValueInCents).toBe(40_000);
    // Pré-pago: a proporcional vence no início e a mensalidade cheia no 1º vencimento.
    expect(receivables.rows).toEqual([
      { dueDate: "2026-10-01", amountInCents: 20_000 },
      { dueDate: "2026-10-15", amountInCents: 40_000 },
    ]);
  });

  it("lets a recurring plan go past its nominal balance, unlike a package", async () => {
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: `Recorrente Além do Saldo ${randomUUID()}`,
      phone: "11933335555",
      whatsapp: "11933335555",
      cpf: nextTestCpf(),
      tags: [],
    });
    const serviceId = services[0]!.id;
    const buy = (kind: "recurring" | "fixed_package", month: string) =>
      configuredPlan({
        patientId: patient.id,
        serviceId,
        name: `Saldo ${kind} ${randomUUID()}`,
        kind,
        totalSessions: 1,
        validFrom: `${month}-01`,
        validUntil: `${month}-28`,
        totalValueInCents: 10_000,
        installments: 1,
        firstDueDate: `${month}-01`,
      }).then((input) =>
        repository.createPatientPlan(clinicId, ownerId, input),
      );
    const complete = async (startsAt: string) => {
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patient.id,
        professionalId: professionals[0]!.id,
        roomId: rooms[0]!.id,
        serviceId,
        startsAt,
        notes: "",
        visitType: "regular",
      });
      return atInstant(appointment.startsAt, () =>
        repository.updateAppointmentStatus(
          clinicId,
          appointment.id,
          "completed",
        ),
      );
    };
    const remaining = async (planId: string) =>
      (await repository.listPatientPlans(clinicId)).find(
        (item) => item.id === planId,
      )?.remainingSessions;

    const recurring = await buy("recurring", "2031-03");
    await complete("2031-03-10T13:00:00.000Z");
    await complete("2031-03-12T13:00:00.000Z");
    expect(await remaining(recurring.id)).toBe(-1);

    const fixed = await buy("fixed_package", "2031-04");
    await complete("2031-04-07T13:00:00.000Z");
    await expect(complete("2031-04-09T13:00:00.000Z")).rejects.toMatchObject({
      code: "NO_SESSION_BALANCE",
    });
    expect(await remaining(fixed.id)).toBe(0);
  });

  it("marks the manual first charge of a recurring plan in finance and sales", async () => {
    const [patients, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listServices(clinicId),
    ]);
    const plan = await repository.createPatientPlan(
      clinicId,
      ownerId,
      await configuredPlan({
        patientId: patients[0]!.id,
        serviceId: services[0]!.id,
        name: `Manual ${randomUUID()}`,
        kind: "recurring",
        totalSessions: 8,
        validFrom: "2026-10-01",
        validUntil: "2026-10-31",
        totalValueInCents: 40_000,
        installments: 1,
        firstDueDate: "2026-10-15",
        manualFirstCharge: true,
        proratedChargeInCents: 31_500,
      }),
    );
    const summary = await repository.getFinancialSummary(clinicId);
    expect(
      summary.receivables
        .filter((item) => item.planId === plan.id)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ).toMatchObject([
      { dueDate: "2026-10-01", amountInCents: 31_500, manualAmount: true },
      { dueDate: "2026-10-15", amountInCents: 40_000 },
    ]);
    expect(
      summary.receivables.find(
        (item) => item.planId === plan.id && item.dueDate === "2026-10-15",
      ),
    ).not.toHaveProperty("manualAmount");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const report = await repository.getSalesPeriodReport(
      clinicId,
      today,
      today,
    );
    expect(
      report.sales.find((item) => item.sourceId === plan.id),
    ).toMatchObject({ manualFirstCharge: true });
  });
});
