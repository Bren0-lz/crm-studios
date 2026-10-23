import type {
  CampaignRecipientStatus,
  MessageImageMimeType,
  MessageTemplate,
  MessageTemplateImage,
  WhatsappCampaign,
  WhatsappCampaignRecipient,
  WhatsappCampaignRecipientDraft,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { DomainError, type MessageTemplateWrite } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";

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
}

interface RecipientRow {
  id: string;
  patientId: string;
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
  c.created_at AS "createdAt", c.completed_at AS "completedAt",
  u.full_name AS "createdByName",
  (SELECT count(*)::int FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id) AS total,
  (SELECT count(*)::int FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='sent') AS sent,
  (SELECT count(*)::int FROM whatsapp_campaign_recipients r WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='skipped') AS skipped`;

const recipientColumns = `r.id, r.patient_id AS "patientId", r.patient_name AS "patientName",
  r.phone, r.message, r.status, r.handled_at AS "handledAt", u.full_name AS "handledByName"`;

const toImage = (row: ImageRow): MessageTemplateImage => ({
  id: row.id,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
});

const toRecipient = (row: RecipientRow): WhatsappCampaignRecipient => ({
  id: row.id,
  patientId: row.patientId,
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
  repositoryContext: PostgresRepositoryContext,
) {
  const { pool } = repositoryContext;

  async function templateImages(
    client: Pool | PoolClient,
    clinicId: string,
    templateIds: string[],
  ) {
    const result = await client.query<ImageRow>(
      `SELECT ${imageColumns} FROM message_template_images
       WHERE clinic_id=$1 AND template_id = ANY($2::uuid[]) AND removed_at IS NULL
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
       WHERE clinic_id=$1 AND ($2::uuid IS NULL OR id=$2)
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
       WHERE c.clinic_id=$1 AND ($2::uuid IS NULL OR c.id=$2)
       ORDER BY c.created_at DESC`,
      [clinicId, campaignId ?? null],
    );
    const imageIds = [...new Set(result.rows.flatMap((row) => row.imageIds))];
    const images = imageIds.length
      ? (
          await client.query<ImageRow>(
            `SELECT ${imageColumns} FROM message_template_images
             WHERE clinic_id=$1 AND id = ANY($2::uuid[])`,
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
       WHERE r.clinic_id=$1 AND r.campaign_id=$2 AND ($3::uuid IS NULL OR r.id=$3)
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
      `UPDATE message_template_images SET removed_at=now()
       WHERE clinic_id=$1 AND template_id=$2 AND removed_at IS NULL AND NOT (id = ANY($3::uuid[]))`,
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
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO message_templates (clinic_id, title, body, created_by)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [clinicId, input.title, input.body, actorUserId],
        );
        const templateId = inserted.rows[0]!.id;
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
          `UPDATE message_templates SET title=$3, body=$4, updated_at=now()
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
        const updated = await client.query<{ title: string }>(
          `UPDATE message_templates
           SET archived_at = CASE WHEN $3 THEN coalesce(archived_at, now()) ELSE NULL END,
               updated_at = now()
           WHERE clinic_id=$1 AND id=$2 RETURNING title`,
          [clinicId, templateId, archived],
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
      },
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const template = await client.query<{ title: string; body: string }>(
          `SELECT title, body FROM message_templates
           WHERE clinic_id=$1 AND id=$2 AND archived_at IS NULL FOR SHARE`,
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
            "Nenhum cliente com WhatsApp para receber a campanha.",
            400,
          );
        const images = await templateImages(client, clinicId, [
          input.templateId,
        ]);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO whatsapp_campaigns
             (clinic_id, template_id, template_title, name, body, image_ids, created_by)
           VALUES ($1,$2,$3,$4,$5,$6::uuid[],$7) RETURNING id`,
          [
            clinicId,
            input.templateId,
            template.rows[0].title,
            input.name,
            template.rows[0].body,
            images.map((image) => image.id),
            actorUserId,
          ],
        );
        const campaignId = inserted.rows[0]!.id;
        await client.query(
          `INSERT INTO whatsapp_campaign_recipients
             (clinic_id, campaign_id, patient_id, position, patient_name, phone, message)
           SELECT $1, $2, item.patient_id, item.position - 1, item.patient_name, item.phone, item.message
           FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[])
             WITH ORDINALITY AS item(patient_id, patient_name, phone, message, position)`,
          [
            clinicId,
            campaignId,
            input.recipients.map((item) => item.patientId),
            input.recipients.map((item) => item.patientName),
            input.recipients.map((item) => item.phone),
            input.recipients.map((item) => item.message),
          ],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "campaign.created",
          "whatsapp_campaign",
          campaignId,
          { name: input.name, recipients: input.recipients.length },
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
               handled_at = CASE WHEN $4='pending' THEN NULL ELSE now() END,
               handled_by = CASE WHEN $4='pending' THEN NULL ELSE $5::uuid END
           WHERE clinic_id=$1 AND campaign_id=$2 AND id=$3`,
          [clinicId, campaignId, recipientId, status, actorUserId],
        );
        if (!updated.rowCount) return null;
        await client.query(
          `UPDATE whatsapp_campaigns c SET completed_at = CASE
             WHEN EXISTS (SELECT 1 FROM whatsapp_campaign_recipients r
                          WHERE r.clinic_id=c.clinic_id AND r.campaign_id=c.id AND r.status='pending')
             THEN NULL ELSE coalesce(c.completed_at, now()) END
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
  };
}
