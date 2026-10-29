import { randomUUID } from "node:crypto";
import { appModuleSchema, saoPauloToday } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import {
  clinicId,
  dailyCashDay,
  dailyCashMarker,
  databaseUrl,
  financeClassificationMarker,
  leadAppointmentDay,
  leadAppointmentMarker,
  leadAppointmentPhone,
  ownerId,
  permissionsUserEmail,
  recurringPayableMarker,
} from "../../../test-support/mysql-fixtures.js";
import { atInstant } from "../../../test-support/clock.js";
import "../../../test-support/mysql-setup.js";

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
    await pool.query(
      `INSERT INTO financial_categories (id, clinic_id, name, kind) VALUES ($3, $1, $2, 'expense')
       ON DUPLICATE KEY UPDATE active = 1`,
      [clinicId, financeClassificationMarker, randomUUID()],
    );
    const category = await pool.query<{ id: string }>(
      "SELECT id FROM financial_categories WHERE clinic_id = $1 AND name = $2 AND kind = 'expense'",
      [clinicId, financeClassificationMarker],
    );
    await pool.query(
      `INSERT INTO cost_centers (id, clinic_id, name) VALUES ($3, $1, $2)
       ON DUPLICATE KEY UPDATE active = 1`,
      [clinicId, financeClassificationMarker, randomUUID()],
    );
    const costCenter = await pool.query<{ id: string }>(
      "SELECT id FROM cost_centers WHERE clinic_id = $1 AND name = $2",
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

  async function cleanupLeadAppointments() {
    const effectiveFrom = leadAppointmentDay.toISOString().slice(0, 10);
    await pool.query(
      `DELETE FROM commission_entries WHERE appointment_id IN
         (SELECT id FROM appointments WHERE notes = $1)
       OR rule_id IN (SELECT id FROM commission_rules WHERE clinic_id = $2 AND effective_from = $3)`,
      [leadAppointmentMarker, clinicId, effectiveFrom],
    );
    await pool.query(
      "DELETE FROM commission_rules WHERE clinic_id = $1 AND effective_from = $2",
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
    database = await createTestDatabase("finance");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

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
    await database?.drop();
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
    const anotherInstance = new MysqlClinicRepository(pool);
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
        `INSERT INTO appointments (clinic_id, professional_id, room_id, service_id, starts_at, ends_at, notes, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
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
        `INSERT INTO appointments (clinic_id, patient_id, lead_id, professional_id, room_id, service_id, starts_at, ends_at, notes, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
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
    // Realizado só vale a partir de 15 min antes do início (QC3).
    const completed = await atInstant(trial!.startsAt, () =>
      repository.updateAppointmentStatus(clinicId, trial!.id, "completed"),
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

  it("settles with discount, interest and partial payment and restores on reversal", async () => {
    await cleanupDailyCash();
    try {
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
              totalValueInCents: 10_000,
            },
          ],
          patientId: patients[0]!.id,
          serviceId: services[0]!.id,
          name: dailyCashMarker,
          kind: "fixed_package",
          totalSessions: 1,
          validFrom: dailyCashDay,
          totalValueInCents: 10_000,
          installments: 1,
          firstDueDate: dailyCashDay,
        }),
      );
      const receivableId = (
        await pool.query<{ id: string }>(
          "SELECT id FROM receivables WHERE plan_id = $1",
          [plan.id],
        )
      ).rows[0]!.id;
      await expect(
        repository.settleReceivable(
          clinicId,
          ownerId,
          receivableId,
          "pix",
          undefined,
          { receivedInCents: 20_000 },
        ),
      ).rejects.toMatchObject({ code: "INVALID_SETTLEMENT" });

      const paid = await repository.settleReceivable(
        clinicId,
        ownerId,
        receivableId,
        "pix",
        undefined,
        {
          discountInCents: 1_000,
          interestInCents: 500,
          receivedInCents: 4_000,
        },
      );
      expect(paid).toMatchObject({ status: "paid", amountInCents: 4_000 });
      const rows = await pool.query<{
        amountInCents: number;
        status: string;
        description: string;
        installmentNumber: number;
      }>(
        `SELECT amount_in_cents AS "amountInCents", status, description,
                installment_number AS "installmentNumber"
         FROM receivables WHERE plan_id = $1 ORDER BY installment_number`,
        [plan.id],
      );
      expect(rows.rows).toEqual([
        expect.objectContaining({ amountInCents: 4_000, status: "paid" }),
        expect.objectContaining({
          amountInCents: 5_500,
          status: "open",
          installmentNumber: 2,
          description: expect.stringMatching(/ · saldo$/),
        }),
      ]);
      const payment = await pool.query<{
        amountInCents: number;
        discountInCents: number;
        interestInCents: number;
        balanceReceivableId: string | null;
      }>(
        `SELECT amount_in_cents AS "amountInCents", discount_in_cents AS "discountInCents",
                interest_in_cents AS "interestInCents", balance_receivable_id AS "balanceReceivableId"
         FROM financial_events WHERE receivable_id = $1 AND kind = 'payment'`,
        [receivableId],
      );
      expect(payment.rows[0]).toMatchObject({
        amountInCents: 4_000,
        discountInCents: 1_000,
        interestInCents: 500,
      });
      expect(payment.rows[0]!.balanceReceivableId).toBeTruthy();
      const receipt = await repository.getPaymentReceipt(
        clinicId,
        receivableId,
      );
      expect(receipt).toMatchObject({
        amountInCents: 4_000,
        discountInCents: 1_000,
        interestInCents: 500,
        clinicName: expect.any(String),
      });

      const reversed = await repository.reverseReceivablePayment(
        clinicId,
        ownerId,
        receivableId,
      );
      // Sem o desconto e sem os juros: 4.000 + 1.000 − 500; com o saldo, volta a 10.000.
      expect(reversed).toMatchObject({ status: "open", amountInCents: 4_500 });
      const open = await pool.query<{ total: number }>(
        "SELECT CAST(SUM(amount_in_cents) AS SIGNED) AS total FROM receivables WHERE plan_id = $1 AND status = 'open'",
        [plan.id],
      );
      expect(open.rows[0]!.total).toBe(10_000);
    } finally {
      await cleanupDailyCash();
    }
  });

  it("builds the MySQL daily cash by event date in the clinic time zone", async () => {
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
      `UPDATE financial_events SET occurred_at = $2, cash_available_at = $2
       WHERE receivable_id = $1 AND kind = 'payment'`,
      [receivableId, `${nextDate}T02:30:00.000Z`],
    );
    await pool.query(
      `UPDATE financial_events SET occurred_at = $2, cash_available_at = $2
       WHERE receivable_id = $1 AND kind = 'payment_reversal'`,
      [receivableId, `${nextDate}T02:40:00.000Z`],
    );
    await pool.query(
      `UPDATE payable_events SET occurred_at = $2, cash_available_at = $2
       WHERE payable_id = $1 AND kind = 'payment'`,
      [payable.id, `${dailyCashDay}T15:00:00.000Z`],
    );
    const payableEvents = await pool.query<{ id: string }>(
      "SELECT id FROM payable_events WHERE payable_id = $1 AND kind = 'payment'",
      [payable.id],
    );

    const events = await pool.query<{ id: string }>(
      `SELECT id FROM financial_events
       WHERE receivable_id = $1 AND kind IN ('payment','payment_reversal')`,
      [receivableId],
    );
    const ownIds = new Set([
      ...payableEvents.rows.map((item) => `payable:${item.id}`),
      ...events.rows.flatMap((item) => [
        `receipt:${item.id}`,
        `receipt_reversal:${item.id}`,
      ]),
    ]);
    const anotherInstance = new MysqlClinicRepository(pool);
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

  it("creates and lists a MySQL payable without cost center", async () => {
    const category = await pool.query<{ id: string }>(
      "SELECT id FROM financial_categories WHERE clinic_id = $1 AND kind = 'expense' AND active LIMIT 1",
      [clinicId],
    );
    const description = "PG despesa sem centro de custo";
    try {
      const payable = await repository.createPayable(clinicId, ownerId, {
        description,
        categoryId: category.rows[0]!.id,
        dueDate: "2026-10-16",
        amountInCents: 4_590,
      });
      expect(payable).not.toHaveProperty("costCenterId");
      const workspace = await repository.getFinancialWorkspace(clinicId);
      expect(
        workspace.payables.find((item) => item.id === payable.id),
      ).toMatchObject({ description, amountInCents: 4_590 });
    } finally {
      await pool.query(
        "DELETE FROM payable_events WHERE payable_id IN (SELECT id FROM payables WHERE clinic_id = $1 AND description = $2)",
        [clinicId, description],
      );
      await pool.query(
        "DELETE FROM payables WHERE clinic_id = $1 AND description = $2",
        [clinicId, description],
      );
    }
  });

  it("saves MySQL supplier hiring and payment details and clears them on edit", async () => {
    const name = "PG fornecedor com contrato";
    try {
      const created = await repository.saveSupplier(clinicId, ownerId, {
        name,
        kind: "company",
        document: "11222333000181",
        phone: "1133334444",
        whatsapp: "11988887777",
        hiredOn: "2026-09-01",
        contractAmountInCents: 360_000,
        billingCycle: "yearly",
        paymentMethod: "boleto",
        installments: 12,
        paymentTerms: "Vencimento todo dia 5",
        orders: "Pedido 42",
        contracts: "Contrato 2026/07",
        notes: "",
        active: true,
      });
      expect(created).toMatchObject({
        whatsapp: "11988887777",
        hiredOn: "2026-09-01",
        contractAmountInCents: 360_000,
        billingCycle: "yearly",
        paymentMethod: "boleto",
        installments: 12,
        orders: "Pedido 42",
        contracts: "Contrato 2026/07",
      });
      const updated = await repository.saveSupplier(
        clinicId,
        ownerId,
        {
          name,
          kind: "company",
          document: "",
          phone: "",
          whatsapp: "",
          billingCycle: "one_time",
          installments: 1,
          paymentTerms: "",
          orders: "",
          contracts: "",
          notes: "",
          active: true,
        },
        created!.id,
      );
      expect(updated).not.toHaveProperty("hiredOn");
      expect(updated).not.toHaveProperty("contractAmountInCents");
      expect(updated).not.toHaveProperty("paymentMethod");
    } finally {
      await pool.query(
        "DELETE FROM suppliers WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    }
  });

  it("lists MySQL payments and reversals by event date in the clinic time zone", async () => {
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
        "UPDATE financial_events SET occurred_at = $2, cash_available_at = $2 WHERE id = $1",
        [row.id, moves[index]],
      );

    const anotherInstance = new MysqlClinicRepository(pool);
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
        amountType: "fixed" as const,
        amountInCents: 12_345,
        dayOfMonth: 28,
        startMonth: shift(-2),
        active: true,
      };
      const competences = async (id: string) =>
        (
          await pool.query<{ competence: string; dueDate: string }>(
            `SELECT competence, due_date AS "dueDate" FROM payables
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

  it("keeps variable fixed expenses pending until the month amount is informed", async () => {
    await cleanupRecurringPayables();
    try {
      const [category, costCenter] = await testFinanceClassification();
      const current = saoPauloToday().slice(0, 7);
      const variable = await repository.createRecurringPayable(
        clinicId,
        ownerId,
        {
          description: recurringPayableMarker,
          categoryId: category.rows[0]!.id,
          costCenterId: costCenter.rows[0]!.id,
          amountType: "variable",
          amountInCents: 15_000,
          dayOfMonth: 10,
          reminderDaysBefore: 3,
          startMonth: current,
          active: true,
        },
      );
      expect(variable).toMatchObject({
        amountType: "variable",
        reminderDaysBefore: 3,
      });
      await repository.generateDueRecurringPayables(clinicId, ownerId);
      const payable = (
        await repository.getFinancialWorkspace(clinicId)
      ).payables.find((item) => item.recurringPayableId === variable.id)!;
      expect(payable).toMatchObject({
        amountInCents: 15_000,
        amountPending: true,
      });
      await expect(
        repository.settlePayable(clinicId, ownerId, payable.id, "pix"),
      ).rejects.toMatchObject({ code: "PAYABLE_AMOUNT_PENDING" });
      const informed = await repository.setPayableAmount(
        clinicId,
        ownerId,
        payable.id,
        18_790,
      );
      expect(informed?.amountInCents).toBe(18_790);
      expect(informed?.amountPending).toBeUndefined();
      const updated = await repository.updateRecurringPayable(
        clinicId,
        ownerId,
        variable.id,
        {
          description: recurringPayableMarker,
          categoryId: category.rows[0]!.id,
          costCenterId: costCenter.rows[0]!.id,
          amountType: "fixed",
          amountInCents: 15_000,
          dayOfMonth: 10,
          startMonth: current,
          active: true,
        },
      );
      expect(updated?.amountType).toBe("fixed");
      expect(updated?.reminderDaysBefore).toBeUndefined();
      const audit = await pool.query<{ metadata: Record<string, unknown> }>(
        "SELECT metadata FROM audit_events WHERE clinic_id=$1 AND action='payable.amount_informed' AND entity_id=$2",
        [clinicId, payable.id],
      );
      expect(audit.rows[0]?.metadata).toMatchObject({
        previousAmountInCents: 15_000,
        amountInCents: 18_790,
      });
      // Conta de despesa de valor fixo não recebe o valor do mês.
      await expect(
        repository.setPayableAmount(clinicId, ownerId, payable.id, 20_000),
      ).rejects.toMatchObject({ code: "PAYABLE_NOT_VARIABLE" });
      // Voltar a variável faz a conta ainda aberta esperar o valor do mês de novo.
      await repository.updateRecurringPayable(clinicId, ownerId, variable.id, {
        description: recurringPayableMarker,
        categoryId: category.rows[0]!.id,
        costCenterId: costCenter.rows[0]!.id,
        amountType: "variable",
        amountInCents: 15_000,
        dayOfMonth: 10,
        startMonth: current,
        active: true,
      });
      expect(
        (await repository.getFinancialWorkspace(clinicId)).payables.find(
          (item) => item.id === payable.id,
        )?.amountPending,
      ).toBe(true);
    } finally {
      await cleanupRecurringPayables();
    }
  });

  it("links a user to one professional and reads the commission rule in force today", async () => {
    const crefitos = ["PG-T050-A", "PG-T050-B"];
    const cleanup = async () => {
      const professionals = `SELECT id FROM professionals WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(crefito))`;
      await pool.query(
        `DELETE FROM commission_rules WHERE clinic_id = $1 AND professional_id IN (${professionals})`,
        [clinicId, crefitos],
      );
      await pool.query(
        `DELETE FROM professionals WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(crefito))`,
        [clinicId, crefitos],
      );
      await cleanupPermissionsUser();
    };
    await cleanup();
    try {
      const [first, second] = await Promise.all(
        crefitos.map(async (crefito, index) => {
          const id = randomUUID();
          await pool.query(
            `INSERT INTO professionals (id, clinic_id, full_name, crefito, specialty, color, branch_id)
             VALUES ($4, $1, $2, $3, 'Pilates', '#5c6f68', (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
            [clinicId, `Profissional T050 ${index}`, crefito, id],
          );
          return id;
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
        `SELECT id, user_id FROM professionals WHERE JSON_CONTAINS($1, JSON_QUOTE(id)) ORDER BY crefito`,
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
      const professionals = `SELECT id FROM professionals WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(crefito))`;
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
        `DELETE FROM professionals WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(crefito))`,
        [clinicId, crefitos],
      );
    };
    await cleanup();
    try {
      const [linkedProfessional, freeProfessional] = await Promise.all(
        crefitos.map(async (crefito, index) => {
          const id = randomUUID();
          await pool.query(
            `INSERT INTO professionals (id, clinic_id, full_name, crefito, specialty, color, branch_id)
             VALUES ($4, $1, $2, $3, 'Pilates', '#5c6f68', (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
            [clinicId, `Profissional T057 ${index}`, crefito, id],
          );
          return id;
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
        const id: string = randomUUID();
        await pool.query(
          `INSERT INTO appointments (clinic_id, patient_id, professional_id, room_id, service_id,
             starts_at, ends_at, notes, status, id, branch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $6 + INTERVAL 50 MINUTE, $7, 'completed', $8,
             (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
          [
            clinicId,
            patients[0]!.id,
            professionalId,
            rooms[0]!.id,
            services[0]!.id,
            new Date(startsAt),
            marker,
            id,
          ],
        );
        return id;
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

      const sum = (items: Array<{ amountInCents: number }>) =>
        items.reduce((total, item) => total + item.amountInCents, 0);
      const forecast = await repository.listTeamProduction(
        clinicId,
        "2097-05-01",
        "2097-05-31",
      );
      expect(forecast.sessions.length).toBeGreaterThanOrEqual(3);
      const first = await repository.generateCommissions(clinicId, "2097-05");
      // A previsão do relatório usa a mesma regra da geração.
      expect(sum(forecast.pendingCommissions) + sum(forecast.commissions)).toBe(
        sum(first),
      );
      const generated = await repository.listTeamProduction(
        clinicId,
        "2097-05-01",
        "2097-05-31",
      );
      expect(generated.pendingCommissions).toEqual([]);
      expect(sum(generated.commissions)).toBe(sum(first));
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
        `SELECT CAST(percentage AS DOUBLE) AS percentage, effective_from AS effective_from
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
