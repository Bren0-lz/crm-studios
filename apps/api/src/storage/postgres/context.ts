import {
  formatSequenceNumber,
  settlementBreakdown,
  type PaymentTiming,
  type SettlementAdjustments,
} from "@crm/contracts";
import type { PatientTabServiceItem } from "@crm/contracts";
import {
  type AdminAuditEvent,
  type AdminUserCommissionInput,
  type AppModule,
  appModuleSchema,
  type AppointmentInput,
  type AuditHistoryFilters,
  type ClinicalAccessEvent,
  type CommissionRuleInput,
  type CommunicationChannel,
  type GroupClassInput,
  type GroupEnrollment,
  type GroupEnrollmentInput,
  historyAction,
  type PatientInput,
  patientProfile,
  type PatientPlanInput,
  type Payable,
  type PaymentMethod,
  planInstallmentSchedule,
  type PlanTemplateInput,
  type ReceivableStatus,
} from "@crm/contracts";
import type { UserBranchAccess } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { BranchScopeStore } from "../branch-scope.js";
import type { Pool, PoolClient } from "pg";
import { nextClinicSequence } from "./clinic-sequences.js";
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
  issuedDocumentColumns,
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
  receivableColumns,
  type ReceivableRow,
  recurringPayableColumns,
  type RecurringPayableRow,
  type ScheduleBlockRow,
} from "./helpers.js";

export class PostgresRepositoryContext {
  operations!: ClinicRepository;
  readonly branchScope = new BranchScopeStore();

  constructor(readonly pool: Pool) {}

  /** Filiais da leitura em curso para `$N::uuid[]` (`null` = todas). */
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
      "SELECT id FROM branches WHERE clinic_id=$1 AND id = ANY($2::uuid[])",
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
    await client.query(
      `INSERT INTO user_branches (clinic_id, user_id, branch_id)
       SELECT $1, $2, unnest($3::uuid[])`,
      [clinicId, userId, branchIds],
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
    // geração de lançamentos que a referenciam (a FK pede FOR KEY SHARE, que conflita).
    if (
      input.serviceId &&
      !(
        await client.query(
          "SELECT id FROM services WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.serviceId],
        )
      ).rowCount
    )
      throw new DomainError(
        "SERVICE_NOT_FOUND",
        "Serviço não encontrado.",
        404,
      );
    const existing = await client.query<{
      id: string;
      percentage: string;
      kind: string;
      fixedAmountInCents: number | null;
      effectiveUntil: string | null;
    }>(
      `SELECT id, percentage,kind,fixed_amount_in_cents AS "fixedAmountInCents",effective_until::text AS "effectiveUntil" FROM commission_rules
       WHERE clinic_id = $1 AND user_id = $2 AND effective_from = $3 AND service_id IS NOT DISTINCT FROM $4::uuid
       FOR UPDATE`,
      [clinicId, userId, input.effectiveFrom, input.serviceId ?? null],
    );
    const current = existing.rows[0];
    if (current) {
      const previousPercentage = Number(current.percentage);
      if (
        Math.round(previousPercentage * 100) ===
          Math.round(input.percentage * 100) &&
        current.kind === (input.kind ?? "percentage") &&
        current.fixedAmountInCents === (input.fixedAmountInCents ?? null) &&
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
      const updated = await client.query<{ percentage: string }>(
        `UPDATE commission_rules SET percentage = $3,kind=$4,fixed_amount_in_cents=$5,effective_until=$6
         WHERE clinic_id = $1 AND id = $2
         RETURNING percentage`,
        [
          clinicId,
          current.id,
          input.percentage,
          input.kind ?? "percentage",
          input.fixedAmountInCents ?? null,
          input.effectiveUntil ?? null,
        ],
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
      const result = await client.query<{
        id: string;
        percentage: string;
        effectiveFrom: string;
      }>(
        `INSERT INTO commission_rules (clinic_id, user_id, percentage, effective_from,kind,fixed_amount_in_cents,service_id,effective_until)
         VALUES ($1, $2, $3, $4,$5,$6,$7,$8)
         RETURNING id, percentage, effective_from::text AS "effectiveFrom"`,
        [
          clinicId,
          userId,
          input.percentage,
          input.effectiveFrom,
          input.kind ?? "percentage",
          input.fixedAmountInCents ?? null,
          input.serviceId ?? null,
          input.effectiveUntil ?? null,
        ],
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
      predicates.push(
        `ae.actor_user_id = ${parameter(filters.actorUserId)}::uuid`,
      );
    if (filters.search)
      predicates.push(
        `ae.search_document @@ plainto_tsquery('portuguese', ${parameter(filters.search)})`,
      );
    if (filters.from)
      predicates.push(
        `ae.created_at >= (${parameter(filters.from)}::date::timestamp AT TIME ZONE (SELECT timezone FROM clinics WHERE id=$1))`,
      );
    if (filters.to)
      predicates.push(
        `ae.created_at < ((${parameter(filters.to)}::date + 1)::timestamp AT TIME ZONE (SELECT timezone FROM clinics WHERE id=$1))`,
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
              host(ae.ip_address) AS "ipAddress", ae.module, ae.description, ae.action, ae.entity_type AS "entityType",
              ae.entity_id AS "entityId", u.full_name AS "actorName",
              ae.metadata, ae.created_at AS "createdAt"
       FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.clinic_id = $1
         -- Evento com data futura (dado inconsistente) não entra no histórico.
         AND ae.created_at <= now() + interval '1 minute'
         ${predicates.map((predicate) => `AND ${predicate}`).join("\n")}
         AND ($2::uuid IS NULL OR (ae.created_at, ae.id) < (
           SELECT created_at, id FROM audit_events WHERE clinic_id = $1 AND id = $2::uuid
         ))
       ORDER BY ae.created_at DESC, ae.id DESC LIMIT $3`,
      values,
    );
    return result.rows.map((row): AdminAuditEvent => ({
      id: row.id,
      clinicId: row.clinicId,
      module: row.module,
      description: row.description,
      ...(row.actorUserId ? { actorUserId: row.actorUserId } : {}),
      ...(row.ipAddress ? { ipAddress: row.ipAddress } : {}),
      action: row.action,
      entityType: row.entityType,
      ...(row.entityId ? { entityId: row.entityId } : {}),
      ...(row.actorName ? { actorName: row.actorName } : {}),
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async insertPatient(
    client: Pool | PoolClient,
    clinicId: string,
    input: PatientInput,
  ) {
    const id = randomUUID();
    // Prontuário sequencial da clínica (QM15), sem trecho do UUID.
    const recordNumber = formatSequenceNumber(
      "PAC",
      await nextClinicSequence(client, clinicId, "patient_record"),
    );
    try {
      const result = await client.query<PatientRow>(
        `
          INSERT INTO patients (
            id, clinic_id, record_number, full_name, cpf, email, phone, whatsapp, birth_date,
            emergency_contact_name, emergency_contact_phone, notes, tags, profile
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
          RETURNING ${patientColumns}
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
          input.notes || null,
          input.tags,
          JSON.stringify(patientProfile(input)),
        ],
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
      "SELECT id FROM services WHERE clinic_id=$1 AND id=ANY($2::uuid[]) AND active FOR SHARE",
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

  /** Grava o atendimento (de cliente ou de lead) já validado. */
  async insertAppointment(
    clinicId: string,
    input: Omit<AppointmentInput, "patientId">,
    durationMinutes: number,
    owner:
      { patientId: string; leadId: null } | { patientId: null; leadId: string },
    client: Pool | PoolClient = this.pool,
  ) {
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
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO appointments (
            clinic_id, patient_id, lead_id, professional_id, room_id,
            service_id, starts_at, ends_at, notes, visit_type, branch_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
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
        ],
      );
      return (await this.findAppointment(
        clinicId,
        inserted.rows[0]!.id,
        client,
      ))!;
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
        `SELECT full_name AS "fullName" FROM patients WHERE id=$2 AND clinic_id=$1 AND status='active'`,
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
        `SELECT count(*) FILTER(WHERE status='active') AS "activeCount",max(queue_position) FILTER(WHERE status='waitlisted') AS "maxQueue" FROM group_enrollments WHERE group_id=$1`,
        [input.groupId],
      );
      const status: GroupEnrollment["status"] =
        Number(counts.rows[0]!.activeCount) < group.rows[0].capacity
          ? "active"
          : "waitlisted";
      const result = await client.query<GroupEnrollmentRow>(
        // Início em outra data que não hoje (fuso da clínica): meia-noite desse dia.
        `WITH clinic AS (SELECT timezone FROM clinics WHERE id=$1) INSERT INTO group_enrollments AS e(clinic_id,group_id,patient_id,status,queue_position,enrolled_at) SELECT $1,$2::uuid,$3::uuid,$4::text,$5::int,CASE WHEN $7::date IS NULL OR $7::date=(now() AT TIME ZONE clinic.timezone)::date THEN now() ELSE ($7::date+time '00:00') AT TIME ZONE clinic.timezone END FROM clinic RETURNING ${groupEnrollmentColumns.replace('p.full_name AS "patientName"', '$6::text AS "patientName"')}`,
        [
          clinicId,
          input.groupId,
          input.patientId,
          status,
          status === "waitlisted" ? (counts.rows[0]!.maxQueue ?? 0) + 1 : null,
          patient.rows[0].fullName,
          input.startsOn ?? null,
        ],
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
      `SELECT g.id,g.professional_id AS "professionalId",g.room_id AS "roomId",g.weekly_slots AS "weeklySlots",g.sessions_generated_until AS "generatedUntil",c.timezone FROM group_classes g JOIN clinics c ON c.id=g.clinic_id WHERE g.clinic_id=$1 AND g.active AND ($2::uuid IS NULL OR g.id=$2) AND (g.sessions_generated_until IS NULL OR g.sessions_generated_until<$3) ORDER BY g.created_at FOR UPDATE OF g`,
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
          `INSERT INTO group_sessions(clinic_id,group_id,starts_at,ends_at) SELECT $1,$2,o.starts_at,o.ends_at FROM jsonb_to_recordset($5::jsonb) AS o(starts_at timestamptz,ends_at timestamptz) WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.clinic_id=$1 AND a.status<>'cancelled' AND (a.professional_id=$3 OR a.room_id=$4) AND a.starts_at<o.ends_at AND a.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM schedule_blocks b WHERE b.clinic_id=$1 AND b.status='active' AND (b.professional_id=$3 OR b.room_id=$4) AND b.starts_at<o.ends_at AND b.ends_at>o.starts_at) AND NOT EXISTS (SELECT 1 FROM group_sessions gs JOIN group_classes og ON og.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND (og.professional_id=$3 OR og.room_id=$4) AND gs.starts_at<o.ends_at AND gs.ends_at>o.starts_at) ON CONFLICT (group_id,starts_at) DO NOTHING`,
          [
            clinicId,
            group.id,
            group.professionalId,
            group.roomId,
            JSON.stringify(
              occurrences.map((item) => ({
                starts_at: item.startsAt.toISOString(),
                ends_at: item.endsAt.toISOString(),
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
      `SELECT a.starts_at AS "startsAt",a.ends_at AS "endsAt",'Atendimento de ' || coalesce(pt.full_name, ld.full_name) AS label FROM appointments a LEFT JOIN patients pt ON pt.id=a.patient_id LEFT JOIN leads ld ON ld.id=a.lead_id WHERE a.clinic_id=$1 AND a.status<>'cancelled' AND a.ends_at>now() AND (a.professional_id=$2 OR a.room_id=$3)
       UNION ALL
       SELECT gs.starts_at,gs.ends_at,g.name FROM group_sessions gs JOIN group_classes g ON g.id=gs.group_id WHERE gs.clinic_id=$1 AND gs.status<>'cancelled' AND gs.ends_at>now() AND ($4::uuid IS NULL OR gs.group_id<>$4) AND (g.professional_id=$2 OR g.room_id=$3)`,
      [clinicId, group.professionalId, group.roomId, group.id ?? null],
    );
    const patterns = await client.query<{
      label: string;
      slots: GroupClassInput["weeklySlots"];
    }>(
      `SELECT name AS label,weekly_slots AS slots FROM group_classes WHERE clinic_id=$1 AND active AND ($4::uuid IS NULL OR id<>$4) AND (professional_id=$2 OR room_id=$3)`,
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

  async inTransaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
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
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      clinicId,
    ]);
    let allowed: string[];
    if (!renewedFromPlanId) {
      const template = await client.query<{ name: string }>(
        "SELECT name FROM plan_templates WHERE clinic_id=$1 AND id=$2 AND active FOR SHARE",
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
      "SELECT 1 FROM patients WHERE clinic_id=$1 AND id=$2 AND status='active'",
      [clinicId, input.patientId],
    );
    const context = await client.query<{ id: string; name: string }>(
      `SELECT s.id,coalesce((SELECT x.service_name FROM patient_plan_services x WHERE x.plan_id=$3 AND x.service_id=s.id),s.name) AS name
       FROM services s WHERE s.clinic_id=$1 AND s.id=ANY($2::uuid[]) AND s.active FOR SHARE OF s`,
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
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO patient_plans (
         clinic_id, patient_id, service_id, name, kind, total_sessions,
         remaining_sessions, valid_from, valid_until, total_value_in_cents,
         installments, first_due_date, auto_renew, renewed_from_plan_id, plan_template_id,
         branch_id, payment_method
       ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         -- Renovação fica na filial do plano anterior; venda nova, na da requisição.
         coalesce((SELECT branch_id FROM patient_plans WHERE clinic_id=$1 AND id=$13), $15),
         $16
       ) RETURNING id`,
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
        this.branchWriteId(),
        input.paymentMethod ?? null,
      ],
    );
    const planId = inserted.rows[0]!.id;
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
    for (const installment of planInstallmentSchedule(input)) {
      const amount = installment.amountInCents;
      const receivable = await client.query<{ id: string }>(
        `INSERT INTO receivables (
           clinic_id, patient_id, plan_id, description, installment_number,
           installment_count, due_date, amount_in_cents, branch_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
           (SELECT branch_id FROM patient_plans WHERE clinic_id=$1 AND id=$3)
         ) RETURNING id`,
        [
          clinicId,
          input.patientId,
          planId,
          `${input.name} · ${installment.installmentNumber}/${input.installments}`,
          installment.installmentNumber,
          input.installments,
          installment.dueDate,
          amount,
        ],
      );
      await client.query(
        `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents)
         VALUES ($1, $2, $3, 'created', $4)`,
        [clinicId, receivable.rows[0]!.id, actorUserId, amount],
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
       JOIN cost_centers cc ON cc.id = rp.cost_center_id
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
    if (
      input.serviceId &&
      !(
        await client.query(
          "SELECT id FROM services WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.serviceId],
        )
      ).rowCount
    )
      throw new DomainError(
        "SERVICE_NOT_FOUND",
        "Serviço não encontrado.",
        404,
      );
    try {
      const result = await client.query<CommissionRuleRow>(
        `WITH inserted AS (INSERT INTO commission_rules (clinic_id, professional_id, percentage, effective_from,kind,fixed_amount_in_cents,service_id,effective_until)
          SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM professionals WHERE clinic_id = $1 AND id = $2 RETURNING *)
         SELECT i.id, i.clinic_id AS "clinicId", i.professional_id AS "professionalId",
          p.full_name AS "professionalName", i.percentage,i.kind,i.fixed_amount_in_cents AS "fixedAmountInCents",i.service_id AS "serviceId",i.effective_until::text AS "effectiveUntil", i.effective_from::text AS "effectiveFrom",
          i.active, i.created_at AS "createdAt" FROM inserted i JOIN professionals p ON p.id = i.professional_id`,
        [
          clinicId,
          input.professionalId,
          input.percentage,
          input.effectiveFrom,
          input.kind ?? "percentage",
          input.fixedAmountInCents ?? null,
          input.serviceId ?? null,
          input.effectiveUntil ?? null,
        ],
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
      ce.created_at AS "createdAt" FROM commission_entries ce JOIN professionals p ON p.id = ce.professional_id
      WHERE ce.clinic_id = $1 AND ($2::text IS NULL OR ce.competence = $2) ORDER BY ce.competence DESC`,
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
       JOIN patients p ON p.id = d.patient_id
       LEFT JOIN patient_plans pp ON pp.id = d.plan_id
       WHERE d.clinic_id = $1 AND d.id = $2`,
      [clinicId, documentId],
    );
    return result.rows[0] ? mapIssuedDocument(result.rows[0]) : null;
  }

  async findLead(client: Pool | PoolClient, clinicId: string, leadId: string) {
    const result = await client.query<LeadRow>(
      `SELECT ${leadColumns} FROM leads WHERE clinic_id = $1 AND id = $2`,
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
              lc.channel, lc.contact_method AS "contactMethod", lc.direction, lc.notes, u.full_name AS "actorName",
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
        WHERE a.clinic_id = $1 AND a.id = $2
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
        `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 AND t.id=$2`,
        [clinicId, tabId],
      ),
      client.query<PatientTabItemRow>(
        `SELECT i.id,i.tab_id AS "tabId",i.product_id AS "productId",p.name AS "productName",i.quantity,i.unit_price_in_cents AS "unitPriceInCents",i.unit_cost_in_cents AS "unitCostInCents" FROM patient_tab_items i JOIN products p ON p.id=i.product_id WHERE i.clinic_id=$1 AND i.tab_id=$2 ORDER BY i.created_at`,
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
       WHERE pp.clinic_id = $1 AND pp.id = $2`,
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

  async changeReceivablePayment(
    clinicId: string,
    actorUserId: string,
    receivableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
    adjustments: SettlementAdjustments = {},
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{
        status: ReceivableStatus;
        amountInCents: number;
        paymentMethod: PaymentMethod | null;
        cashAvailableAt: Date | null;
      }>(
        `SELECT status,payment_method AS "paymentMethod",cash_available_at AS "cashAvailableAt", amount_in_cents AS "amountInCents"
         FROM receivables WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
        [clinicId, receivableId],
      );
      if (!current.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
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
      // U39: desconto, juros e pagamento parcial (o saldo vira nova parcela).
      let receivedInCents = current.rows[0].amountInCents;
      let balanceReceivableId: string | null = null;
      let discountInCents = 0;
      let interestInCents = 0;
      if (operation === "payment") {
        const breakdown = settlementBreakdown(
          current.rows[0].amountInCents,
          adjustments,
        );
        if (breakdown.error)
          throw new DomainError("INVALID_SETTLEMENT", breakdown.error, 400);
        receivedInCents = breakdown.receivedInCents;
        discountInCents = adjustments.discountInCents ?? 0;
        interestInCents = adjustments.interestInCents ?? 0;
        if (breakdown.balanceInCents > 0) {
          const balance = await client.query<{ id: string }>(
            `INSERT INTO receivables
               (clinic_id, patient_id, plan_id, description, installment_number,
                installment_count, due_date, amount_in_cents, competence,
                category_id, cost_center_id, posted_on, branch_id)
             SELECT r.clinic_id, r.patient_id, r.plan_id, r.description || ' · saldo',
                    CASE WHEN r.plan_id IS NULL THEN r.installment_number
                         ELSE (SELECT max(x.installment_number) + 1 FROM receivables x
                               WHERE x.plan_id = r.plan_id) END,
                    r.installment_count, coalesce($3::date, r.due_date), $4,
                    r.competence, r.category_id, r.cost_center_id, r.posted_on, r.branch_id
             FROM receivables r WHERE r.clinic_id = $1 AND r.id = $2
             RETURNING id`,
            [
              clinicId,
              receivableId,
              adjustments.balanceDueDate ?? null,
              breakdown.balanceInCents,
            ],
          );
          balanceReceivableId = balance.rows[0]!.id;
        }
      } else {
        // Estorno: a parcela volta a valer sem o desconto e sem os juros da baixa.
        const payment = await client.query<{
          discountInCents: number;
          interestInCents: number;
        }>(
          `SELECT discount_in_cents AS "discountInCents", interest_in_cents AS "interestInCents"
           FROM financial_events WHERE clinic_id = $1 AND receivable_id = $2 AND kind = 'payment'
           ORDER BY created_at DESC LIMIT 1`,
          [clinicId, receivableId],
        );
        const restore =
          (payment.rows[0]?.discountInCents ?? 0) -
          (payment.rows[0]?.interestInCents ?? 0);
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
          ? `UPDATE receivables SET status = 'paid', paid_at = coalesce($4::timestamptz,now()),cash_available_at=coalesce($5,cash_available_at), payment_method = $3, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE receivables SET status = 'open', paid_at = NULL, payment_method = NULL, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [
              clinicId,
              receivableId,
              paymentMethod,
              timing?.paidAt ?? null,
              timing?.availableAt ?? null,
            ]
          : [clinicId, receivableId],
      );
      await client.query(
        `INSERT INTO financial_events
           (clinic_id, receivable_id, actor_user_id, kind, amount_in_cents, metadata,occurred_at,cash_available_at,
            discount_in_cents, interest_in_cents, balance_receivable_id)
         VALUES ($1, $2, $3, $4, $5, $6,coalesce($7::timestamptz,now()),coalesce($8::timestamptz,$7::timestamptz,now()),
                 $9, $10, $11)`,
        [
          clinicId,
          receivableId,
          actorUserId,
          operation,
          operation === "payment" ? receivedInCents : -receivedInCents,
          operation === "payment"
            ? { paymentMethod }
            : { paymentMethod: current.rows[0].paymentMethod },
          timing?.paidAt ?? null,
          timing?.availableAt ??
            (operation === "payment" ? current.rows[0].cashAvailableAt : null),
          discountInCents,
          interestInCents,
          balanceReceivableId,
        ],
      );
      const receivable = await this.findReceivable(
        client,
        clinicId,
        receivableId,
      );
      await client.query("COMMIT");
      return receivable;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async changePayablePayment(
    clinicId: string,
    actorUserId: string,
    payableId: string,
    operation: "payment" | "payment_reversal",
    paymentMethod?: PaymentMethod,
    timing?: PaymentTiming,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [clinicId],
      );
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
            ? "UPDATE commission_entries SET status='paid',paid_at=coalesce($3::timestamptz,now()),paid_by_user_id=$4 WHERE clinic_id=$1 AND id=$2"
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
      await client.query(
        operation === "payment"
          ? `UPDATE payables SET status = 'paid', paid_at = coalesce($5::timestamptz,now()),cash_available_at=coalesce($6,cash_available_at),
                 payment_method = $3, paid_by_user_id = $4, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`
          : `UPDATE payables SET status = 'open', paid_at = NULL,
                 payment_method = NULL, paid_by_user_id = NULL, updated_at = now()
             WHERE clinic_id = $1 AND id = $2`,
        operation === "payment"
          ? [
              clinicId,
              payableId,
              paymentMethod,
              actorUserId,
              timing?.paidAt ?? null,
              timing?.availableAt ?? null,
            ]
          : [clinicId, payableId],
      );
      await client.query(
        `INSERT INTO payable_events
           (clinic_id, payable_id, actor_user_id, kind, amount_in_cents, metadata,occurred_at,cash_available_at)
         VALUES ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,now()),coalesce($8::timestamptz,$7::timestamptz,now()))`,
        [
          clinicId,
          payableId,
          actorUserId,
          operation,
          operation === "payment"
            ? -current.rows[0].amountInCents
            : current.rows[0].amountInCents,
          operation === "payment"
            ? { paymentMethod }
            : { paymentMethod: current.rows[0].paymentMethod },
          timing?.paidAt ?? null,
          timing?.availableAt ??
            (operation === "payment" ? current.rows[0].cashAvailableAt : null),
        ],
      );
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
    const planResult = await client.query<{
      id: string;
      remainingSessions: number;
    }>(
      `SELECT pp.id, pps.remaining_sessions AS "remainingSessions"
       FROM patient_plans pp JOIN clinics c ON c.id = pp.clinic_id
       JOIN patient_plan_services pps ON pps.plan_id = pp.id AND pps.clinic_id = pp.clinic_id
       WHERE pp.clinic_id = $1 AND pp.patient_id = $2 AND pps.service_id = $3
         AND pp.status = 'active'
         AND (pp.source_appointment_id IS NULL OR pp.source_appointment_id = $5)
         AND pp.valid_from <= ($4::timestamptz AT TIME ZONE c.timezone)::date
         AND (pp.valid_until IS NULL OR pp.valid_until >= ($4::timestamptz AT TIME ZONE c.timezone)::date)
       ORDER BY coalesce(pp.source_appointment_id = $5, false) DESC,
         pp.valid_until NULLS LAST, pp.created_at
       LIMIT 1 FOR UPDATE OF pp, pps`,
      [clinicId, patientId, serviceId, startsAt, appointmentId],
    );
    const plan = planResult.rows[0];
    if (!plan) {
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
      `SELECT coalesce(sum(quantity), 0)::int AS balance,
              bool_or(kind = 'consumption') AS consumed
       FROM session_movements WHERE plan_id = $1 AND appointment_id = $2`,
      [plan.id, appointmentId],
    );
    if ((ledger.rows[0]?.balance ?? 0) < 0) return;
    if (plan.remainingSessions < 1) {
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
      `UPDATE patient_plans SET status=CASE WHEN source_tab_id IS NOT NULL AND remaining_sessions=1 THEN 'expired'::plan_status ELSE status END, remaining_sessions = remaining_sessions - 1,
              updated_at = now() WHERE id = $1`,
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
       LIMIT 1 FOR UPDATE OF pp, pps`,
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
      `UPDATE patient_plans SET status=CASE WHEN source_tab_id IS NOT NULL AND status='expired' THEN 'active'::plan_status ELSE status END, remaining_sessions = remaining_sessions + 1,
              updated_at = now() WHERE id = $1`,
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
          jsonb_build_object(
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
