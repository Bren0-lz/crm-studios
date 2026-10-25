import type {
  ClinicBranding,
  DocumentContent,
  DocumentSignatureLinkDetails,
  DocumentSignatureLinkView,
  DocumentStatus,
  PublicDocumentSignInput,
  PublicRequestMetadata,
  PublicSignatureDocument,
} from "@crm/contracts";
import type { PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import {
  createSignatureToken,
  documentTextSha256,
  maxStoredSignatureViews,
  signatureLinkView,
} from "../../modules/contracts/signature-links.js";
import type { PostgresRepositoryContext } from "./context.js";

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
  signedAt: Date | null;
  signature: { signerName: string; documentSha256: string } | null;
}

/** Documento pelo token, travado para registrar visualização ou assinatura. */
async function lockByToken(client: PoolClient, token: string) {
  const result = await client.query<PublicLinkRow>(
    `SELECT l.id, d.title, p.full_name AS "patientName",
            COALESCE(NULLIF(d.branding->>'name', ''), c.name) AS "clinicName",
            d.snapshot_body AS "snapshotBody", d.snapshot_content AS "snapshotContent",
            d.branding, d.status AS "documentStatus", l.views,
            l.signed_at AS "signedAt", l.signature
       FROM document_signature_links l
       JOIN issued_documents d ON d.id = l.document_id AND d.clinic_id = l.clinic_id
       JOIN patients p ON p.id = d.patient_id AND p.clinic_id = d.clinic_id
       JOIN clinics c ON c.id = l.clinic_id
      WHERE l.token = $1
      FOR UPDATE OF l`,
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
  context: PostgresRepositoryContext,
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
          `SELECT d.status, p.phone,
                  COALESCE(NULLIF(d.branding->>'name', ''), c.name) AS "clinicName"
             FROM issued_documents d
             JOIN patients p ON p.id = d.patient_id AND p.clinic_id = d.clinic_id
             JOIN clinics c ON c.id = d.clinic_id
            WHERE d.clinic_id = $1 AND d.id = $2
            FOR UPDATE OF d`,
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
        const existing = await client.query<{ token: string }>(
          "SELECT token FROM document_signature_links WHERE clinic_id=$1 AND document_id=$2",
          [clinicId, documentId],
        );
        let token = existing.rows[0]?.token;
        if (!token) {
          token = createSignatureToken();
          await client.query(
            `INSERT INTO document_signature_links (clinic_id, document_id, token, created_by)
             VALUES ($1, $2, $3, $4)`,
            [clinicId, documentId, token, actorUserId],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "document.signature_link_created",
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
        `SELECT l.token, l.created_at AS "createdAt", u.full_name AS "createdByName",
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
        const viewedAt = new Date().toISOString();
        const views = [
          ...row.views,
          signatureLinkView(metadata, viewedAt),
        ].slice(-maxStoredSignatureViews);
        await client.query(
          `UPDATE document_signature_links
              SET view_count = view_count + 1,
                  first_viewed_at = COALESCE(first_viewed_at, $2::timestamptz),
                  last_viewed_at = $2::timestamptz,
                  views = $3::jsonb
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
        if (row.documentStatus !== "issued")
          throw new DomainError(
            "DOCUMENT_NOT_AVAILABLE",
            "Este documento não está mais disponível para assinatura.",
            410,
          );
        const signature = {
          signerName: input.signerName,
          ...(input.signerCpf ? { signerCpf: input.signerCpf } : {}),
          ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
          ...(metadata.userAgent
            ? { userAgent: metadata.userAgent.slice(0, 300) }
            : {}),
          documentSha256: documentTextSha256(row.snapshotBody),
        };
        const signed = await client.query<{ signedAt: Date }>(
          `UPDATE document_signature_links
              SET signed_at = now(), signature = $2::jsonb, signature_image = $3
            WHERE id = $1
        RETURNING signed_at AS "signedAt"`,
          [row.id, JSON.stringify(signature), input.signatureImage],
        );
        await client.query(
          `UPDATE issued_documents d SET updated_at = now()
             FROM document_signature_links l
            WHERE l.id = $1 AND d.id = l.document_id AND d.clinic_id = l.clinic_id`,
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
