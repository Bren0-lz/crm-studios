import {
  signatureLinkExpiresAt,
  type ClinicBranding,
  type DocumentContent,
  type DocumentSignatureLinkDetails,
  type DocumentSignatureLinkView,
  type DocumentStatus,
  type PublicDocumentSignInput,
  type PublicRequestMetadata,
  type PublicSignatureDocument,
} from "@crm/contracts";
import type { PoolClient } from "../../infrastructure/mysql-client.js";
import { assertDocumentPatientCpf } from "../../modules/contracts/patient-cpf.js";
import { DomainError } from "../../repository.js";
import {
  assertSignatureLinkOpen,
  documentTextSha256,
} from "../../modules/contracts/signature-links.js";
import {
  appendSignatureView,
  createSignatureToken,
  signerEvidence,
} from "../../modules/signatures/signature-evidence.js";
import type { MysqlRepositoryContext } from "./context.js";
import { writeAndRead } from "./sql.js";

interface PublicLinkRow {
  id: string;
  title: string;
  patientName: string;
  clinicName: string;
  snapshotBody: string;
  snapshotContent: DocumentContent | null;
  branding: ClinicBranding | null;
  documentStatus: DocumentStatus;
  views: DocumentSignatureLinkView[];
  expiresAt: Date;
  signedAt: Date | null;
  signature: { signerName: string; documentSha256: string } | null;
}

function assertRowOpen(row: PublicLinkRow) {
  assertSignatureLinkOpen({
    expiresAt: row.expiresAt.toISOString(),
    ...(row.signedAt ? { signedAt: row.signedAt.toISOString() } : {}),
  });
}

/** Documento pelo token, travado para registrar visualização ou assinatura. */
async function lockByToken(client: PoolClient, token: string) {
  const result = await client.query<PublicLinkRow>(
    `SELECT l.id, d.title, COALESCE(p.full_name, s.name) AS "patientName",
            COALESCE(NULLIF(JSON_VALUE(d.branding, '$.name'), ''), c.name) AS "clinicName",
            d.snapshot_body AS "snapshotBody", d.snapshot_content AS "snapshotContent",
            d.branding, d.status AS "documentStatus", l.views,
            l.expires_at AS "expiresAt", l.signed_at AS "signedAt", l.signature
       FROM document_signature_links l
       JOIN issued_documents d ON d.id = l.document_id AND d.clinic_id = l.clinic_id
       LEFT JOIN patients p ON p.id = d.patient_id AND p.clinic_id = d.clinic_id
       LEFT JOIN suppliers s ON s.id = d.supplier_id AND s.clinic_id = d.clinic_id
       JOIN clinics c ON c.id = l.clinic_id
      WHERE l.token = $1
      FOR UPDATE`,
    [token],
  );
  return result.rows[0] ?? null;
}

function publicDocument(row: PublicLinkRow): PublicSignatureDocument {
  return {
    title: row.title,
    patientName: row.patientName,
    clinicName: row.clinicName,
    snapshotBody: row.snapshotBody,
    ...(row.snapshotContent ? { snapshotContent: row.snapshotContent } : {}),
    ...(row.branding ? { branding: row.branding } : {}),
    status: row.signedAt
      ? "signed"
      : row.documentStatus === "cancelled"
        ? "cancelled"
        : "pending",
    documentSha256:
      row.signature?.documentSha256 ?? documentTextSha256(row.snapshotBody),
    ...(row.signedAt ? { signedAt: row.signedAt.toISOString() } : {}),
    ...(row.signature ? { signerName: row.signature.signerName } : {}),
  };
}

export function createDocumentSignatureLinksRepository(
  context: MysqlRepositoryContext,
) {
  return {
    async createDocumentSignatureLink(
      clinicId: string,
      actorUserId: string,
      documentId: string,
    ) {
      return context.inTransaction(async (client) => {
        const documents = await client.query<{
          status: DocumentStatus;
          phone: string | null;
          clinicName: string;
        }>(
          // Quem assina: o cliente ou o fornecedor (WhatsApp, senão telefone).
          `SELECT d.status,
                  COALESCE(p.phone, NULLIF(s.whatsapp, ''), NULLIF(s.phone, '')) AS phone,
                  COALESCE(NULLIF(JSON_VALUE(d.branding, '$.name'), ''), c.name) AS "clinicName"
             FROM issued_documents d
             LEFT JOIN patients p ON p.id = d.patient_id AND p.clinic_id = d.clinic_id
             LEFT JOIN suppliers s ON s.id = d.supplier_id AND s.clinic_id = d.clinic_id
             JOIN clinics c ON c.id = d.clinic_id
            WHERE d.clinic_id = $1 AND d.id = $2
            FOR UPDATE`,
          [clinicId, documentId],
        );
        const document = documents.rows[0];
        if (!document) return null;
        if (document.status !== "issued")
          throw new DomainError(
            "DOCUMENT_NOT_ISSUED",
            "Emita o documento antes de enviar o link de assinatura.",
            409,
          );
        const existing = await client.query<{
          token: string;
          expiresAt: Date;
          signedAt: Date | null;
        }>(
          `SELECT token, expires_at AS "expiresAt", signed_at AS "signedAt"
             FROM document_signature_links WHERE clinic_id=$1 AND document_id=$2`,
          [clinicId, documentId],
        );
        const current = existing.rows[0];
        let token = current?.token;
        // Link vencido sem assinatura: troca o token (o antigo deixa de abrir) e renova o prazo.
        const renewing = Boolean(
          current &&
          !current.signedAt &&
          current.expiresAt.getTime() <= Date.now(),
        );
        if (!token || renewing) {
          const currentDocument = await context.findIssuedDocument(
            client,
            clinicId,
            documentId,
          );
          assertDocumentPatientCpf(currentDocument!);
          token = createSignatureToken();
          const createdAt = new Date().toISOString();
          await client.query(
            `INSERT INTO document_signature_links
               (clinic_id, document_id, token, created_by, created_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON DUPLICATE KEY UPDATE
               token = VALUES(token), created_by = VALUES(created_by),
               created_at = VALUES(created_at), expires_at = VALUES(expires_at)`,
            [
              clinicId,
              documentId,
              token,
              actorUserId,
              createdAt,
              signatureLinkExpiresAt(createdAt),
            ],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            renewing
              ? "document.signature_link_renewed"
              : "document.signature_link_created",
            "document",
            documentId,
          );
        }
        const updated = await context.findIssuedDocument(
          client,
          clinicId,
          documentId,
        );
        return {
          document: updated!,
          token,
          ...(document.phone ? { patientPhone: document.phone } : {}),
          clinicName: document.clinicName,
        };
      });
    },

    async getDocumentSignatureLink(
      clinicId: string,
      documentId: string,
    ): Promise<DocumentSignatureLinkDetails | null> {
      const result = await context.pool.query<{
        token: string;
        createdAt: Date;
        expiresAt: Date;
        createdByName: string;
        viewCount: number;
        firstViewedAt: Date | null;
        lastViewedAt: Date | null;
        views: DocumentSignatureLinkView[];
        signedAt: Date | null;
        signature: {
          signerName: string;
          signerCpf?: string;
          ipAddress?: string;
          userAgent?: string;
          documentSha256: string;
        } | null;
        signatureImage: string | null;
      }>(
        `SELECT l.token, l.created_at AS "createdAt", l.expires_at AS "expiresAt", u.full_name AS "createdByName",
                l.view_count AS "viewCount", l.first_viewed_at AS "firstViewedAt",
                l.last_viewed_at AS "lastViewedAt", l.views, l.signed_at AS "signedAt",
                l.signature, l.signature_image AS "signatureImage"
           FROM document_signature_links l JOIN users u ON u.id = l.created_by
          WHERE l.clinic_id = $1 AND l.document_id = $2`,
        [clinicId, documentId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const signature = row.signature;
      return {
        token: row.token,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        createdByName: row.createdByName,
        viewCount: row.viewCount,
        ...(row.firstViewedAt
          ? { firstViewedAt: row.firstViewedAt.toISOString() }
          : {}),
        ...(row.lastViewedAt
          ? { lastViewedAt: row.lastViewedAt.toISOString() }
          : {}),
        views: row.views,
        ...(row.signedAt ? { signedAt: row.signedAt.toISOString() } : {}),
        ...(signature
          ? {
              signerName: signature.signerName,
              ...(signature.signerCpf
                ? { signerCpf: signature.signerCpf }
                : {}),
              ...(signature.ipAddress
                ? { signerIpAddress: signature.ipAddress }
                : {}),
              ...(signature.userAgent
                ? { signerUserAgent: signature.userAgent }
                : {}),
              documentSha256: signature.documentSha256,
            }
          : {}),
        ...(row.signatureImage ? { signatureImage: row.signatureImage } : {}),
      };
    },

    async openPublicSignatureDocument(
      token: string,
      metadata: PublicRequestMetadata,
    ) {
      return context.inTransaction(async (client) => {
        const row = await lockByToken(client, token);
        if (!row) return null;
        assertRowOpen(row);
        const viewedAt = new Date().toISOString();
        const views = appendSignatureView(row.views, metadata, viewedAt);
        await client.query(
          `UPDATE document_signature_links
              SET view_count = view_count + 1,
                  first_viewed_at = COALESCE(first_viewed_at, $2),
                  last_viewed_at = $2,
                  views = $3
            WHERE id = $1`,
          [row.id, viewedAt, JSON.stringify(views)],
        );
        return publicDocument(row);
      });
    },

    async signPublicDocument(
      token: string,
      input: PublicDocumentSignInput,
      metadata: PublicRequestMetadata,
    ) {
      return context.inTransaction(async (client) => {
        const row = await lockByToken(client, token);
        if (!row) return null;
        if (row.signedAt)
          throw new DomainError(
            "DOCUMENT_ALREADY_SIGNED",
            "Este documento já foi assinado.",
            409,
          );
        assertRowOpen(row);
        if (row.documentStatus !== "issued")
          throw new DomainError(
            "DOCUMENT_NOT_AVAILABLE",
            "Este documento não está mais disponível para assinatura.",
            410,
          );
        const signature = {
          ...signerEvidence(input, metadata),
          documentSha256: documentTextSha256(row.snapshotBody),
        };
        const signed = await writeAndRead<{ signedAt: Date }>(
          client,
          `UPDATE document_signature_links
              SET signed_at = NOW(6), signature = $2, signature_image = $3
            WHERE id = $1`,
          [row.id, JSON.stringify(signature), input.signatureImage],
          `SELECT signed_at AS "signedAt" FROM document_signature_links WHERE id = $1`,
        );
        await client.query(
          `UPDATE issued_documents d
             JOIN document_signature_links l ON d.id = l.document_id AND d.clinic_id = l.clinic_id
              SET d.updated_at = NOW(6)
            WHERE l.id = $1`,
          [row.id],
        );
        return publicDocument({
          ...row,
          signedAt: signed.rows[0]!.signedAt,
          signature,
        });
      });
    },
  };
}
