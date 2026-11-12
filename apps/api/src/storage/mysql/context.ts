import { markPaymentProofsReversed } from "./payment-proofs.js";
import {
  cancelReceiptSignatures,
  issueReceiptSignature,
} from "./receipt-signatures.js";
import {
  acceptsPaymentInstallments,
  planHasSessionBalance,
  type PatientPlan,
  formatSequenceNumber,
  installmentPaymentSplitIssue,
  settlementBreakdown,
  type PaymentTiming,
  type SettlementAdjustments,
} from "@crm/contracts";
import type { PatientTabServiceItem } from "@crm/contracts";
import type { PaymentPart } from "@crm/contracts";
import {
  isSplitPayment,
  paymentPartsTotal,
  resolvePaymentParts,
  withPlanPaymentParts,
} from "@crm/contracts";
import {
  assertPaymentParts,
  type BatchEvent,
  latestPaymentBatch,
  storedPaymentParts,
} from "../../modules/finance/payment-parts.js";
import {
  type AdminAuditEvent,
  type AdminUserCommissionInput,
  type AppModule,
  appModuleSchema,
  type Appointment,
  type AppointmentInput,
  type AuditHistoryFilters,
  type ClinicalAccessEvent,
  type CommissionRuleInput,
  type CommunicationChannel,
  type GroupClassInput,
  type GroupEnrollment,
  type GroupEnrollmentInput,
  historyAction,
  type PatientImportInput,
  patientProfile,
  type PatientPlanInput,
  type Payable,
  type PaymentMethod,
  discountedPlanInstallments,
  hasManualFirstCharge,
  planProratedChargeCount,
  type PatientDiscount,
  planInstallmentSchedule,
  type PlanTemplateInput,
  type ReceivableStatus,
} from "@crm/contracts";
import type { UserBranchAccess } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { BranchScopeStore } from "../branch-scope.js";
import {
  DatabaseError,
  type Pool,
  type PoolClient,
} from "../../infrastructure/mysql-client.js";
import {
  branchOrDefault,
  insertRows,
  localDate,
  localDayStart,
  localToday,
  sqlTimestamp,
} from "./sql.js";
import { nextClinicSequence } from "./clinic-sequences.js";
import { historyEventsTable } from "./system-history.js";
import {
  findWeeklyScheduleConflicts,
  groupScheduleConflictMessage,
  weeklyOccurrences,
} from "../../modules/groups/group-schedule.js";
import { validatePlanComposition } from "../../modules/plans/plan-services.js";
import type { ClinicRepository } from "../../repository.js";
import { DomainError } from "../../repository.js";
import {
  type AdminUserRow,
  adminUserSelect,
  appointmentColumns,
  appointmentJoins,
  type AppointmentRow,
  clinicalRecordColumns,
  type ClinicalRecordRow,
  type CommissionEntryRow,
  type CommissionRuleRow,
  type GroupEnrollmentRow,
  hasDatabaseCode,
  hasGroupSessionConflict,
  json,
  issuedDocumentColumns,
  issuedDocumentJoins,
  type IssuedDocumentRow,
  leadColumns,
  type LeadContactRow,
  type LeadRow,
  type LeadTaskRow,
  mapAdminUserWithCommission,
  mapAppointment,
  mapClinicalRecord,
  mapCommissionEntry,
  mapCommissionRule,
  groupEnrollmentColumns,
  mapGroupEnrollment,
  mapIssuedDocument,
  mapLead,
  mapLeadContact,
  mapLeadTask,
  mapPatient,
  mapPatientPlan,
  mapPatientTab,
  mapPatientTabItem,
  mapPatientTag,
  mapPayable,
  mapReceivable,
  mapRecurringPayable,
  mapScheduleBlock,
  patientColumns,
  patientPlanColumns,
  type PatientPlanRow,
  type PatientRow,
  type PatientTabItemRow,
  type PatientTabRow,
  patientTagColumns,
  type PatientTagRow,
  payableColumns,
  type PayableRow,
  paymentInstallmentsValue,
  receivableColumns,
  type ReceivableRow,
  recurringPayableColumns,
  type RecurringPayableRow,
  type ScheduleBlockRow,
} from "./helpers.js";

export class MysqlRepositoryContext {
  operations!: ClinicRepository;
  readonly branchScope = new BranchScopeStore();

  constructor(readonly pool: Pool) {}

  /** Filiais da leitura em curso (array JSON em `$N`; `null` = todas). */
  branchReadIds() {
    return this.branchScope.readIds();
  }

  /** Filial da gravação em curso; `null` = a padrão (gatilho `fill_default_branch`). */
  branchWriteId() {
    return this.branchScope.writeId() ?? null;
  }

  /** Recusa (403) gravar em filial fora das filiais da requisição. */
  assertBranchInScope(branchId: string) {
    const ids = this.branchReadIds();
    if (ids && !ids.includes(branchId))
      throw new DomainError(
        "BRANCH_ACCESS_DENIED",
        "Este registro é de uma filial que não está selecionada.",
        403,
      );
  }

  /**
   * Filial comum aos recursos (profissional, sala, turma, atendimento) de uma gravação: recusa
   * mistura de filiais (409 BRANCH_MISMATCH) e filial fora do escopo (403). `null` = nenhum dos
   * recursos existe (o chamador responde o próprio "não encontrado").
   */
  async resourceBranch(
    client: Pool | PoolClient,
    clinicId: string,
    refs: {
      professionalId?: string | null | undefined;
      roomId?: string | null | undefined;
      groupId?: string | null | undefined;
      appointmentId?: string | null | undefined;
    },
  ) {
    const result = await client.query<{ branchId: string }>(
      `SELECT DISTINCT branch_id AS "branchId" FROM (
         SELECT branch_id FROM professionals WHERE clinic_id=$1 AND id=$2
         UNION ALL SELECT branch_id FROM rooms WHERE clinic_id=$1 AND id=$3
         UNION ALL SELECT branch_id FROM group_classes WHERE clinic_id=$1 AND id=$4
         UNION ALL SELECT branch_id FROM appointments WHERE clinic_id=$1 AND id=$5
       ) resources`,
      [
        clinicId,
        refs.professionalId ?? null,
        refs.roomId ?? null,
        refs.groupId ?? null,
        refs.appointmentId ?? null,
      ],
    );
    if (result.rows.length > 1)
      throw new DomainError(
        "BRANCH_MISMATCH",
        "Profissional e sala precisam ser da mesma filial.",
        409,
      );
    const branchId = result.rows[0]?.branchId ?? null;
    if (branchId) this.assertBranchInScope(branchId);
    return branchId;
  }

  /** Grava as filiais do usuário na transação do chamador. */
  async setUserBranchAccess(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    userId: string,
    access: UserBranchAccess,
  ) {
    const branchIds = access.allBranches ? [] : [...new Set(access.branchIds)];
    const found = await client.query(
      "SELECT id FROM branches WHERE clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(id))",
      [clinicId, branchIds],
    );
    if (found.rowCount !== branchIds.length)
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    await client.query(
      "UPDATE users SET all_branches=$3 WHERE clinic_id=$1 AND id=$2",
      [clinicId, userId, access.allBranches],
    );
    await client.query(
      "DELETE FROM user_branches WHERE clinic_id=$1 AND user_id=$2",
      [clinicId, userId],
    );
    await insertRows(
      client,
      "user_branches",
      branchIds.map((branchId) => ({
        clinic_id: clinicId,
        user_id: userId,
        branch_id: branchId,
      })),
    );
    await this.addAdminAudit(
      client,
      clinicId,
      actorUserId,
      "users.branches_updated",
      "user",
      userId,
      { allBranches: access.allBranches, branchIds },
    );
  }

  async findAdminUser(
    client: Pool | PoolClient,
    clinicId: string,
    userId: string,
  ) {
    const result = await client.query<AdminUserRow>(
      `${adminUserSelect} WHERE u.id = $2`,
      [clinicId, userId],
    );
    return result.rows[0] ? mapAdminUserWithCommission(result.rows[0]) : null;
  }

  /** Regra de comissão do próprio usuário (`commission_rules.user_id`) + auditoria. */
  async insertUserCommissionRule(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    userId: string,
    input: AdminUserCommissionInput,
  ) {
    // Chamado dentro de transação: um erro aqui desfaz tudo (o chamador faz ROLLBACK).
    // Mesma vigência: é uma correção do percentual. O FOR UPDATE trava a regra e também a
    // geração de lançamentos que a referenciam (a FK pede LOCK IN SHARE MODE, que conflita).
    const existing = await client.query<{
      id: string;
      percentage: string;
      kind: string;
      fixedAmountInCents: number | null;
      effectiveUntil: string | null;
    }>(
      `SELECT id, percentage,kind,fixed_amount_in_cents AS "fixedAmountInCents",effective_until AS "effectiveUntil" FROM commission_rules
       WHERE clinic_id = $1 AND user_id = $2 AND effective_from = $3 AND service_id IS NULL
       FOR UPDATE`,
      [clinicId, userId, input.effectiveFrom],
    );
    const current = existing.rows[0];
    if (current) {
      const previousPercentage = Number(current.percentage);
      if (
        Math.round(previousPercentage * 100) ===
          Math.round(input.percentage * 100) &&
        current.kind === "percentage" &&
        current.effectiveUntil === (input.effectiveUntil ?? null)
      )
        return;
      const used = await client.query(
        `SELECT 1 FROM commission_entries WHERE clinic_id = $1 AND rule_id = $2 LIMIT 1`,
        [clinicId, current.id],
      );
      if (used.rows[0])
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Esta comissão já foi usada em lançamentos; escolha outra data de início.",
          409,
        );
      await client.query(
        `UPDATE commission_rules SET percentage = $3,kind='percentage',fixed_amount_in_cents=NULL,effective_until=$4,active=1
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, current.id, input.percentage, input.effectiveUntil ?? null],
      );
      const updated = await client.query<{ percentage: string }>(
        "SELECT percentage FROM commission_rules WHERE id = $1",
        [current.id],
      );
      await this.addAdminAudit(
        client,
        clinicId,
        actorUserId,
        "users.commission_updated",
        "user",
        userId,
        {
          ruleId: current.id,
          percentage: Number(updated.rows[0]!.percentage),
          previousPercentage,
          effectiveFrom: input.effectiveFrom,
        },
      );
      return;
    }
    let rule: { id: string; percentage: string; effectiveFrom: string };
    try {
      const ruleId = randomUUID();
      await client.query(
        `INSERT INTO commission_rules (clinic_id, user_id, percentage, effective_from,kind,effective_until,id)
         VALUES ($1, $2, $3, $4,'percentage',$5,$6)`,
        [
          clinicId,
          userId,
          input.percentage,
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          ruleId,
        ],
      );
      const result = await client.query<{
        id: string;
        percentage: string;
        effectiveFrom: string;
      }>(
        `SELECT id, percentage, effective_from AS "effectiveFrom" FROM commission_rules WHERE id = $1`,
        [ruleId],
      );
      rule = result.rows[0]!;
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Já existe uma regra nesta vigência.",
          409,
        );
      throw error;
    }
    await this.addAdminAudit(
      client,
      clinicId,
      actorUserId,
      "users.commission_updated",
      "user",
      userId,
      {
        ruleId: rule.id,
        percentage: Number(rule.percentage),
        effectiveFrom: rule.effectiveFrom,
      },
    );
  }

  async readAdminAuditEvents(
    clinicId: string,
    limit: number,
    cursor?: string,
    filters: AuditHistoryFilters = {},
  ) {
    const values: unknown[] = [clinicId, cursor ?? null, limit];
    const predicates: string[] = [];
    const parameter = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.module)
      predicates.push(`ae.module = ${parameter(filters.module)}`);
    if (filters.action)
      predicates.push(`ae.action = ${parameter(filters.action)}`);
    if (filters.actorUserId)
      predicates.push(`ae.actor_user_id = ${parameter(filters.actorUserId)}`);
    // Cada palavra precisa aparecer na ação, na descrição ou nos metadados (exceto os
    // clínicos); a colação do banco ignora maiúsculas e acentos.
    for (const word of (filters.search ?? "").split(/\s+/).filter(Boolean)) {
      const term = parameter(
        `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
      );
      predicates.push(
        `(ae.action LIKE ${term} OR ae.description LIKE ${term} OR (ae.module <> 'clinical' AND CAST(ae.metadata AS CHAR) LIKE ${term}))`,
      );
    }
    if (filters.from)
      predicates.push(
        `ae.created_at >= ${localDayStart(parameter(filters.from))}`,
      );
    if (filters.to)
      predicates.push(
        `ae.created_at < ${localDayStart(`DATE_ADD(${parameter(filters.to)}, INTERVAL 1 DAY)`)}`,
      );
    const result = await this.pool.query<{
      id: string;
      clinicId: string;
      actorUserId: string | null;
      ipAddress: string | null;
      module: AppModule;
      description: string;
      action: string;
      entityType: string;
      entityId: string | null;
      actorName: string | null;
      metadata: Record<string, unknown>;
      createdAt: Date;
    }>(
      `SELECT ae.id, ae.clinic_id AS "clinicId", ae.actor_user_id AS "actorUserId",
              ae.ip_address AS "ipAddress", ae.module, ae.description, ae.action, ae.entity_type AS "entityType",
              ae.entity_id AS "entityId", u.full_name AS "actorName",
              ae.metadata, ae.created_at AS "createdAt"
       FROM ${historyEventsTable("$1")} ae LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.clinic_id = $1
         -- Evento com data futura (dado inconsistente) não entra no histórico.
         AND ae.created_at <= NOW(6) + INTERVAL 1 MINUTE
         ${predicates.map((predicate) => `AND ${predicate}`).join("\n")}
         AND ($2 IS NULL OR (ae.created_at, ae.id) < (
           SELECT h.created_at, h.id FROM ${historyEventsTable("$1")} h WHERE h.id = $2
         ))
       ORDER BY ae.created_at DESC, ae.id DESC LIMIT $3`,
      values,
    );
    return result.rows.map((row): AdminAuditEvent => ({
      id: row.id,
      clinicId: row.clinicId,
      module: row.module,
      // Eventos montados das tabelas de origem levam o rótulo do catálogo de ações.
      description:
        (json<{ sourceTable?: string }>(row.metadata).sourceTable &&
          historyAction(row.action)?.label) ||
        row.description,
      ...(row.actorUserId ? { actorUserId: row.actorUserId } : {}),
      ...(row.ipAddress ? { ipAddress: row.ipAddress } : {}),
      action: row.action,
      entityType: row.entityType,
      ...(row.entityId ? { entityId: row.entityId } : {}),
      ...(row.actorName ? { actorName: row.actorName } : {}),
      metadata: json(row.metadata),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async insertPatient(
    client: Pool | PoolClient,
    clinicId: string,
    input: PatientImportInput,
  ) {
    const id = randomUUID();
    // Prontuário sequencial da clínica (QM15), sem trecho do UUID.
    const recordNumber = formatSequenceNumber(
      "PAC",
      await nextClinicSequence(client, clinicId, "patient_record"),
    );
    try {
      await client.query(
        `
          INSERT INTO patients (
            id, clinic_id, record_number, full_name, cpf, email, phone, whatsapp, birth_date,
            emergency_contact_name, emergency_contact_phone, emergency_contact_whatsapp, notes, tags, profile, extra_fields
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `,
        [
          id,
          clinicId,
          recordNumber,
          input.fullName,
          input.cpf || null,
          input.email || null,
          input.phone,
          input.whatsapp || null,
          input.birthDate || null,
          input.emergencyContactName || null,
          input.emergencyContactPhone || null,
          input.emergencyContactWhatsapp || null,
          input.notes || null,
          input.tags,
          JSON.stringify(patientProfile(input)),
          JSON.stringify(input.extraFields ?? {}),
        ],
      );
      const result = await client.query<PatientRow>(
        `SELECT ${patientColumns} FROM patients WHERE id = $1`,
        [id],
      );
      return mapPatient(result.rows[0]!);
    } catch (error) {
      if (hasDatabaseCode(error, "23505")) {
        throw new DomainError(
          "PATIENT_DUPLICATE",
          "Já existe um cliente com este CPF.",
          409,
        );
      }
      throw error;
    }
  }

  async assertTemplateServices(
    client: PoolClient,
    clinicId: string,
    entries: PlanTemplateInput["services"],
  ) {
    const result = await client.query(
      "SELECT id FROM services WHERE clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(id)) AND active LOCK IN SHARE MODE",
      [clinicId, entries.map((item) => item.serviceId)],
    );
    if (result.rowCount !== entries.length)
      throw new DomainError(
        "PLAN_TEMPLATE_SERVICE_NOT_FOUND",
        "Serviço ativo não encontrado nesta clínica.",
        404,
      );
  }

  async writeTemplateServices(
    client: PoolClient,
    clinicId: string,
    id: string,
    entries: PlanTemplateInput["services"],
  ) {
    await client.query(
      "DELETE FROM plan_template_services WHERE clinic_id=$1 AND template_id=$2",
      [clinicId, id],
    );
    for (const [position, entry] of entries.entries())
      await client.query(
        "INSERT INTO plan_template_services (clinic_id,template_id,service_id,position,total_sessions,total_value_in_cents,sessions_per_week) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          clinicId,
          id,
          entry.serviceId,
          position,
          entry.totalSessions,
          entry.totalValueInCents,
          entry.sessionsPerWeek ?? null,
        ],
      );
  }

  async getPatientTag(
    client: Pool | PoolClient,
    clinicId: string,
    tagId: string,
  ) {
    const result = await client.query<PatientTagRow>(
      `SELECT ${patientTagColumns} FROM patient_tags pt WHERE pt.clinic_id = $1 AND pt.id = $2`,
      [clinicId, tagId],
    );
    return result.rows[0] ? mapPatientTag(result.rows[0]) : null;
  }

  /**
   * Agenda livre para um atendimento ou bloqueio. No Postgres eram restrições de exclusão
   * (sem sobreposição por profissional e por sala) e gatilhos entre atendimentos e
   * bloqueios; aqui a checagem roda na transação de quem chama, sob uma trava da agenda da
   * clínica, e responde com o mesmo código (`23P01`) que o repositório já trata.
   */
  async assertAgendaFree(
    client: PoolClient,
    clinicId: string,
    slot: {
      kind: "appointment" | "block";
      professionalId: string | null | undefined;
      roomId: string | null | undefined;
      startsAt: Date | string;
      endsAt: Date | string;
      ignoreId?: string | undefined;
    },
  ) {
    await client.lock(`agenda:${clinicId}`);
    const params = [
      clinicId,
      slot.professionalId ?? null,
      slot.roomId ?? null,
      new Date(slot.startsAt),
      new Date(slot.endsAt),
      slot.ignoreId ?? null,
    ];
    const conflict = await client.query(
      `SELECT 1 FROM appointments a
       WHERE a.clinic_id = $1 AND a.deleted_at IS NULL AND a.status <> 'cancelled'
         AND (${slot.kind === "appointment" ? "$6 IS NULL OR a.id <> $6" : "TRUE"})
         AND ((a.professional_id = $2) OR (a.room_id = $3))
         AND a.starts_at < $5 AND a.ends_at > $4
       UNION ALL
       SELECT 1 FROM schedule_blocks b
       WHERE b.clinic_id = $1 AND b.status = 'active'
         AND (${slot.kind === "block" ? "$6 IS NULL OR b.id <> $6" : "TRUE"})
         AND ((b.professional_id = $2) OR (b.room_id = $3))
         AND b.starts_at < $5 AND b.ends_at > $4
       LIMIT 1`,
      params,
    );
    if (conflict.rowCount)
      throw new DatabaseError(
        slot.kind === "appointment"
          ? "appointment conflicts with another appointment or schedule block"
          : "schedule block conflicts with appointment or block",
        "23P01",
        undefined,
        undefined,
      );
  }

  /** Confere o vínculo sem antecipar a obrigatoriedade de plano da AP3. */
  async appointmentPlanId(
    client: PoolClient,
    clinicId: string,
    input: Omit<AppointmentInput, "patientId">,
    patientId: string | null,
  ): Promise<string | null> {
    if (!patientId || input.visitType === "trial" || !input.planId) return null;
    const plan = await client.query<{ id: string }>(
      `SELECT pp.id FROM patient_plans pp
       JOIN patient_plan_services ps ON ps.clinic_id=pp.clinic_id AND ps.plan_id=pp.id
       WHERE pp.clinic_id=$1 AND pp.id=$2 AND pp.patient_id=$3 AND ps.service_id=$4
         AND pp.deleted_at IS NULL
       LOCK IN SHARE MODE`,
      [clinicId, input.planId, patientId, input.serviceId],
    );
    if (!plan.rows[0])
      throw new DomainError(
        "PLAN_NOT_FOUND",
        "Plano do cliente para este serviço não encontrado.",
        404,
      );
    return plan.rows[0].id;
  }

  /** Grava o atendimento (de cliente ou de lead) já validado. */
  async insertAppointment(
    clinicId: string,
    input: Omit<AppointmentInput, "patientId">,
    durationMinutes: number,
    owner:
      { patientId: string; leadId: null } | { patientId: null; leadId: string },
    client: Pool | PoolClient = this.pool,
  ): Promise<Appointment> {
    if (!("lock" in client))
      return this.inTransaction((connection) =>
        this.insertAppointment(
          clinicId,
          input,
          durationMinutes,
          owner,
          connection,
        ),
      );
    const planId = await this.appointmentPlanId(
      client,
      clinicId,
      input,
      owner.patientId,
    );
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    if (
      await hasGroupSessionConflict(
        client,
        clinicId,
        input.professionalId,
        input.roomId,
        startsAt,
        endsAt,
      )
    )
      throw new DomainError(
        "APPOINTMENT_CONFLICT",
        "O profissional ou a sala está ocupado por uma turma nesse horário.",
        409,
      );
    const branchId = await this.resourceBranch(client, clinicId, {
      professionalId: input.professionalId,
      roomId: input.roomId,
    });
    try {
      await this.assertAgendaFree(client, clinicId, {
        kind: "appointment",
        professionalId: input.professionalId,
        roomId: input.roomId,
        startsAt,
        endsAt,
      });
      const appointmentId = randomUUID();
      await client.query(
        `
          INSERT INTO appointments (
            clinic_id, patient_id, lead_id, professional_id, room_id,
            service_id, starts_at, ends_at, notes, visit_type, branch_id, id, patient_plan_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${branchOrDefault("$11", "$1")}, $12, $13)
        `,
        [
          clinicId,
          owner.patientId,
          owner.leadId,
          input.professionalId,
          input.roomId,
          input.serviceId,
          startsAt,
          endsAt,
          input.notes || null,
          input.visitType,
          branchId,
          appointmentId,
          planId,
        ],
      );
      return (await this.findAppointment(clinicId, appointmentId, client))!;
    } catch (error) {
      if (hasDatabaseCode(error, "23P01") || hasDatabaseCode(error, "40P01")) {
        throw new DomainError(
          "APPOINTMENT_CONFLICT",
          "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
          409,
        );
      }
      throw error;
    }
  }

  /** Matricula (ou põe na lista de espera) dentro da transação de quem chama. */
  async insertGroupEnrollment(
    client: PoolClient,
    clinicId: string,
    input: GroupEnrollmentInput,
  ) {
    try {
      const group = await client.query<{ capacity: number }>(
        `SELECT capacity FROM group_classes WHERE id=$2 AND clinic_id=$1 AND active FOR UPDATE`,
        [clinicId, input.groupId],
      );
      const patient = await client.query<{ fullName: string }>(
        `SELECT full_name AS "fullName" FROM patients WHERE id=$2 AND clinic_id=$1 AND status='active' AND deleted_at IS NULL`,
        [clinicId, input.patientId],
      );
      if (!group.rows[0] || !patient.rows[0])
        throw new DomainError(
          "GROUP_OR_PATIENT_NOT_FOUND",
          "Turma ou cliente ativo não encontrado.",
          404,
        );
      const counts = await client.query<{
        activeCount: string;
        maxQueue: number | null;
      }>(
        `SELECT COUNT(CASE WHEN status='active' THEN 1 END) AS "activeCount",MAX(CASE WHEN status='waitlisted' THEN queue_position END) AS "maxQueue" FROM group_enrollments WHERE group_id=$1`,
        [input.groupId],
      );
      const status: GroupEnrollment["status"] =
        Number(counts.rows[0]!.activeCount) < group.rows[0].capacity
          ? "active"
          : "waitlisted";
      const enrollmentId = randomUUID();
      await client.query(
        // Início em outra data que não hoje (fuso da clínica): meia-noite desse dia.
        `INSERT INTO group_enrollments (id,clinic_id,group_id,patient_id,status,queue_position,enrolled_at)
         VALUES ($6,$1,$2,$3,$4,$5,CASE WHEN $7 IS NULL OR $7=${localToday()} THEN NOW(6) ELSE ${localDayStart("$7")} END)`,
        [
          clinicId,
          input.groupId,
          input.patientId,
          status,
          status === "waitlisted" ? (counts.rows[0]!.maxQueue ?? 0) + 1 : null,
          enrollmentId,
          input.startsOn ?? null,
        ],
      );
      const result = await client.query<GroupEnrollmentRow>(
        `SELECT ${groupEnrollmentColumns} FROM group_enrollments e JOIN patients p ON p.id=e.patient_id WHERE e.id=$1`,
        [enrollmentId],
      );
      return mapGroupEnrollment(result.rows[0]!);
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "GROUP_ENROLLMENT_EXISTS",
          "O cliente já está matriculado ou na lista de espera.",
          409,
        );
      throw error;
    }
  }

  async ensureGroupSessionsUntil(clinicId: string, until: Date) {
    // Só renova quando falta menos de uma semana para o fim do período reservado.
    const renewBefore = new Date(until.getTime() - 7 * 86_400_000);
    const pending = await this.pool.query(
      `SELECT 1 FROM group_classes WHERE clinic_id=$1 AND active AND (sessions_generated_until IS NULL OR sessions_generated_until<$2) LIMIT 1`,
      [clinicId, renewBefore],
    );
    if (!pending.rowCount) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.ensureGroupSessions(client, clinicId, until, { renewBefore });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Reserva na agenda os encontros das turmas ativas até `until`. Datas que já estiverem
  // ocupadas por atendimento, bloqueio ou outra turma ficam de fora.
  async ensureGroupSessions(
    client: PoolClient,
    clinicId: string,
    until: Date,
    options: { groupId?: string; renewBefore?: Date } = {},
  ) {
    const groups = await client.query<{
      id: string;
      professionalId: string;
      roomId: string;
      weeklySlots: GroupClassInput["weeklySlots"];
      generatedUntil: Date | null;
      timezone: string;
    }>(
      `SELECT g.id,g.professional_id AS "professionalId",g.room_id AS "roomId",g.weekly_slots AS "weeklySlots",g.sessions_generated_until AS "generatedUntil",c.timezone FROM group_classes g JOIN clinics c ON c.id=g.clinic_id WHERE g.clinic_id=$1 AND g.active AND ($2 IS NULL OR g.id=$2) AND (g.sessions_generated_until IS NULL OR g.sessions_generated_until<$3) ORDER BY g.created_at FOR UPDATE`,
      [clinicId, options.groupId ?? null, options.renewBefore ?? until],
    );
    const now = new Date();
    for (const group of groups.rows) {
      const after =
        group.generatedUntil && group.generatedUntil > now
          ? group.generatedUntil
          : now;
      const occurrences = weeklyOccurrences(
        group.weeklySlots,
        group.timezone,
        after,
        until,
      );
      if (occurrences.length)
        await client.query(
          `INSERT INTO group_sessions(clinic_id,group_id,starts_at,ends_at) SELECT $1,$2,o.starts_at,o.ends_at FROM JSON_TABLE($5, '$[*]' COLUMNS (starts_at DATETIME(6) PATH '$.starts_at', ends_at DATETIME(6) PATH '$.ends_at')) AS o WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.deleted_at IS NULL AND a.status<>'cancelled' AND (a.professional_id=$3 OR a.room_id=$4) AND a.starts_at<o.ends_at AND a.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM schedule_blocks b WHERE b.clinic_id=$1 AND b.status='active' AND (b.professional_id=$3 OR b.room_id=$4) AND b.starts_at<o.ends_at AND b.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM group_sessions gs JOIN group_classes og ON og.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND (og.professional_id=$3 OR og.room_id=$4) AND gs.starts_at<o.ends_at AND gs.ends_at>o.starts_at) ON DUPLICATE KEY UPDATE group_sessions.group_id=group_sessions.group_id`,
          [
            clinicId,
            group.id,
            group.professionalId,
            group.roomId,
            JSON.stringify(
              occurrences.map((item) => ({
                starts_at: sqlTimestamp(item.startsAt),
                ends_at: sqlTimestamp(item.endsAt),
              })),
            ),
          ],
        );
      await client.query(
        `UPDATE group_classes SET sessions_generated_until=$2 WHERE id=$1`,
        [group.id, until],
      );
    }
  }

  // Impede salvar uma turma cujos horários fixos batem com atendimentos futuros ou com outra
  // turma do mesmo profissional ou sala.
  async assertGroupScheduleAvailable(
    client: PoolClient,
    clinicId: string,
    group: {
      id?: string;
      professionalId: string;
      roomId: string;
      weeklySlots: GroupClassInput["weeklySlots"];
    },
  ) {
    const clinic = await client.query<{ timezone: string }>(
      `SELECT timezone FROM clinics WHERE id=$1`,
      [clinicId],
    );
    const busy = await client.query<{
      startsAt: Date;
      endsAt: Date;
      label: string;
    }>(
      `SELECT a.starts_at AS "startsAt",a.ends_at AS "endsAt",'Atendimento de ' || coalesce(pt.full_name, ld.full_name) AS label FROM appointments a LEFT JOIN patients pt ON pt.id=a.patient_id LEFT JOIN leads ld ON ld.id=a.lead_id WHERE a.clinic_id=$1 AND a.deleted_at IS NULL AND a.status<>'cancelled' AND a.ends_at>NOW(6) AND (a.professional_id=$2 OR a.room_id=$3)
       UNION ALL
       SELECT gs.starts_at,gs.ends_at,g.name FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND gs.ends_at>NOW(6) AND ($4 IS NULL OR gs.group_id<>$4) AND (g.professional_id=$2 OR g.room_id=$3)`,
      [clinicId, group.professionalId, group.roomId, group.id ?? null],
    );
    const patterns = await client.query<{
      label: string;
      slots: GroupClassInput["weeklySlots"];
    }>(
      `SELECT name AS label,weekly_slots AS slots FROM group_classes WHERE clinic_id=$1 AND active AND ($4 IS NULL OR id<>$4) AND (professional_id=$2 OR room_id=$3)`,
      [clinicId, group.professionalId, group.roomId, group.id ?? null],
    );
    const conflicts = findWeeklyScheduleConflicts(
      group.weeklySlots,
      clinic.rows[0]?.timezone ?? "America/Sao_Paulo",
      busy.rows,
      patterns.rows,
    );
    if (conflicts.length)
      throw new DomainError(
        "GROUP_SCHEDULE_CONFLICT",
        groupScheduleConflictMessage(conflicts),
        409,
      );
  }

  /**
   * Transação na conexão de quem chama. `snapshot` lê tudo de uma mesma foto do banco
   * (REPEATABLE READ, só leitura) — no MySQL isso precisa ser definido antes do BEGIN.
   */
  async inTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
    { snapshot = false }: { snapshot?: boolean } = {},
  ) {
    const client = await this.pool.connect();
    try {
      if (snapshot) {
        await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await client.query(
          "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
        );
      } else await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertPatientPlan(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    input: Omit<PatientPlanInput, "planTemplateId"> & {
      planTemplateId?: string | undefined;
    },
    creditReason: string,
    renewedFromPlanId?: string,
  ) {
    // Plano picado: forma e parcelas derivadas das formas; forma única dispensa a lista.
    input = withPlanPaymentParts(input);
    await client.lock(`plans:${clinicId}`);
    let allowed: string[];
    if (!renewedFromPlanId) {
      const template = await client.query<{ name: string }>(
        "SELECT name FROM plan_templates WHERE clinic_id=$1 AND id=$2 AND active LOCK IN SHARE MODE",
        [clinicId, input.planTemplateId ?? null],
      );
      if (!template.rows[0])
        throw new DomainError(
          "PLAN_TEMPLATE_NOT_FOUND",
          "Selecione um plano ativo cadastrado nesta clínica.",
          404,
        );
      input = { ...input, name: template.rows[0].name };
      const entries = await client.query<{ serviceId: string }>(
        'SELECT service_id AS "serviceId" FROM plan_template_services WHERE clinic_id=$1 AND template_id=$2',
        [clinicId, input.planTemplateId],
      );
      allowed = entries.rows.map((item) => item.serviceId);
    } else {
      const entries = await client.query<{ serviceId: string }>(
        'SELECT service_id AS "serviceId" FROM patient_plan_services WHERE clinic_id=$1 AND plan_id=$2',
        [clinicId, renewedFromPlanId],
      );
      allowed = entries.rows.map((item) => item.serviceId);
    }
    const totals = validatePlanComposition(
      input.services,
      input.totalValueInCents,
      allowed,
    );
    const patient = await client.query(
      "SELECT 1 FROM patients WHERE clinic_id=$1 AND id=$2 AND status='active' AND deleted_at IS NULL",
      [clinicId, input.patientId],
    );
    // O desconto é do plano: a renovação segue o do plano anterior, com o que já foi usado.
    const previous = renewedFromPlanId
      ? await client.query<{ discount: PatientDiscount | null }>(
          "SELECT discount FROM patient_plans WHERE clinic_id=$1 AND id=$2",
          [clinicId, renewedFromPlanId],
        )
      : null;
    const discounted = discountedPlanInstallments(
      planInstallmentSchedule(input),
      input.discount,
      previous?.rows[0]?.discount,
      input.orderDiscountInCents,
    );
    const context = await client.query<{ id: string; name: string }>(
      `SELECT s.id,coalesce((SELECT x.service_name FROM patient_plan_services x WHERE x.plan_id=$3 AND x.service_id=s.id),s.name) AS name
       FROM services s WHERE s.clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(s.id)) AND s.active LOCK IN SHARE MODE`,
      [
        clinicId,
        input.services.map((item) => item.serviceId),
        renewedFromPlanId ?? null,
      ],
    );
    if (!patient.rowCount || context.rowCount !== input.services.length)
      throw new DomainError(
        "PLAN_CONTEXT_NOT_FOUND",
        "Cliente ou serviço não encontrado.",
        404,
      );
    const autoRenew =
      Boolean(input.validUntil) &&
      (input.autoRenew ?? input.kind === "recurring");
    // Renovação fica na filial do plano anterior; venda nova, na da requisição.
    const previousBranch = renewedFromPlanId
      ? (
          await client.query<{ branchId: string }>(
            'SELECT branch_id AS "branchId" FROM patient_plans WHERE clinic_id=$1 AND id=$2',
            [clinicId, renewedFromPlanId],
          )
        ).rows[0]?.branchId
      : undefined;
    const planId = randomUUID();
    await client.query(
      `INSERT INTO patient_plans (
         clinic_id, patient_id, service_id, name, kind, total_sessions,
         remaining_sessions, valid_from, valid_until, total_value_in_cents,
         installments, first_due_date, auto_renew, renewed_from_plan_id, plan_template_id,
         branch_id, payment_method, id, discount, created_at, payment_parts
       ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         ${branchOrDefault("$15", "$1")}, $16, $17, $18, $19, $20
       )`,
      [
        clinicId,
        input.patientId,
        totals.serviceId,
        input.name,
        input.kind,
        totals.totalSessions,
        input.validFrom,
        input.validUntil || null,
        input.totalValueInCents,
        input.installments,
        input.firstDueDate,
        autoRenew,
        renewedFromPlanId ?? null,
        input.planTemplateId ?? null,
        previousBranch ?? this.branchWriteId(),
        input.paymentMethod ?? null,
        planId,
        discounted.discount ?? null,
        // Hora da venda pelo relógio da aplicação (o mesmo do relatório de vendas por período).
        new Date(),
        input.paymentParts ?? [],
      ],
    );
    for (const [position, entry] of input.services.entries()) {
      const serviceName = context.rows.find(
        (service) => service.id === entry.serviceId,
      )!.name;
      await client.query(
        `INSERT INTO patient_plan_services
        (clinic_id,plan_id,service_id,service_name,position,total_sessions,remaining_sessions,total_value_in_cents)
        VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`,
        [
          clinicId,
          planId,
          entry.serviceId,
          serviceName,
          position,
          entry.totalSessions,
          entry.totalValueInCents,
        ],
      );
      await client.query(
        `INSERT INTO session_movements (clinic_id,plan_id,service_id,kind,quantity,reason,actor_user_id)
        VALUES ($1,$2,$3,'credit',$4,$5,$6)`,
        [
          clinicId,
          planId,
          entry.serviceId,
          entry.totalSessions,
          creditReason,
          actorUserId,
        ],
      );
    }
    // Cobrança proporcional com o valor informado à mão: as primeiras (uma por forma).
    const manualCharges = hasManualFirstCharge(input)
      ? planProratedChargeCount(input)
      : 0;
    for (const [index, installment] of discounted.installments.entries()) {
      const amount = installment.amountInCents;
      const receivableId = randomUUID();
      await client.query(
        `INSERT INTO receivables (
           clinic_id, patient_id, plan_id, description, installment_number,
           installment_count, due_date, amount_in_cents, branch_id, id,
           customer_discount_in_cents, payment_parts, manual_amount
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           (SELECT branch_id FROM patient_plans WHERE clinic_id=$1 AND id=$3), $9, $10, $11, $12
         )`,
        [
          clinicId,
          input.patientId,
          planId,
          `${input.name} · ${installment.installmentNumber}/${discounted.installments.length}`,
          installment.installmentNumber,
          discounted.installments.length,
          installment.dueDate,
          amount,
          receivableId,
          installment.customerDiscountInCents,
          // Plano picado: a forma prevista desta cobrança (sugerida na baixa).
          input.paymentParts && installment.paymentMethod
            ? [
                {
                  paymentMethod: installment.paymentMethod,
                  amountInCents: amount,
                },
              ]
            : [],
          index < manualCharges,
        ],
      );
      await client.query(
        `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents)
         VALUES ($1, $2, $3, 'created', $4)`,
        [clinicId, receivableId, actorUserId, amount],
      );
    }
    return planId;
  }

  /** Trava o plano e confirma que ele ainda pode ganhar um sucessor. */
  async lockRenewablePlan(
    client: PoolClient,
    clinicId: string,
    planId: string,
  ) {
    await client.query(
      "SELECT 1 FROM patient_plans WHERE clinic_id = $1 AND id = $2 FOR UPDATE",
      [clinicId, planId],
    );
    const plan = await this.findPatientPlan(client, clinicId, planId);
    if (!plan) return null;
    if (plan.sourceTabId)
      throw new DomainError(
        "TAB_PLAN_MANAGED",
        "O serviço avulso deve ser administrado pela comanda de origem.",
        409,
      );
    if (plan.status === "cancelled") {
      throw new DomainError(
        "PLAN_CANCELLED",
        "Um plano cancelado não pode ser renovado.",
        409,
      );
    }
    if (plan.renewedByPlanId) {
      throw new DomainError(
        "PLAN_ALREADY_RENEWED",
        "Este plano já foi renovado.",
        409,
      );
    }
    return plan;
  }

  async findRecurringPayable(
    client: Pool | PoolClient,
    clinicId: string,
    recurringPayableId: string,
  ) {
    const result = await client.query<RecurringPayableRow>(
      `SELECT ${recurringPayableColumns} FROM recurring_payables rp
       JOIN financial_categories fc ON fc.id = rp.category_id
       LEFT JOIN cost_centers cc ON cc.id = rp.cost_center_id
       WHERE rp.clinic_id = $1 AND rp.id = $2`,
      [clinicId, recurringPayableId],
    );
    return result.rows[0] ? mapRecurringPayable(result.rows[0]) : null;
  }

  async insertCommissionRule(
    client: Pool | PoolClient,
    clinicId: string,
    input: CommissionRuleInput,
  ) {
    try {
      const ruleId = randomUUID();
      await client.query(
        `INSERT INTO commission_rules (clinic_id, professional_id, percentage, effective_from,kind,effective_until,id)
          SELECT $1,id,$3,$4,'percentage',$5,$6 FROM professionals WHERE clinic_id = $1 AND id = $2`,
        [
          clinicId,
          input.professionalId,
          input.percentage,
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          ruleId,
        ],
      );
      const result = await client.query<CommissionRuleRow>(
        `SELECT i.id, i.clinic_id AS "clinicId", i.professional_id AS "professionalId",
          p.full_name AS "professionalName", i.percentage,i.kind,i.fixed_amount_in_cents AS "fixedAmountInCents",i.service_id AS "serviceId",i.effective_until AS "effectiveUntil", i.effective_from AS "effectiveFrom",
          i.active, i.created_at AS "createdAt" FROM commission_rules i JOIN professionals p ON p.id = i.professional_id
         WHERE i.id = $1`,
        [ruleId],
      );
      if (!result.rows[0])
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
      return mapCommissionRule(result.rows[0]);
    } catch (error) {
      if (hasDatabaseCode(error, "23505"))
        throw new DomainError(
          "COMMISSION_RULE_DUPLICATE",
          "Já existe uma regra nesta vigência.",
          409,
        );
      throw error;
    }
  }

  async listCommissions(
    clinicId: string,
    competence?: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<CommissionEntryRow>(
      `SELECT ce.id, ce.clinic_id AS "clinicId",
      ce.professional_id AS "professionalId", p.full_name AS "professionalName",
      ce.appointment_id AS "appointmentId",ce.group_attendance_id AS "groupAttendanceId",ce.service_id AS "serviceId",ce.rule_id AS "ruleId",ce.rule_snapshot AS "ruleSnapshot", ce.competence, ce.base_amount_in_cents AS "baseAmountInCents",
      ce.percentage, ce.amount_in_cents AS "amountInCents", ce.status, ce.paid_at AS "paidAt",
      ce.created_at AS "createdAt",ce.payroll_payable_id AS "payrollPayableId" FROM commission_entries ce JOIN professionals p ON p.id = ce.professional_id
      WHERE ce.clinic_id = $1 AND ($2 IS NULL OR ce.competence = $2) ORDER BY ce.competence DESC`,
      [clinicId, competence ?? null],
    );
    return result.rows.map(mapCommissionEntry);
  }

  async addClinicalAccessEvent(
    clinicId: string,
    patientId: string,
    actorUserId: string,
    action: ClinicalAccessEvent["action"],
    entityType: ClinicalAccessEvent["entityType"],
    entityId?: string,
    client: Pool | PoolClient = this.pool,
  ) {
    await client.query(
      `INSERT INTO clinical_access_events
         (clinic_id, patient_id, actor_user_id, action, entity_type, entity_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clinicId, patientId, actorUserId, action, entityType, entityId ?? null],
    );
  }

  async addAdminAudit(
    client: Pool | PoolClient,
    clinicId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await client.query(
      `INSERT INTO audit_events
         (clinic_id, actor_user_id, action, entity_type, entity_id, metadata, module, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        clinicId,
        actorUserId,
        action,
        entityType,
        entityId ?? null,
        metadata,
        historyAction(action)?.module ??
          appModuleSchema.safeParse(metadata._module).data ??
          "settings",
        historyAction(action)?.label ??
          (typeof metadata._description === "string"
            ? metadata._description
            : "Alteração registrada"),
      ],
    );
  }

  async assertCommunicationAllowed(
    clinicId: string,
    patientId: string,
    channel: CommunicationChannel,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<{ allowed: boolean }>(
      `SELECT allowed FROM communication_preferences
       WHERE clinic_id = $1 AND patient_id = $2 AND channel = $3`,
      [clinicId, patientId, channel],
    );
    if (result.rows[0]?.allowed === false)
      throw new DomainError(
        "COMMUNICATION_OPT_OUT",
        "O cliente não autorizou mensagens neste canal.",
        409,
      );
  }

  async findIssuedDocument(
    client: Pool | PoolClient,
    clinicId: string,
    documentId: string,
  ) {
    const result = await client.query<IssuedDocumentRow>(
      `SELECT ${issuedDocumentColumns}
       FROM issued_documents d
       ${issuedDocumentJoins}
       WHERE d.clinic_id = $1 AND d.id = $2`,
      [clinicId, documentId],
    );
    return result.rows[0] ? mapIssuedDocument(result.rows[0]) : null;
  }

  async findLead(client: Pool | PoolClient, clinicId: string, leadId: string) {
    const result = await client.query<LeadRow>(
      `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [clinicId, leadId],
    );
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  async findLeadContact(
    clinicId: string,
    contactId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<LeadContactRow>(
      `SELECT lc.id, lc.clinic_id AS "clinicId", lc.lead_id AS "leadId",
              lc.channel, lc.contact_method AS "contactMethod", lc.direction, lc.notes, lc.reached, u.full_name AS "actorName",
              lc.occurred_at AS "occurredAt", lc.created_at AS "createdAt"
       FROM lead_contacts lc JOIN users u ON u.id = lc.actor_user_id
       WHERE lc.clinic_id = $1 AND lc.id = $2`,
      [clinicId, contactId],
    );
    return result.rows[0] ? mapLeadContact(result.rows[0]) : null;
  }

  async findLeadTask(clinicId: string, taskId: string) {
    const result = await this.pool.query<LeadTaskRow>(
      `SELECT lt.id, lt.clinic_id AS "clinicId", lt.lead_id AS "leadId",
              lt.title, lt.notes, lt.due_at AS "dueAt",
              lt.assigned_user_id AS "assignedUserId",
              u.full_name AS "assignedUserName", lt.status,
              lt.completed_at AS "completedAt", lt.created_at AS "createdAt",
              lt.updated_at AS "updatedAt"
       FROM lead_tasks lt LEFT JOIN users u ON u.id = lt.assigned_user_id
       WHERE lt.clinic_id = $1 AND lt.id = $2`,
      [clinicId, taskId],
    );
    return result.rows[0] ? mapLeadTask(result.rows[0]) : null;
  }

  async findAppointment(
    clinicId: string,
    appointmentId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<AppointmentRow>(
      `
        SELECT ${appointmentColumns}
        FROM appointments a
        ${appointmentJoins}
        WHERE a.clinic_id = $1 AND a.deleted_at IS NULL AND a.id = $2
      `,
      [clinicId, appointmentId],
    );
    return result.rows[0] ? mapAppointment(result.rows[0]) : null;
  }

  async findPatientTab(
    clinicId: string,
    tabId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const [tab, items] = await Promise.all([
      client.query<PatientTabRow>(
        `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",u.id AS "soldByUserId",u.full_name AS "soldByName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt",t.cancellation_reason AS "cancellationReason" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id LEFT JOIN users u ON u.id=t.opened_by_user_id AND u.clinic_id=t.clinic_id WHERE t.clinic_id=$1 AND t.id=$2`,
        [clinicId, tabId],
      ),
      client.query<PatientTabItemRow>(
        `SELECT i.id,i.tab_id AS "tabId",i.product_id AS "productId",p.name AS "productName",i.size,i.quantity,i.unit_price_in_cents AS "unitPriceInCents",i.unit_cost_in_cents AS "unitCostInCents" FROM patient_tab_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 AND i.tab_id=$2 ORDER BY i.created_at`,
        [clinicId, tabId],
      ),
    ]);
    const services = await client.query<PatientTabServiceItem>(
      `SELECT id,appointment_id AS "appointmentId",service_id AS "serviceId",service_name AS "serviceName",professional_id AS "professionalId",professional_name AS "professionalName",amount_in_cents AS "amountInCents" FROM patient_tab_services WHERE clinic_id=$1 AND tab_id=$2`,
      [clinicId, tabId],
    );
    return tab.rows[0]
      ? {
          ...mapPatientTab(tab.rows[0], items.rows.map(mapPatientTabItem)),
          services: services.rows,
        }
      : null;
  }

  async findScheduleBlock(
    clinicId: string,
    blockId: string,
    client: Pool | PoolClient = this.pool,
  ) {
    const result = await client.query<ScheduleBlockRow>(
      `SELECT b.id, b.clinic_id AS "clinicId",
              b.professional_id AS "professionalId", b.room_id AS "roomId",
              pr.full_name AS "professionalName", r.name AS "roomName",
              b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.reason,
              b.status, b.created_at AS "createdAt", b.updated_at AS "updatedAt"
       FROM schedule_blocks b
       LEFT JOIN professionals pr ON pr.id = b.professional_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE b.clinic_id = $1 AND b.id = $2`,
      [clinicId, blockId],
    );
    return result.rows[0] ? mapScheduleBlock(result.rows[0]) : null;
  }

  async findPatientPlan(
    client: Pool | PoolClient,
    clinicId: string,
    planId: string,
  ) {
    const result = await client.query<PatientPlanRow>(
      `SELECT ${patientPlanColumns}
       FROM patient_plans pp
       JOIN patients p ON p.id = pp.patient_id
       JOIN services s ON s.id = pp.service_id
       WHERE pp.clinic_id = $1 AND pp.id = $2 AND pp.deleted_at IS NULL`,
      [clinicId, planId],
    );
    return result.rows[0] ? mapPatientPlan(result.rows[0]) : null;
  }

  async findReceivable(
    client: Pool | PoolClient,
    clinicId: string,
    receivableId: string,
  ) {
    const result = await client.query<ReceivableRow>(
      `SELECT ${receivableColumns}
       FROM receivables r JOIN patients p ON p.id = r.patient_id
       WHERE r.clinic_id = $1 AND r.id = $2`,
      [clinicId, receivableId],
    );
    return result.rows[0] ? mapReceivable(result.rows[0]) : null;
  }

  async findPayable(
    client: Pool | PoolClient,
    clinicId: string,
    payableId: string,
  ) {
    const result = await client.query<PayableRow>(
      `SELECT ${payableColumns} FROM payables py
       JOIN financial_categories fc ON fc.id = py.category_id
       LEFT JOIN cost_centers cc ON cc.id = py.cost_center_id
       WHERE py.clinic_id = $1 AND py.id = $2`,
      [clinicId, payableId],
    );
    return result.rows[0] ? mapPayable(result.rows[0]) : null;
  }

  /**
   * Estorna a baixa de um recebível pago, dentro da transação de quem chama (a linha já
   * travada com `FOR UPDATE`): a parcela volta a "open" sem o desconto e sem os juros da baixa.
   */
  async reversePaidReceivableWith(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    receivableId: string,
  ) {
    // Mesmo estorno do Financeiro (forma por forma no picado), na transação de quem chama.
    const reversed = await this.applyReceivablePayment(
      client,
      clinicId,
      actorUserId,
      receivableId,
      "payment_reversal",
    );
    if (!reversed)
      throw new DomainError(
        "RECEIVABLE_NOT_PAID",
        "Somente pagamentos confirmados podem ser estornados.",
        409,
      );
  }

  async changeReceivablePayment(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
    adjustments: SettlementAdjustments = {},
  ) {
    return this.inTransaction((client) =>
      this.applyReceivablePayment(
        client,
        clinicId,
        actorUserId,
        receivableId,
        operation,
        paymentMethod,
        timing,
        adjustments,
      ),
    );
  }

  /**
   * Baixa ou estorno de uma parcela na transação de quem chama. No pagamento picado, um
   * evento de caixa por forma; o estorno desfaz forma por forma a última baixa.
   */
  private async applyReceivablePayment(
    client: PoolClient,
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
    adjustments: SettlementAdjustments = {},
  ) {
    {
      const current = await client.query<{
        status: ReceivableStatus;
        amountInCents: number;
        installmentCount: number;
        paymentMethod: PaymentMethod | null;
        cashAvailableAt: Date | null;
      }>(
        `SELECT status,payment_method AS "paymentMethod",cash_available_at AS "cashAvailableAt", amount_in_cents AS "amountInCents", installment_count AS "installmentCount"
         FROM receivables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, receivableId],
      );
      if (!current.rows[0]) return null;
      const expected = operation === "payment" ? "open" : "paid";
      if (current.rows[0].status !== expected) {
        throw new DomainError(
          operation === "payment"
            ? "RECEIVABLE_NOT_OPEN"
            : "RECEIVABLE_NOT_PAID",
          operation === "payment"
            ? "Somente contas abertas podem ser baixadas."
            : "Somente pagamentos confirmados podem ser estornados.",
          409,
        );
      }
      // Plano já parcelado não se parcela de novo na forma de pagamento (nem no picado).
      if (
        operation === "payment" &&
        [adjustments, ...(adjustments.payments ?? [])].some(
          (part) => (part.paymentInstallments ?? 1) > 1,
        ) &&
        !acceptsPaymentInstallments({
          installmentCount: Number(current.rows[0].installmentCount),
        })
      )
        throw new DomainError(
          "INSTALLMENT_PAYMENT_SPLIT",
          installmentPaymentSplitIssue,
          400,
        );
      // U39: desconto, juros e pagamento parcial (o saldo vira nova parcela).
      let receivedInCents = current.rows[0].amountInCents;
      let balanceReceivableId: string | null = null;
      let discountInCents = 0;
      let interestInCents = 0;
      // Formas desta baixa (pagamento) ou da última baixa (estorno): um evento por forma.
      let parts: PaymentPart[] = [];
      let batch: BatchEvent[] = [];
      if (operation === "payment_reversal")
        batch = latestPaymentBatch(
          (
            await client.query<BatchEvent>(
              `SELECT kind, amount_in_cents AS "amountInCents",
                      JSON_VALUE(metadata, '$.paymentMethod') AS "paymentMethod",
                      discount_in_cents AS "discountInCents", interest_in_cents AS "interestInCents"
               FROM financial_events
               WHERE clinic_id = $1 AND receivable_id = $2 AND kind IN ('payment','payment_reversal')
               ORDER BY created_at, id`,
              [clinicId, receivableId],
            )
          ).rows,
        );
      if (operation === "payment") {
        // Picado: o valor recebido é a soma das formas.
        const settlement = adjustments.payments?.length
          ? {
              ...adjustments,
              receivedInCents: paymentPartsTotal(adjustments.payments),
            }
          : adjustments;
        const breakdown = settlementBreakdown(
          current.rows[0].amountInCents,
          settlement,
        );
        if (breakdown.error)
          throw new DomainError("INVALID_SETTLEMENT", breakdown.error, 400);
        receivedInCents = breakdown.receivedInCents;
        parts = resolvePaymentParts({
          payments: adjustments.payments,
          paymentMethod: paymentMethod ?? "pix",
          paymentInstallments: adjustments.paymentInstallments,
          amountInCents: receivedInCents,
        });
        discountInCents = adjustments.discountInCents ?? 0;
        interestInCents = adjustments.interestInCents ?? 0;
        if (breakdown.balanceInCents > 0) {
          balanceReceivableId = randomUUID();
          await client.query(
            `INSERT INTO receivables
               (id, clinic_id, patient_id, plan_id, description, installment_number,
                installment_count, balance_of_installment, due_date, amount_in_cents, competence,
                category_id, cost_center_id, posted_on, branch_id)
             SELECT $5, r.clinic_id, r.patient_id, r.plan_id, r.description || ' · saldo',
                    CASE WHEN r.plan_id IS NULL THEN r.installment_number
                         ELSE (SELECT max(x.installment_number) + 1 FROM receivables x
                               WHERE x.plan_id = r.plan_id) END,
                    r.installment_count,
                    CASE WHEN r.plan_id IS NULL THEN NULL
                         ELSE coalesce(r.balance_of_installment, r.installment_number) END, coalesce($3, r.due_date), $4,
                    r.competence, r.category_id, r.cost_center_id, r.posted_on, r.branch_id
             FROM receivables r WHERE r.clinic_id = $1 AND r.id = $2`,
            [
              clinicId,
              receivableId,
              adjustments.balanceDueDate ?? null,
              breakdown.balanceInCents,
              balanceReceivableId,
            ],
          );
        }
      } else {
        // Estorno: a parcela volta a valer sem o desconto e sem os juros da baixa (no
        // picado, só a última forma da baixa leva os dois; a soma vale para qualquer ordem).
        const restore = batch.reduce(
          (sum, item) =>
            sum + (item.discountInCents ?? 0) - (item.interestInCents ?? 0),
          0,
        );
        if (restore !== 0) {
          await client.query(
            `UPDATE receivables SET amount_in_cents = amount_in_cents + $3
             WHERE clinic_id = $1 AND id = $2`,
            [clinicId, receivableId, restore],
          );
          await client.query(
            `INSERT INTO financial_events
               (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
             VALUES ($1,$2,$3,'adjustment',$4,$5)`,
            [
              clinicId,
              receivableId,
              actorUserId,
              restore,
              { reason: "Estorno de baixa com desconto/juros" },
            ],
          );
        }
      }
      if (
        operation === "payment" &&
        receivedInCents !== current.rows[0].amountInCents
      ) {
        await client.query(
          `UPDATE receivables SET amount_in_cents = $3 WHERE clinic_id = $1 AND id = $2`,
          [clinicId, receivableId, receivedInCents],
        );
        await client.query(
          `INSERT INTO financial_events
             (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata)
           VALUES ($1,$2,$3,'adjustment',$4,$5)`,
          [
            clinicId,
            receivableId,
            actorUserId,
            receivedInCents - current.rows[0].amountInCents,
            {
              reason: "Baixa com desconto, juros ou pagamento parcial",
              discountInCents,
              interestInCents,
              balanceReceivableId,
            },
          ],
        );
      }
      await client.query(
        operation === "payment"
          ? `UPDATE receivables SET status = 'paid', paid_at = coalesce($4,NOW(6)),cash_available_at=coalesce($5,cash_available_at), payment_method = $3, payment_installments = $6, payment_parts = $7, updated_at = NOW(6)
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE receivables SET status = 'open', paid_at = NULL, payment_method = NULL, payment_installments = NULL, payment_parts = JSON_ARRAY(), updated_at = NOW(6)
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [
              clinicId,
              receivableId,
              parts[0]!.paymentMethod,
              timing?.paidAt ?? null,
              timing?.availableAt ?? null,
              isSplitPayment(parts)
                ? null
                : paymentInstallmentsValue(parts[0]!.paymentInstallments),
              storedPaymentParts(parts) ?? [],
            ]
          : [clinicId, receivableId],
      );
      // Um evento por forma; desconto, juros e saldo ficam na última.
      const movements =
        operation === "payment"
          ? parts.map((part) => ({
              amountInCents: part.amountInCents,
              metadata: {
                paymentMethod: part.paymentMethod,
                ...(part.paymentInstallments
                  ? { paymentInstallments: part.paymentInstallments }
                  : {}),
              } as Record<string, unknown>,
            }))
          : batch.length > 1
            ? batch.map((item) => ({
                amountInCents: -Math.abs(item.amountInCents),
                metadata: { paymentMethod: item.paymentMethod } as Record<
                  string,
                  unknown
                >,
              }))
            : [
                {
                  amountInCents: -receivedInCents,
                  metadata: {
                    paymentMethod: current.rows[0].paymentMethod,
                  } as Record<string, unknown>,
                },
              ];
      for (const [index, movement] of movements.entries()) {
        const last = index === movements.length - 1;
        await client.query(
          `INSERT INTO financial_events
             (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata,occurred_at,cash_available_at,
              discount_in_cents, interest_in_cents, balance_receivable_id)
           VALUES ($1, $2, $3, $4, $5, $6,coalesce($7,NOW(6)),coalesce($8,$7,NOW(6)),
                   $9, $10, $11)`,
          [
            clinicId,
            receivableId,
            actorUserId,
            operation,
            movement.amountInCents,
            movement.metadata,
            timing?.paidAt ?? null,
            timing?.availableAt ??
              (operation === "payment"
                ? current.rows[0].cashAvailableAt
                : null),
            last ? discountInCents : 0,
            last ? interestInCents : 0,
            last ? balanceReceivableId : null,
          ],
        );
      }
      if (operation === "payment_reversal") {
        await markPaymentProofsReversed(
          client,
          clinicId,
          "receivable",
          receivableId,
        );
        await cancelReceiptSignatures(client, clinicId, receivableId);
      } else await issueReceiptSignature(client, clinicId, receivableId);
      const receivable = await this.findReceivable(
        client,
        clinicId,
        receivableId,
      );
      return receivable;
    }
  }

  async changePayablePayment(
    clinicId: string,
    actorUserId: string,
    payableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
    payments?: PaymentPart[],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.lock(`payables:${clinicId}`);
      const current = await client.query<{
        status: Payable["status"];
        commissionId: string | null;
        amountInCents: number;
        paymentMethod: PaymentMethod | null;
        cashAvailableAt: Date | null;
        amountPending: boolean;
      }>(
        `SELECT status,commission_id AS "commissionId",payment_method AS "paymentMethod",cash_available_at AS "cashAvailableAt", amount_in_cents AS "amountInCents", amount_pending AS "amountPending"
         FROM payables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, payableId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      const expected = operation === "payment" ? "open" : "paid";
      if (current.rows[0].status !== expected)
        throw new DomainError(
          operation === "payment" ? "PAYABLE_NOT_OPEN" : "PAYABLE_NOT_PAID",
          operation === "payment"
            ? "Somente contas abertas podem ser pagas."
            : "Somente contas pagas podem ser estornadas.",
          409,
        );
      if (operation === "payment" && current.rows[0].amountPending)
        throw new DomainError(
          "PAYABLE_AMOUNT_PENDING",
          "Informe o valor do mês antes de pagar esta conta.",
          409,
        );
      // Picado: as formas somam o valor da conta; o estorno devolve forma por forma.
      const parts =
        operation === "payment"
          ? resolvePaymentParts({
              payments,
              paymentMethod: paymentMethod ?? "pix",
              amountInCents: current.rows[0].amountInCents,
            })
          : [];
      if (operation === "payment")
        assertPaymentParts(parts, current.rows[0].amountInCents);
      const batch =
        operation === "payment_reversal"
          ? latestPaymentBatch(
              (
                await client.query<BatchEvent>(
                  `SELECT kind, amount_in_cents AS "amountInCents",
                          JSON_VALUE(metadata, '$.paymentMethod') AS "paymentMethod"
                   FROM payable_events
                   WHERE clinic_id = $1 AND payable_id = $2 AND kind IN ('payment','payment_reversal')
                   ORDER BY created_at, id`,
                  [clinicId, payableId],
                )
              ).rows,
            )
          : [];
      if (current.rows[0].commissionId) {
        const commission = await client.query<{ status: string }>(
          "SELECT status FROM commission_entries WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, current.rows[0].commissionId],
        );
        if (commission.rows[0]?.status !== expected)
          throw new DomainError(
            "COMMISSION_EXPENSE_STATE",
            "Concilie a situação da comissão com a despesa antes de continuar.",
            409,
          );
        await client.query(
          operation === "payment"
            ? "UPDATE commission_entries SET status='paid',paid_at=coalesce($3,NOW(6)),paid_by_user_id=$4 WHERE clinic_id=$1 AND id=$2"
            : "UPDATE commission_entries SET status='open',paid_at=NULL,paid_by_user_id=NULL WHERE clinic_id=$1 AND id=$2",
          operation === "payment"
            ? [
                clinicId,
                current.rows[0].commissionId,
                timing?.paidAt ?? null,
                actorUserId,
              ]
            : [clinicId, current.rows[0].commissionId],
        );
      }
      // Despesa da folha: as comissões e os ajustes incluídos pagam (e estornam) junto.
      for (const table of ["commission_entries", "commission_adjustments"]) {
        const included = await client.query<{ status: string }>(
          `SELECT status FROM ${table} WHERE clinic_id=$1 AND payroll_payable_id=$2 FOR UPDATE`,
          [clinicId, payableId],
        );
        if (included.rows.some((row) => row.status !== expected))
          throw new DomainError(
            "PAYROLL_EXPENSE_STATE",
            "Uma comissão desta folha mudou de situação; revise a folha antes de continuar.",
            409,
          );
        if (!included.rowCount) continue;
        await client.query(
          operation === "payment"
            ? `UPDATE ${table} SET status='paid',paid_at=coalesce($3,NOW(6))${table === "commission_entries" ? ",paid_by_user_id=$4" : ""} WHERE clinic_id=$1 AND payroll_payable_id=$2`
            : `UPDATE ${table} SET status='open',paid_at=NULL${table === "commission_entries" ? ",paid_by_user_id=NULL" : ""} WHERE clinic_id=$1 AND payroll_payable_id=$2`,
          operation === "payment"
            ? table === "commission_entries"
              ? [clinicId, payableId, timing?.paidAt ?? null, actorUserId]
              : [clinicId, payableId, timing?.paidAt ?? null]
            : [clinicId, payableId],
        );
      }
      await client.query(
        operation === "payment"
          ? `UPDATE payables SET status = 'paid', paid_at = coalesce($5,NOW(6)),cash_available_at=coalesce($6,cash_available_at),
                 payment_method = $3, paid_by_user_id = $4, payment_parts = $7, updated_at = NOW(6)
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE payables SET status = 'open', paid_at = NULL,
                 payment_method = NULL, paid_by_user_id = NULL, payment_parts = JSON_ARRAY(), updated_at = NOW(6)
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [
              clinicId,
              payableId,
              parts[0]!.paymentMethod,
              actorUserId,
              timing?.paidAt ?? null,
              timing?.availableAt ?? null,
              storedPaymentParts(parts) ?? [],
            ]
          : [clinicId, payableId],
      );
      // Um evento por forma (saída gravada com sinal negativo, estorno positivo).
      const movements =
        operation === "payment"
          ? parts.map((part) => ({
              amountInCents: -part.amountInCents,
              paymentMethod: part.paymentMethod as PaymentMethod | null,
            }))
          : batch.length > 1
            ? batch.map((item) => ({
                amountInCents: Math.abs(item.amountInCents),
                paymentMethod: item.paymentMethod,
              }))
            : [
                {
                  amountInCents: current.rows[0].amountInCents,
                  paymentMethod: current.rows[0].paymentMethod,
                },
              ];
      for (const movement of movements)
        await client.query(
          `INSERT INTO payable_events
             (clinic_id, payable_id, actor_user_id, kind, amount_in_cents, metadata,occurred_at,cash_available_at)
           VALUES ($1,$2,$3,$4,$5,$6,coalesce($7,NOW(6)),coalesce($8,$7,NOW(6)))`,
          [
            clinicId,
            payableId,
            actorUserId,
            operation,
            movement.amountInCents,
            { paymentMethod: movement.paymentMethod },
            timing?.paidAt ?? null,
            timing?.availableAt ??
              (operation === "payment"
                ? current.rows[0].cashAvailableAt
                : null),
          ],
        );
      if (operation === "payment_reversal")
        await markPaymentProofsReversed(client, clinicId, "payable", payableId);
      const payable = await this.findPayable(client, clinicId, payableId);
      await client.query("COMMIT");
      return payable;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeSessionInDatabase(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
    patientId: string,
    serviceId: string,
    startsAt: Date,
  ) {
    const appointment = await client.query<{
      planId: string | null;
      visitType: string;
    }>(
      'SELECT patient_plan_id AS "planId", visit_type AS "visitType" FROM appointments WHERE clinic_id=$1 AND id=$2',
      [clinicId, appointmentId],
    );
    const linked = appointment.rows[0];
    if (linked?.visitType === "trial") return;
    const planResult = await client.query<{
      id: string;
      remainingSessions: number;
      kind: PatientPlan["kind"];
    }>(
      `SELECT pp.id, pps.remaining_sessions AS "remainingSessions", pp.kind
       FROM patient_plans pp JOIN clinics c ON c.id = pp.clinic_id
       JOIN patient_plan_services pps ON pps.plan_id = pp.id AND pps.clinic_id = pp.clinic_id
       WHERE pp.clinic_id = $1 AND pp.patient_id = $2 AND pps.service_id = $3
         AND pp.status = 'active' AND pp.deleted_at IS NULL
         AND ($6 IS NULL OR pp.id = $6)
         AND (pp.source_appointment_id IS NULL OR pp.source_appointment_id = $5)
         AND pp.valid_from <= ${localDate("$4")}
         AND (pp.valid_until IS NULL OR pp.valid_until >= ${localDate("$4")})
       ORDER BY coalesce(pp.source_appointment_id = $5, 0) DESC,
         pp.valid_until IS NULL, pp.valid_until, pp.created_at
       LIMIT 1 FOR UPDATE`,
      [
        clinicId,
        patientId,
        serviceId,
        startsAt,
        appointmentId,
        linked?.planId ?? null,
      ],
    );
    const plan = planResult.rows[0];
    if (!plan) {
      if (linked?.planId)
        throw new DomainError(
          "NO_SESSION_BALANCE",
          "O plano vinculado não possui saldo de sessões válido para este atendimento.",
          409,
        );
      const tabService = await client.query(
        "SELECT 1 FROM patient_tab_services WHERE clinic_id=$1 AND appointment_id=$2 UNION ALL SELECT 1 FROM patient_plans WHERE clinic_id=$1 AND source_appointment_id=$2 LIMIT 1",
        [clinicId, appointmentId],
      );
      if (tabService.rowCount)
        throw new DomainError(
          "NO_SESSION_BALANCE",
          "Feche a comanda de origem para disponibilizar o crédito deste serviço.",
          409,
        );
      return;
    }
    const ledger = await client.query<{ balance: number; consumed: boolean }>(
      `SELECT CAST(coalesce(sum(quantity), 0) AS SIGNED) AS balance,
              MAX(kind = 'consumption') AS consumed
       FROM session_movements WHERE plan_id = $1 AND appointment_id = $2`,
      [plan.id, appointmentId],
    );
    if ((ledger.rows[0]?.balance ?? 0) < 0) return;
    // Recorrente: a frequência semanal vale; o ciclo com mais aulas que o saldo nominal passa.
    if (plan.remainingSessions < 1 && planHasSessionBalance(plan)) {
      throw new DomainError(
        "NO_SESSION_BALANCE",
        "O cliente não possui saldo de sessões para este serviço.",
        409,
      );
    }
    await client.query(
      `INSERT INTO session_movements
         (clinic_id, plan_id, appointment_id, kind, quantity, reason, service_id)
       VALUES ($1, $2, $3, $4, -1, 'Atendimento finalizado', $5)`,
      [
        clinicId,
        plan.id,
        appointmentId,
        ledger.rows[0]?.consumed ? "adjustment" : "consumption",
        serviceId,
      ],
    );
    await client.query(
      "UPDATE patient_plan_services SET remaining_sessions = remaining_sessions - 1 WHERE plan_id = $1 AND service_id = $2",
      [plan.id, serviceId],
    );
    await client.query(
      `UPDATE patient_plans SET status=CASE WHEN source_tab_id IS NOT NULL AND remaining_sessions=1 THEN 'expired' ELSE status END, remaining_sessions = remaining_sessions - 1,
              updated_at = NOW(6) WHERE id = $1`,
      [plan.id],
    );
  }

  async restoreSessionInDatabase(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
  ) {
    const planResult = await client.query<{
      id: string;
      serviceId: string;
      reversed: boolean;
    }>(
      `SELECT pp.id, pps.service_id AS "serviceId",
              EXISTS (SELECT 1 FROM session_movements x
                      WHERE x.plan_id = pp.id AND x.appointment_id = $2
                        AND x.kind = 'reversal') AS reversed
       FROM patient_plans pp
       JOIN patient_plan_services pps ON pps.plan_id = pp.id
       WHERE pp.clinic_id = $1
         AND (SELECT coalesce(sum(sm.quantity), 0)
              FROM session_movements sm
              WHERE sm.plan_id = pp.id AND sm.service_id = pps.service_id AND sm.appointment_id = $2) < 0
       LIMIT 1 FOR UPDATE`,
      [clinicId, appointmentId],
    );
    const plan = planResult.rows[0];
    if (!plan) return;
    await client.query(
      `INSERT INTO session_movements
         (clinic_id, plan_id, appointment_id, kind, quantity, reason, service_id)
       VALUES ($1, $2, $3, $4, 1, 'Reversão do atendimento finalizado', $5)`,
      [
        clinicId,
        plan.id,
        appointmentId,
        plan.reversed ? "adjustment" : "reversal",
        plan.serviceId,
      ],
    );
    await client.query(
      "UPDATE patient_plan_services SET remaining_sessions = remaining_sessions + 1 WHERE plan_id = $1 AND service_id = $2",
      [plan.id, plan.serviceId],
    );
    await client.query(
      `UPDATE patient_plans SET status=CASE WHEN source_tab_id IS NOT NULL AND status='expired' THEN 'active' ELSE status END, remaining_sessions = remaining_sessions + 1,
              updated_at = NOW(6) WHERE id = $1`,
      [plan.id],
    );
  }

  async findClinicalRecord(
    client: Pool | PoolClient,
    clinicId: string,
    recordId: string,
  ) {
    const result = await client.query<ClinicalRecordRow>(
      `
        SELECT ${clinicalRecordColumns}
        FROM clinical_records cr
        JOIN appointments a ON a.id = cr.appointment_id
        JOIN patients p ON p.id = cr.patient_id
        JOIN professionals pr ON pr.id = cr.professional_id
        JOIN users u ON u.id = cr.author_user_id
        WHERE cr.clinic_id = $1 AND cr.id = $2
      `,
      [clinicId, recordId],
    );
    return result.rows[0] ? mapClinicalRecord(result.rows[0]) : null;
  }

  async findClinicalRecordByAppointment(
    client: PoolClient,
    clinicId: string,
    appointmentId: string,
  ) {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM clinical_records WHERE clinic_id = $1 AND appointment_id = $2",
      [clinicId, appointmentId],
    );
    return result.rows[0]
      ? this.findClinicalRecord(client, clinicId, result.rows[0].id)
      : null;
  }

  async captureClinicalRevision(
    client: PoolClient,
    clinicId: string,
    recordId: string,
  ) {
    await client.query(
      `
        INSERT INTO clinical_record_revisions (
          clinic_id, clinical_record_id, author_user_id, version, snapshot
        )
        SELECT clinic_id, id, author_user_id, version,
          JSON_OBJECT(
            'status', status,
            'subjective', subjective,
            'objective', objective,
            'assessment', assessment,
            'plan', plan,
            'painScale', pain_scale
          )
        FROM clinical_records
        WHERE clinic_id = $1 AND id = $2
      `,
      [clinicId, recordId],
    );
  }
}
