import { randomUUID } from "node:crypto";
import type {
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignSkipReason,
  AutoCampaignTrigger,
} from "@crm/contracts";
import type {
  AutoCampaignDeliveryWrite,
  AutoCampaignWrite,
} from "../../repository.js";
import { DomainError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
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

type StoredStep = AutoCampaign["steps"][number];

interface CampaignRow {
  id: string;
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: StoredStep[];
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
  handledAt: Date;
  handledByName: string | null;
}

const campaignColumns = `c.id, c.name, c.trigger, c.active, c.steps,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  u.full_name AS "createdByName"`;

const deliveryColumns = `d.id, d.campaign_id AS "campaignId", d.step_id AS "stepId",
  d.patient_id AS "patientId", d.occurrence_key AS "occurrenceKey", d.status,
  d.skip_reason AS "skipReason", d.note, d.message, d.handled_at AS "handledAt",
  u.full_name AS "handledByName"`;

const mapCampaign = (row: CampaignRow): AutoCampaign => ({
  id: row.id,
  name: row.name,
  trigger: row.trigger,
  active: row.active,
  steps: [...row.steps].sort((a, b) => a.offset - b.offset),
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

export function createAutoCampaignsRepository(
  repositoryContext: PostgresRepositoryContext,
) {
  async function loadCampaigns(clinicId: string, campaignId?: string) {
    const result = await repositoryContext.pool.query<CampaignRow>(
      `SELECT ${campaignColumns}
       FROM auto_campaigns c LEFT JOIN users u ON u.id = c.created_by
       WHERE c.clinic_id = $1 AND c.deleted_at IS NULL
         AND ($2::uuid IS NULL OR c.id = $2)
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
      const result = await repositoryContext.pool.query<{ id: string }>(
        `INSERT INTO auto_campaigns (clinic_id, name, trigger, active, steps, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
        [
          clinicId,
          input.name,
          input.trigger,
          input.active,
          JSON.stringify(writeSteps(input)),
          actorUserId,
        ],
      );
      return (await loadCampaigns(clinicId, result.rows[0]!.id))[0]!;
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
           SET name = $3, trigger = $4, active = $5, steps = $6::jsonb, updated_at = now()
           WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            campaignId,
            input.name,
            input.trigger,
            input.active,
            JSON.stringify(writeSteps(input, current.rows[0].steps)),
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
        `UPDATE auto_campaigns SET deleted_at = now()
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
        const saved = await client.query<{ id: string }>(
          `INSERT INTO auto_campaign_deliveries (
             clinic_id, campaign_id, step_id, patient_id, occurrence_key,
             status, skip_reason, note, message, handled_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (campaign_id, step_id, occurrence_key) DO UPDATE SET
             patient_id = EXCLUDED.patient_id, status = EXCLUDED.status,
             skip_reason = EXCLUDED.skip_reason, note = EXCLUDED.note,
             message = EXCLUDED.message, handled_by = EXCLUDED.handled_by,
             handled_at = now()
           RETURNING id`,
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
            actorUserId,
          ],
        );
        const result = await client.query<DeliveryRow>(
          `SELECT ${deliveryColumns}
           FROM auto_campaign_deliveries d LEFT JOIN users u ON u.id = d.handled_by
           WHERE d.id = $1`,
          [saved.rows[0]!.id],
        );
        return mapDelivery(result.rows[0]!);
      });
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
