import type {
  AppointmentStatus,
  AutoCampaignRedemption,
  CampaignRecipientStatus,
  MessageImageMimeType,
  MessageTemplate,
  MessageTemplateImage,
  WhatsappCampaign,
  WhatsappCampaignPromotion,
  WhatsappCampaignRecipient,
  WhatsappCampaignRecipientDraft,
} from "@crm/contracts";
import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import { DomainError, type MessageTemplateWrite } from "../../repository.js";
import { randomUUID } from "node:crypto";
import type { MysqlRepositoryContext } from "./context.js";
import { json } from "./mappers/common.js";
import { insertRows, writeAndRead } from "./sql.js";

interface TemplateRow {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

interface ImageRow {
  id: string;
  templateId: string;
  fileName: string;
  mimeType: MessageImageMimeType;
  sizeBytes: number;
}

interface CampaignRow {
  id: string;
  name: string;
  templateId: string;
  templateTitle: string;
  body: string;
  imageIds: string[];
  total: number;
  sent: number;
  skipped: number;
  createdAt: Date;
  createdByName: string | null;
  completedAt: Date | null;
  promotion: WhatsappCampaignPromotion | null;
}

interface RecipientRow {
  id: string;
  patientId: string | null;
  leadId: string | null;
  patientName: string;
  phone: string;
  message: string;
  status: CampaignRecipientStatus;
  handledAt: Date | null;
  handledByName: string | null;
}

const imageColumns = `id, template_id AS "templateId", file_name AS "fileName",
  mime_type AS "mimeType", size_bytes AS "sizeBytes"`;

const campaignColumns = `c.id, c.name, c.template_id AS "templateId",
  c.template_title AS "templateTitle", c.body, c.image_ids AS "imageIds",
  c.created_at AS "createdAt", c.completed_at AS "completedAt", c.promotion,
  u.full_name AS "createdByName",
  (SELECT count(*) FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id) AS total,
  (SELECT count(*) FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='sent') AS sent,
  (SELECT count(*) FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='skipped') AS skipped`;

const recipientColumns = `r.id, r.patient_id AS "patientId", r.lead_id AS "leadId",
  r.patient_name AS "patientName",
  r.phone, r.message, r.status, r.handled_at AS "handledAt", u.full_name AS "handledByName"`;

const toImage = (row: ImageRow): MessageTemplateImage => ({
  id: row.id,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
});

const toRecipient = (row: RecipientRow): WhatsappCampaignRecipient => ({
  id: row.id,
  ...(row.patientId ? { patientId: row.patientId } : {}),
  ...(row.leadId ? { leadId: row.leadId } : {}),
  patientName: row.patientName,
  phone: row.phone,
  message: row.message,
  status: row.status,
  ...(row.handledAt
    ? {
        handledAt: row.handledAt.toISOString(),
        handledByName: row.handledByName ?? "Usuário removido",
      }
    : {}),
});

export function createCampaignsRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  const { pool } = repositoryContext;

  async function templateImages(
    client: Pool | PoolClient,
    clinicId: string,
    templateIds: string[],
  ) {
    const result = await client.query<ImageRow>(
      `SELECT ${imageColumns} FROM message_template_images
       WHERE clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(template_id)) AND removed_at IS NULL
       ORDER BY position`,
      [clinicId, templateIds],
    );
    return result.rows;
  }

  async function loadTemplates(
    client: Pool | PoolClient,
    clinicId: string,
    templateId?: string,
  ): Promise<MessageTemplate[]> {
    const result = await client.query<TemplateRow>(
      `SELECT id, title, body, created_at AS "createdAt", updated_at AS "updatedAt",
              archived_at AS "archivedAt"
       FROM message_templates
       WHERE clinic_id=$1 AND ($2 IS NULL OR id=$2)
       ORDER BY updated_at DESC`,
      [clinicId, templateId ?? null],
    );
    const images = await templateImages(
      client,
      clinicId,
      result.rows.map((row) => row.id),
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      images: images
        .filter((image) => image.templateId === row.id)
        .map(toImage),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
    }));
  }

  async function loadCampaigns(
    client: Pool | PoolClient,
    clinicId: string,
    campaignId?: string,
  ): Promise<WhatsappCampaign[]> {
    const result = await client.query<CampaignRow>(
      `SELECT ${campaignColumns}
       FROM whatsapp_campaigns c
       LEFT JOIN users u ON u.id=c.created_by AND u.clinic_id=c.clinic_id
       WHERE c.clinic_id=$1 AND ($2 IS NULL OR c.id=$2)
       ORDER BY c.created_at DESC`,
      [clinicId, campaignId ?? null],
    );
    const imageIds = [...new Set(result.rows.flatMap((row) => row.imageIds))];
    const images = imageIds.length
      ? (
          await client.query<ImageRow>(
            `SELECT ${imageColumns} FROM message_template_images
             WHERE clinic_id=$1 AND JSON_CONTAINS($2, JSON_QUOTE(id))`,
            [clinicId, imageIds],
          )
        ).rows
      : [];
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      templateId: row.templateId,
      templateTitle: row.templateTitle,
      body: row.body,
      images: row.imageIds
        .map((id) => images.find((image) => image.id === id))
        .filter((image) => image !== undefined)
        .map(toImage),
      total: row.total,
      sent: row.sent,
      skipped: row.skipped,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName ?? "Usuário removido",
      ...(row.completedAt
        ? { completedAt: row.completedAt.toISOString() }
        : {}),
      ...(row.promotion
        ? { promotion: json<WhatsappCampaignPromotion>(row.promotion) }
        : {}),
    }));
  }

  async function loadRecipients(
    client: Pool | PoolClient,
    clinicId: string,
    campaignId: string,
    recipientId?: string,
  ) {
    const result = await client.query<RecipientRow>(
      `SELECT ${recipientColumns}
       FROM whatsapp_campaign_recipients r
       LEFT JOIN users u ON u.id=r.handled_by AND u.clinic_id=r.clinic_id
       WHERE r.clinic_id=$1 AND r.campaign_id=$2 AND ($3 IS NULL OR r.id=$3)
       ORDER BY r.position`,
      [clinicId, campaignId, recipientId ?? null],
    );
    return result.rows.map(toRecipient);
  }

  /** Mantém as imagens com `id` (na nova ordem), marca as demais como removidas e grava as novas. */
  async function writeImages(
    client: PoolClient,
    clinicId: string,
    templateId: string,
    images: MessageTemplateWrite["images"],
  ) {
    const current = await templateImages(client, clinicId, [templateId]);
    for (const image of images)
      if ("id" in image && !current.some((item) => item.id === image.id))
        throw new DomainError(
          "MESSAGE_TEMPLATE_IMAGE_NOT_FOUND",
          "Imagem não encontrada nesta mensagem padrão.",
          400,
        );
    const kept = images.flatMap((image) => ("id" in image ? [image.id] : []));
    await client.query(
      `UPDATE message_template_images SET removed_at=NOW(6)
       WHERE clinic_id=$1 AND template_id=$2 AND removed_at IS NULL AND NOT (JSON_CONTAINS($3, JSON_QUOTE(id)))`,
      [clinicId, templateId, kept],
    );
    for (const [position, image] of images.entries()) {
      if ("id" in image) {
        await client.query(
          "UPDATE message_template_images SET position=$3 WHERE clinic_id=$1 AND id=$2",
          [clinicId, image.id, position],
        );
        continue;
      }
      await client.query(
        `INSERT INTO message_template_images
           (clinic_id, template_id, position, file_name, mime_type, size_bytes, data_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          clinicId,
          templateId,
          position,
          image.fileName,
          image.mimeType,
          image.sizeBytes,
          image.dataUrl,
        ],
      );
    }
  }

  return {
    async listMessageTemplates(clinicId: string) {
      return loadTemplates(pool, clinicId);
    },

    async getMessageTemplateImage(clinicId: string, imageId: string) {
      const result = await pool.query<ImageRow & { dataUrl: string }>(
        `SELECT ${imageColumns}, data_url AS "dataUrl" FROM message_template_images
         WHERE clinic_id=$1 AND id=$2`,
        [clinicId, imageId],
      );
      const row = result.rows[0];
      return row ? { ...toImage(row), dataUrl: row.dataUrl } : null;
    },

    async createMessageTemplate(
      clinicId: string,
      actorUserId: string,
      input: MessageTemplateWrite,
    ) {
      if (input.images.some((image) => "id" in image))
        throw new DomainError(
          "MESSAGE_TEMPLATE_IMAGE_NOT_FOUND",
          "Imagem não encontrada nesta mensagem padrão.",
          400,
        );
      return repositoryContext.inTransaction(async (client) => {
        const templateId = randomUUID();
        await client.query(
          `INSERT INTO message_templates (clinic_id, title, body, created_by, id)
           VALUES ($1,$2,$3,$4,$5)`,
          [clinicId, input.title, input.body, actorUserId, templateId],
        );
        await writeImages(client, clinicId, templateId, input.images);
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "message_template.saved",
          "message_template",
          templateId,
          { title: input.title },
        );
        return (await loadTemplates(client, clinicId, templateId))[0]!;
      });
    },

    async updateMessageTemplate(
      clinicId: string,
      actorUserId: string,
      templateId: string,
      input: MessageTemplateWrite,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE message_templates SET title=$3, body=$4, updated_at=NOW(6)
           WHERE clinic_id=$1 AND id=$2`,
          [clinicId, templateId, input.title, input.body],
        );
        if (!updated.rowCount) return null;
        await writeImages(client, clinicId, templateId, input.images);
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "message_template.saved",
          "message_template",
          templateId,
          { title: input.title },
        );
        return (await loadTemplates(client, clinicId, templateId))[0]!;
      });
    },

    async setMessageTemplateArchived(
      clinicId: string,
      actorUserId: string,
      templateId: string,
      archived: boolean,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const updated = await writeAndRead<{ title: string }>(
          client,
          `UPDATE message_templates
           SET archived_at = CASE WHEN $3 THEN coalesce(archived_at, NOW(6)) ELSE NULL END,
               updated_at = NOW(6)
           WHERE clinic_id=$1 AND id=$2`,
          [clinicId, templateId, archived],
          "SELECT title FROM message_templates WHERE clinic_id=$1 AND id=$2",
        );
        if (!updated.rows[0]) return null;
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "message_template.archived",
          "message_template",
          templateId,
          { title: updated.rows[0].title, archived },
        );
        return (await loadTemplates(client, clinicId, templateId))[0]!;
      });
    },

    async listWhatsappCampaigns(clinicId: string) {
      return loadCampaigns(pool, clinicId);
    },

    async getWhatsappCampaign(clinicId: string, campaignId: string) {
      const [campaign] = await loadCampaigns(pool, clinicId, campaignId);
      if (!campaign) return null;
      return {
        ...campaign,
        recipients: await loadRecipients(pool, clinicId, campaignId),
      };
    },

    async createWhatsappCampaign(
      clinicId: string,
      actorUserId: string,
      input: {
        templateId: string;
        name: string;
        recipients: WhatsappCampaignRecipientDraft[];
        promotion?: WhatsappCampaignPromotion | undefined;
      },
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const template = await client.query<{ title: string; body: string }>(
          `SELECT title, body FROM message_templates
           WHERE clinic_id=$1 AND id=$2 AND archived_at IS NULL LOCK IN SHARE MODE`,
          [clinicId, input.templateId],
        );
        if (!template.rows[0])
          throw new DomainError(
            "MESSAGE_TEMPLATE_NOT_FOUND",
            "Mensagem padrão não encontrada ou arquivada.",
            404,
          );
        if (input.recipients.length === 0)
          throw new DomainError(
            "CAMPAIGN_WITHOUT_RECIPIENTS",
            "Nenhum cliente ou lead com WhatsApp para receber a campanha.",
            400,
          );
        const images = await templateImages(client, clinicId, [
          input.templateId,
        ]);
        const campaignId = randomUUID();
        await client.query(
          `INSERT INTO whatsapp_campaigns
             (clinic_id, template_id, template_title, name, body, image_ids, created_by, id, promotion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            clinicId,
            input.templateId,
            template.rows[0].title,
            input.name,
            template.rows[0].body,
            images.map((image) => image.id),
            actorUserId,
            campaignId,
            input.promotion ?? null,
          ],
        );
        await insertRows(
          client,
          "whatsapp_campaign_recipients",
          input.recipients.map((item, position) => ({
            clinic_id: clinicId,
            campaign_id: campaignId,
            patient_id: item.patientId ?? null,
            lead_id: item.leadId ?? null,
            position,
            patient_name: item.patientName,
            phone: item.phone,
            message: item.message,
          })),
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "campaign.created",
          "whatsapp_campaign",
          campaignId,
          {
            name: input.name,
            recipients: input.recipients.length,
            promotional: Boolean(input.promotion),
          },
        );
        const [campaign] = await loadCampaigns(client, clinicId, campaignId);
        return {
          ...campaign!,
          recipients: await loadRecipients(client, clinicId, campaignId),
        };
      });
    },

    async setWhatsappCampaignRecipientStatus(
      clinicId: string,
      actorUserId: string,
      campaignId: string,
      recipientId: string,
      status: CampaignRecipientStatus,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const locked = await client.query(
          "SELECT id FROM whatsapp_campaigns WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, campaignId],
        );
        if (!locked.rowCount) return null;
        const updated = await client.query(
          `UPDATE whatsapp_campaign_recipients
           SET status=$4,
               handled_at = CASE WHEN $4='pending' THEN NULL ELSE NOW(6) END,
               handled_by = CASE WHEN $4='pending' THEN NULL ELSE $5 END
           WHERE clinic_id=$1 AND campaign_id=$2 AND id=$3`,
          [clinicId, campaignId, recipientId, status, actorUserId],
        );
        if (!updated.rowCount) return null;
        await client.query(
          `UPDATE whatsapp_campaigns c SET completed_at = CASE
             WHEN EXISTS (SELECT 1 FROM whatsapp_campaign_recipients r
                          WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='pending')
             THEN NULL ELSE coalesce(c.completed_at, NOW(6)) END
           WHERE c.clinic_id=$1 AND c.id=$2`,
          [clinicId, campaignId],
        );
        const [campaign] = await loadCampaigns(client, clinicId, campaignId);
        const [recipient] = await loadRecipients(
          client,
          clinicId,
          campaignId,
          recipientId,
        );
        return { campaign: campaign!, recipient: recipient! };
      });
    },

    async listWhatsappCampaignRedemptions(
      clinicId: string,
    ): Promise<AutoCampaignRedemption[]> {
      const result = await pool.query<{
        id: string;
        campaignId: string;
        patientId: string;
        occurrenceKey: string;
        appointmentId: string;
        appointmentStatus: AppointmentStatus;
        redeemedOn: string;
      }>(
        `SELECT r.id, r.campaign_id AS "campaignId", r.patient_id AS "patientId",
           r.occurrence_key AS "occurrenceKey", r.appointment_id AS "appointmentId",
           a.status AS "appointmentStatus", r.redeemed_on AS "redeemedOn"
         FROM whatsapp_campaign_redemptions r
         JOIN appointments a ON a.clinic_id = r.clinic_id AND a.id = r.appointment_id
         WHERE r.clinic_id = $1`,
        [clinicId],
      );
      return result.rows;
    },
  };
}
