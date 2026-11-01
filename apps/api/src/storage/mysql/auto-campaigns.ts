import { randomUUID } from "node:crypto";
import type {
  AppointmentStatus,
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignPromotion,
  AutoCampaignRedemption,
  AutoCampaignSkipReason,
  AutoCampaignTrigger,
} from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import type {
  AutoCampaignDeliveryWrite,
  AutoCampaignRedemptionWrite,
  AutoCampaignWrite,
} from "../../repository.js";
import { DomainError } from "../../repository.js";
import type { MysqlRepositoryContext } from "./context.js";
import {
  type AppointmentRow,
  type PatientRow,
  type PatientTabRow,
  type ReceivableRow,
  appointmentColumns,
  appointmentJoins,
  mapAppointment,
  mapPatient,
  mapPatientTab,
  mapReceivable,
  patientColumns,
  receivableColumns,
} from "./helpers.js";
import { json } from "./mappers/common.js";

type StoredStep = AutoCampaign["steps"][number];

interface CampaignRow {
  id: string;
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: StoredStep[];
  promotion: AutoCampaignPromotion | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
}

interface DeliveryRow {
  id: string;
  campaignId: string;
  stepId: string;
  patientId: string;
  occurrenceKey: string;
  status: "sent" | "skipped";
  skipReason: AutoCampaignSkipReason | null;
  note: string | null;
  message: string;
  promotionValidUntil: string | null;
  handledAt: Date;
  handledByName: string | null;
}

interface RedemptionRow {
  id: string;
  campaignId: string;
  patientId: string;
  occurrenceKey: string;
  appointmentId: string;
  appointmentStatus: AppointmentStatus;
  redeemedOn: string;
  blockedUntil: string | null;
}

// `trigger` é palavra reservada no MySQL: sempre entre aspas.
const campaignColumns = `c.id, c.name, c."trigger", c.active, c.steps, c.promotion,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  u.full_name AS "createdByName"`;

const deliveryColumns = `d.id, d.campaign_id AS "campaignId", d.step_id AS "stepId",
  d.patient_id AS "patientId", d.occurrence_key AS "occurrenceKey", d.status,
  d.skip_reason AS "skipReason", d.note, d.message,
  d.promotion_valid_until AS "promotionValidUntil",
  d.handled_at AS "handledAt",
  u.full_name AS "handledByName"`;

const mapCampaign = (row: CampaignRow): AutoCampaign => ({
  id: row.id,
  name: row.name,
  trigger: row.trigger,
  active: Boolean(row.active),
  steps: [...json<StoredStep[]>(row.steps)].sort((a, b) => a.offset - b.offset),
  ...(row.promotion
    ? { promotion: json<AutoCampaignPromotion>(row.promotion) }
    : {}),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  createdByName: row.createdByName ?? "Usuário removido",
});

const mapDelivery = (row: DeliveryRow): AutoCampaignDelivery => ({
  id: row.id,
  campaignId: row.campaignId,
  stepId: row.stepId,
  patientId: row.patientId,
  occurrenceKey: row.occurrenceKey,
  status: row.status,
  ...(row.skipReason ? { skipReason: row.skipReason } : {}),
  ...(row.note ? { note: row.note } : {}),
  message: row.message,
  ...(row.promotionValidUntil
    ? { promotionValidUntil: row.promotionValidUntil }
    : {}),
  handledAt: row.handledAt.toISOString(),
  handledByName: row.handledByName ?? "Usuário removido",
});

function writeSteps(input: AutoCampaignWrite, current: StoredStep[] = []) {
  return input.steps.map((step) => ({
    id:
      step.id && current.some((item) => item.id === step.id)
        ? step.id
        : randomUUID(),
    offset: step.offset,
    message: step.message,
  }));
}

/**
 * Grava o uso da promoção na mesma transação do atendimento (campanha automática ou, com
 * `source: "manual"`, campanha manual).
 */
export async function insertAutoCampaignRedemption(
  client: PoolClient,
  clinicId: string,
  patientId: string,
  appointmentId: string,
  promotion: AutoCampaignRedemptionWrite,
) {
  if (promotion.source === "manual") {
    await client.query(
      `INSERT INTO whatsapp_campaign_redemptions (
         clinic_id, campaign_id, patient_id, occurrence_key, appointment_id, redeemed_on
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        clinicId,
        promotion.campaignId,
        patientId,
        promotion.occurrenceKey,
        appointmentId,
        promotion.redeemedOn,
      ],
    );
    return;
  }
  await client.query(
    `INSERT INTO auto_campaign_redemptions (
       clinic_id, campaign_id, patient_id, occurrence_key, appointment_id,
       redeemed_on, blocked_until
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      clinicId,
      promotion.campaignId,
      patientId,
      promotion.occurrenceKey,
      appointmentId,
      promotion.redeemedOn,
      promotion.blockedUntil ?? null,
    ],
  );
}

export function createAutoCampaignsRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  async function loadCampaigns(clinicId: string, campaignId?: string) {
    const result = await repositoryContext.pool.query<CampaignRow>(
      `SELECT ${campaignColumns}
       FROM auto_campaigns c LEFT JOIN users u ON u.id = c.created_by
       WHERE c.clinic_id = $1 AND c.deleted_at IS NULL
         AND ($2 IS NULL OR c.id = $2)
       ORDER BY c.created_at DESC`,
      [clinicId, campaignId ?? null],
    );
    return result.rows.map(mapCampaign);
  }

  return {
    async listAutoCampaigns(clinicId: string) {
      return loadCampaigns(clinicId);
    },

    async getAutoCampaign(clinicId: string, campaignId: string) {
      return (await loadCampaigns(clinicId, campaignId))[0] ?? null;
    },

    async createAutoCampaign(
      clinicId: string,
      actorUserId: string,
      input: AutoCampaignWrite,
    ) {
      const id = randomUUID();
      await repositoryContext.pool.query(
        `INSERT INTO auto_campaigns
           (id, clinic_id, name, "trigger", active, steps, promotion, created_by)
         VALUES ($8, $1, $2, $3, $4, $5, $6, $7)`,
        [
          clinicId,
          input.name,
          input.trigger,
          input.active,
          JSON.stringify(writeSteps(input)),
          input.promotion ? JSON.stringify(input.promotion) : null,
          actorUserId,
          id,
        ],
      );
      return (await loadCampaigns(clinicId, id))[0]!;
    },

    async updateAutoCampaign(
      clinicId: string,
      campaignId: string,
      input: AutoCampaignWrite,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<{ steps: StoredStep[] }>(
          `SELECT steps FROM auto_campaigns
           WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [clinicId, campaignId],
        );
        if (!current.rows[0]) return null;
        await client.query(
          `UPDATE auto_campaigns
           SET name = $3, "trigger" = $4, active = $5, steps = $6,
             promotion = $7, updated_at = NOW(6)
           WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            campaignId,
            input.name,
            input.trigger,
            input.active,
            JSON.stringify(writeSteps(input, current.rows[0].steps)),
            input.promotion ? JSON.stringify(input.promotion) : null,
          ],
        );
        const result = await client.query<CampaignRow>(
          `SELECT ${campaignColumns}
           FROM auto_campaigns c LEFT JOIN users u ON u.id = c.created_by
           WHERE c.clinic_id = $1 AND c.id = $2`,
          [clinicId, campaignId],
        );
        return mapCampaign(result.rows[0]!);
      });
    },

    async deleteAutoCampaign(clinicId: string, campaignId: string) {
      const result = await repositoryContext.pool.query(
        `UPDATE auto_campaigns SET deleted_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [clinicId, campaignId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listAutoCampaignDeliveries(clinicId: string) {
      const result = await repositoryContext.pool.query<DeliveryRow>(
        `SELECT ${deliveryColumns}
         FROM auto_campaign_deliveries d
         JOIN auto_campaigns c ON c.clinic_id = d.clinic_id AND c.id = d.campaign_id
         LEFT JOIN users u ON u.id = d.handled_by
         WHERE d.clinic_id = $1 AND c.deleted_at IS NULL`,
        [clinicId],
      );
      return result.rows.map(mapDelivery);
    },

    async saveAutoCampaignDelivery(
      clinicId: string,
      actorUserId: string,
      input: AutoCampaignDeliveryWrite,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const campaign = await client.query<{ steps: StoredStep[] }>(
          `SELECT steps FROM auto_campaigns
           WHERE clinic_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [clinicId, input.campaignId],
        );
        if (!campaign.rows[0]?.steps.some((step) => step.id === input.stepId))
          throw new DomainError(
            "AUTO_CAMPAIGN_NOT_FOUND",
            "Campanha automática não encontrada.",
            404,
          );
        const patient = await client.query(
          "SELECT 1 FROM patients WHERE clinic_id = $1 AND id = $2",
          [clinicId, input.patientId],
        );
        if (!patient.rows[0])
          throw new DomainError(
            "PATIENT_NOT_FOUND",
            "Cliente não encontrado.",
            404,
          );
        await client.query(
          `INSERT INTO auto_campaign_deliveries (
             clinic_id, campaign_id, step_id, patient_id, occurrence_key,
             status, skip_reason, note, message, promotion_valid_until, handled_by, id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON DUPLICATE KEY UPDATE
             patient_id = VALUES(patient_id), status = VALUES(status),
             skip_reason = VALUES(skip_reason), note = VALUES(note),
             message = VALUES(message),
             promotion_valid_until = VALUES(promotion_valid_until),
             handled_by = VALUES(handled_by), handled_at = NOW(6)`,
          [
            clinicId,
            input.campaignId,
            input.stepId,
            input.patientId,
            input.occurrenceKey,
            input.status,
            input.status === "skipped" ? (input.skipReason ?? null) : null,
            input.note || null,
            input.message,
            input.status === "sent"
              ? (input.promotionValidUntil ?? null)
              : null,
            actorUserId,
            randomUUID(),
          ],
        );
        // Na atualização o id continua o da linha existente: lê pela chave única.
        const result = await client.query<DeliveryRow>(
          `SELECT ${deliveryColumns}
           FROM auto_campaign_deliveries d LEFT JOIN users u ON u.id = d.handled_by
           WHERE d.campaign_id = $1 AND d.step_id = $2 AND d.occurrence_key = $3`,
          [input.campaignId, input.stepId, input.occurrenceKey],
        );
        return mapDelivery(result.rows[0]!);
      });
    },

    async listAutoCampaignRedemptions(
      clinicId: string,
    ): Promise<AutoCampaignRedemption[]> {
      const result = await repositoryContext.pool.query<RedemptionRow>(
        `SELECT r.id, r.campaign_id AS "campaignId", r.patient_id AS "patientId",
           r.occurrence_key AS "occurrenceKey", r.appointment_id AS "appointmentId",
           a.status AS "appointmentStatus",
           r.redeemed_on AS "redeemedOn",
           r.blocked_until AS "blockedUntil"
         FROM auto_campaign_redemptions r
         JOIN auto_campaigns c ON c.clinic_id = r.clinic_id AND c.id = r.campaign_id
         JOIN appointments a ON a.clinic_id = r.clinic_id AND a.id = r.appointment_id
         WHERE r.clinic_id = $1 AND c.deleted_at IS NULL`,
        [clinicId],
      );
      return result.rows.map(({ blockedUntil, ...row }) => ({
        ...row,
        ...(blockedUntil ? { blockedUntil } : {}),
      }));
    },

    async deleteAutoCampaignDelivery(clinicId: string, deliveryId: string) {
      const result = await repositoryContext.pool.query(
        "DELETE FROM auto_campaign_deliveries WHERE clinic_id = $1 AND id = $2",
        [clinicId, deliveryId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async getAutoCampaignSourceData(clinicId: string, surveysFrom: string) {
      const [plans, surveys, patients, appointments, receivables, tabs] =
        await Promise.all([
          repositoryContext.operations.listPatientPlans(clinicId),
          repositoryContext.operations.listSatisfactionSurveys(clinicId, {
            from: surveysFrom,
          }),
          repositoryContext.pool.query<PatientRow>(
            `SELECT ${patientColumns} FROM patients
             WHERE clinic_id = $1 AND status = 'active'`,
            [clinicId],
          ),
          repositoryContext.pool.query<AppointmentRow>(
            `SELECT ${appointmentColumns}
             FROM appointments a
             ${appointmentJoins}
             WHERE a.clinic_id = $1 AND a.patient_id IS NOT NULL`,
            [clinicId],
          ),
          repositoryContext.pool.query<ReceivableRow>(
            `SELECT ${receivableColumns}
             FROM receivables r JOIN patients p ON p.id = r.patient_id
             WHERE r.clinic_id = $1 AND r.status = 'open'`,
            [clinicId],
          ),
          repositoryContext.pool.query<PatientTabRow>(
            `SELECT t.id,t.clinic_id AS "clinicId",t.patient_id AS "patientId",p.full_name AS "patientName",t.notes,t.status,t.payment_status AS "paymentStatus",t.total_in_cents AS "totalInCents",t.receivable_id AS "receivableId",t.opened_at AS "openedAt",t.closed_at AS "closedAt",t.cancelled_at AS "cancelledAt" FROM patient_tabs t JOIN patients p ON p.id=t.patient_id WHERE t.clinic_id=$1 AND t.status='closed'`,
            [clinicId],
          ),
        ]);
      return {
        patients: patients.rows.map(mapPatient),
        plans,
        appointments: appointments.rows.map(mapAppointment),
        receivables: receivables.rows.map(mapReceivable),
        // Os itens da comanda não influenciam as campanhas.
        tabs: tabs.rows.map((row) => mapPatientTab(row, [])),
        surveys,
      };
    },
  };
}
