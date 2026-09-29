import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations, seedDemoData } from "./database.js";
import { PostgresClinicRepository } from "./postgres-repository.js";
import { DomainError } from "./repository.js";
import { defaultRelationshipSettings, saoPauloToday } from "@crm/contracts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const clinicId = "11111111-1111-4111-8111-111111111111";
const testCpf = "98765432100";
const duplicateCpf = "98765432101";
const relationshipCpf = "98765432102";
const birthdayCpf = "98765432103";
const appointmentMarker = "postgres-integration-test";
const rescheduleMarker = "postgres-reschedule-test";
const salesMarker = "postgres-sales-test";
const renewalMarker = "postgres-renewal-test";
const ownerId = "22222222-2222-4222-8222-222222222222";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;
  let repository: PostgresClinicRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool);
    await seedDemoData(pool);
    repository = new PostgresClinicRepository(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(
      `DELETE FROM financial_events WHERE receivable_id IN
       (SELECT r.id FROM receivables r JOIN patient_plans pp ON pp.id=r.plan_id WHERE pp.name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker]],
    );
    await pool.query(
      `DELETE FROM session_movements WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker]],
    );
    await pool.query(
      `DELETE FROM receivables WHERE plan_id IN (SELECT id FROM patient_plans WHERE name = ANY($1::text[]))`,
      [[salesMarker, renewalMarker]],
    );
    await pool.query("DELETE FROM patient_plans WHERE name = ANY($1::text[])", [
      [salesMarker, renewalMarker],
    ]);
    await pool.query("TRUNCATE appointment_reschedules");
    await pool.query("DELETE FROM appointments WHERE notes = ANY($1::text[])", [
      [appointmentMarker, rescheduleMarker],
    ]);
    await pool.query(
      `DELETE FROM contact_activities WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[]))`,
      [clinicId, [relationshipCpf, birthdayCpf]],
    );
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = ANY($2::text[])", [
      clinicId,
      [testCpf, duplicateCpf, relationshipCpf, birthdayCpf],
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
    });
    await repository.createAppointment(clinicId, {
      ...input,
      startsAt: at(2),
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
    expect((await anotherInstance.listAppointments(clinicId, at(0), at(3))).find((item) => item.id === first.id)?.startsAt).toBe(at(1));
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
});
