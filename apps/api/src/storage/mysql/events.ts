import {
  buildEventIndicators,
  type CommercialEvent,
  type CommercialEventDetail,
  type EventInput,
  type EventListQuery,
  type EventParticipant,
  type PatientLeadOrigin,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../repository.js";
import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import type { MysqlRepositoryContext } from "./context.js";
import { branchClause, leadColumns, mapLead, type LeadRow } from "./helpers.js";

interface EventRow {
  id: string;
  clinicId: string;
  branchId: string | null;
  name: string;
  location: string | null;
  attendeeCount: number | null;
  startsAt: Date;
  notes: string | null;
  serviceId: string | null;
  serviceName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  participantCount: number | string;
  createdAt: Date;
  updatedAt: Date;
}

/** Evento da rede (sem filial) aparece em todas; o da filial, só nela. `$2` = filiais. */
const visibleEvent = `(e.branch_id IS NULL OR ${branchClause("e.branch_id", 2)})`;

const eventColumns = `e.id, e.clinic_id AS "clinicId", e.branch_id AS "branchId", e.name,
  e.location, e.attendee_count AS "attendeeCount", e.starts_at AS "startsAt", e.notes,
  e.service_id AS "serviceId", s.name AS "serviceName", e.created_by AS "createdBy", u.full_name AS "createdByName",
  (SELECT COUNT(*) FROM leads l WHERE l.clinic_id = e.clinic_id AND l.event_id = e.id AND l.deleted_at IS NULL
     AND ${branchClause("l.branch_id", 2)}) AS "participantCount",
  e.created_at AS "createdAt", e.updated_at AS "updatedAt"`;
const eventFrom = `events e LEFT JOIN users u ON u.id = e.created_by
  LEFT JOIN services s ON s.clinic_id = e.clinic_id AND s.id = e.service_id`;

function mapEvent(row: EventRow): CommercialEvent {
  return {
    id: row.id,
    clinicId: row.clinicId,
    ...(row.branchId ? { branchId: row.branchId } : {}),
    name: row.name,
    ...(row.location ? { location: row.location } : {}),
    ...(row.attendeeCount !== null
      ? { attendeeCount: Number(row.attendeeCount) }
      : {}),
    startsAt: row.startsAt.toISOString(),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.serviceId ? { serviceId: row.serviceId } : {}),
    ...(row.serviceName ? { serviceName: row.serviceName } : {}),
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
    ...(row.createdByName ? { createdByName: row.createdByName } : {}),
    participantCount: Number(row.participantCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Avaliação/experimental não cancelada mais recente do participante: marcada para o lead ou,
 * depois da conversão, para o cliente criado a partir dele.
 */
const evaluationAtColumn = `(SELECT MAX(a.starts_at) FROM appointments a
  WHERE a.clinic_id = leads.clinic_id AND a.status <> 'cancelled'
    AND a.visit_type IN ('evaluation', 'trial')
    AND (a.lead_id = leads.id
      OR (leads.converted_patient_id IS NOT NULL AND a.patient_id = leads.converted_patient_id
        AND a.created_at >= leads.created_at))) AS "evaluationAt"`;

/** Último contato feito (tentativa sem resposta, `reached = 0`, fica de fora). */
const contactedAtColumn = `(SELECT MAX(lc.occurred_at) FROM lead_contacts lc
  WHERE lc.clinic_id = leads.clinic_id AND lc.lead_id = leads.id AND lc.reached = 1) AS "contactedAt"`;

/**
 * Quando virou cliente: a última entrada na etapa `won` do histórico (conversão); sem ela, o
 * participante foi importado já ligado a um cliente existente e vale o cadastro do lead.
 */
const convertedAtColumn = `COALESCE((SELECT MAX(h.created_at) FROM lead_stage_history h
    WHERE h.clinic_id = leads.clinic_id AND h.lead_id = leads.id AND h.to_stage = 'won'),
  leads.created_at) AS "convertedAt"`;

export function createEventsRepository(context: MysqlRepositoryContext) {
  async function findEvent(
    db: Pool | PoolClient,
    clinicId: string,
    id: string,
  ) {
    const result = await db.query<EventRow>(
      `SELECT ${eventColumns} FROM ${eventFrom}
       WHERE e.clinic_id = $1 AND e.id = $3 AND ${visibleEvent}`,
      [clinicId, context.branchReadIds(), id],
    );
    return result.rows[0] ? mapEvent(result.rows[0]) : null;
  }
  async function assertBranch(
    db: Pool | PoolClient,
    clinicId: string,
    input: EventInput,
  ) {
    if (!input.branchId) return;
    if (
      !(
        await db.query("SELECT 1 FROM branches WHERE clinic_id=$1 AND id=$2", [
          clinicId,
          input.branchId,
        ])
      ).rowCount
    )
      throw new DomainError("BRANCH_NOT_FOUND", "Filial não encontrada.", 404);
    context.assertBranchInScope(input.branchId);
  }
  async function assertService(
    db: Pool | PoolClient,
    clinicId: string,
    input: EventInput,
  ) {
    if (
      input.serviceId &&
      !(
        await db.query("SELECT 1 FROM services WHERE clinic_id=$1 AND id=$2", [
          clinicId,
          input.serviceId,
        ])
      ).rowCount
    )
      throw new DomainError(
        "SERVICE_NOT_FOUND",
        "Serviço não encontrado.",
        404,
      );
  }
  const values = (input: EventInput) => [
    input.branchId || null,
    input.name,
    input.location || null,
    input.attendeeCount ?? null,
    input.startsAt,
    input.notes || null,
    input.serviceId || null,
  ];
  return {
    async listEvents(clinicId: string, query: EventListQuery = {}) {
      const result = await context.pool.query<EventRow>(
        `SELECT ${eventColumns} FROM ${eventFrom}
         WHERE e.clinic_id = $1 AND ${visibleEvent}
           AND ($3 IS NULL OR e.service_id = $3)
         ORDER BY e.starts_at DESC, e.id`,
        [clinicId, context.branchReadIds(), query.serviceId ?? null],
      );
      return result.rows.map(mapEvent);
    },

    async getEvent(
      clinicId: string,
      id: string,
    ): Promise<CommercialEventDetail | null> {
      const event = await findEvent(context.pool, clinicId, id);
      if (!event) return null;
      const result = await context.pool.query<
        LeadRow & {
          evaluationAt: Date | null;
          contactedAt: Date | null;
          convertedAt: Date | null;
        }
      >(
        `SELECT ${leadColumns}, ${evaluationAtColumn}, ${contactedAtColumn},
                ${convertedAtColumn} FROM leads
         WHERE clinic_id = $1 AND event_id = $3 AND deleted_at IS NULL AND ${branchClause("branch_id", 2)}
         ORDER BY full_name, id`,
        [clinicId, context.branchReadIds(), id],
      );
      const participants = result.rows.map((row): EventParticipant => ({
        ...mapLead(row),
        ...(row.contactedAt
          ? { contactedAt: row.contactedAt.toISOString() }
          : {}),
        ...(row.evaluationAt
          ? { evaluationAt: row.evaluationAt.toISOString() }
          : {}),
        ...(row.convertedPatientId && row.convertedAt
          ? { convertedAt: row.convertedAt.toISOString() }
          : {}),
      }));
      return {
        ...event,
        participants,
        indicators: buildEventIndicators(participants),
      };
    },

    async createEvent(
      clinicId: string,
      actorUserId: string,
      input: EventInput,
    ) {
      await assertBranch(context.pool, clinicId, input);
      await assertService(context.pool, clinicId, input);
      const id = randomUUID();
      await context.pool.query(
        `INSERT INTO events
           (id, clinic_id, branch_id, name, location, attendee_count, starts_at, notes,
            service_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           (SELECT u.id FROM users u WHERE u.clinic_id = $2 AND u.id = $10))`,
        [id, clinicId, ...values(input), actorUserId],
      );
      return (await findEvent(context.pool, clinicId, id))!;
    },

    async updateEvent(
      clinicId: string,
      _actorUserId: string,
      id: string,
      input: EventInput,
    ) {
      return context.inTransaction(async (client) => {
        const current = await client.query(
          `SELECT e.id FROM events e
           WHERE e.clinic_id = $1 AND e.id = $3 AND ${visibleEvent} FOR UPDATE`,
          [clinicId, context.branchReadIds(), id],
        );
        if (!current.rowCount) return null;
        await assertBranch(client, clinicId, input);
        await assertService(client, clinicId, input);
        await client.query(
          `UPDATE events SET branch_id = $3, name = $4, location = $5, attendee_count = $6,
             starts_at = $7, notes = $8, service_id = $9, updated_at = NOW(6)
           WHERE clinic_id = $1 AND id = $2`,
          [clinicId, id, ...values(input)],
        );
        return findEvent(client, clinicId, id);
      });
    },

    /** Apaga o evento; os participantes continuam como leads (`ON DELETE SET NULL`). */
    async deleteEvent(clinicId: string, id: string) {
      const result = await context.pool.query(
        `DELETE e FROM events e
         WHERE e.clinic_id = $1 AND e.id = $3 AND ${visibleEvent}`,
        [clinicId, context.branchReadIds(), id],
      );
      return result.rowCount > 0;
    },

    /** Tira o participante do evento; o lead continua no funil. */
    async removeEventParticipant(
      clinicId: string,
      eventId: string,
      leadId: string,
    ) {
      if (!(await findEvent(context.pool, clinicId, eventId))) return false;
      const result = await context.pool.query(
        `UPDATE leads SET event_id = NULL, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $3 AND event_id = $4
           AND ${branchClause("branch_id", 2)}`,
        [clinicId, context.branchReadIds(), leadId, eventId],
      );
      return result.rowCount > 0;
    },

    async listPatientLeadOrigins(clinicId: string) {
      const result = await context.pool.query<{
        patientId: string;
        eventName: string | null;
      }>(
        `SELECT coalesce(p.merged_into_patient_id, p.id) AS "patientId", e.name AS "eventName"
         FROM leads l
         JOIN patients p ON p.clinic_id = l.clinic_id AND p.id = l.converted_patient_id
         LEFT JOIN events e ON e.clinic_id = l.clinic_id AND e.id = l.event_id
         WHERE l.clinic_id = $1 AND l.converted_patient_id IS NOT NULL
         ORDER BY l.created_at, l.id`,
        [clinicId],
      );
      return result.rows.map((row): PatientLeadOrigin => ({
        patientId: row.patientId,
        ...(row.eventName ? { eventName: row.eventName } : {}),
      }));
    },
  };
}
