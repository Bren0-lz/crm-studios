import type { DocumentContent, ClinicBranding } from "@crm/contracts";
import type {
  DocumentStatus,
  DocumentTemplate,
  IssuedDocument,
} from "@crm/contracts";

export interface DocumentTemplateRow {
  id: string;
  clinicId: string;
  name: string;
  kind: DocumentTemplate["kind"];
  version: number;
  body: string;
  content: DocumentContent | null;
  active: boolean;
  previousVersionId: string | null;
  createdAt: Date;
}

/** Resumo do link vindo do `jsonb_build_object`: datas em texto e campos nulos. */
export interface SignatureLinkRow {
  token: string;
  createdAt: string;
  expiresAt: string;
  createdByName: string;
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  signedAt: string | null;
  signerName: string | null;
}

export interface IssuedDocumentRow {
  manualSignature?: IssuedDocument["manualSignature"] | null;
  signatureLink?: SignatureLinkRow | null;
  id: string;
  clinicId: string;
  templateId: string;
  patientId: string | null;
  supplierId: string | null;
  planId: string | null;
  professionalId: string | null;
  title: string;
  templateName: string;
  templateVersion: number;
  patientName: string;
  planName: string | null;
  snapshotBody: string;
  snapshotContent: DocumentContent | null;
  branding: ClinicBranding | null;
  status: DocumentStatus;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const documentTemplateColumns = `
  id, clinic_id AS "clinicId", name, kind, version, body, content, active,
  previous_version_id AS "previousVersionId", created_at AS "createdAt"
`;

/** Junções que `issuedDocumentColumns` pede (`d` = issued_documents): quem assina é cliente ou fornecedor. */
export const issuedDocumentJoins = `
  LEFT JOIN patients p ON p.id = d.patient_id AND p.clinic_id = d.clinic_id
  LEFT JOIN suppliers s ON s.id = d.supplier_id AND s.clinic_id = d.clinic_id
  LEFT JOIN patient_plans pp ON pp.id = d.plan_id AND pp.clinic_id = d.clinic_id
`;

export const issuedDocumentColumns = `
  d.id, d.clinic_id AS "clinicId", d.template_id AS "templateId",
  d.patient_id AS "patientId", d.supplier_id AS "supplierId", d.plan_id AS "planId",
  d.professional_id AS "professionalId", d.title,
  d.template_name AS "templateName", d.template_version AS "templateVersion",
  COALESCE(p.full_name, s.name) AS "patientName", pp.name AS "planName",
  d.manual_signature AS "manualSignature",d.snapshot_body AS "snapshotBody", d.snapshot_content AS "snapshotContent", d.branding, d.status,
  d.issued_at AS "issuedAt", d.cancelled_at AS "cancelledAt",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt",
  (SELECT jsonb_build_object(
      'token', l.token, 'createdAt', l.created_at, 'expiresAt', l.expires_at,
      'createdByName', u.full_name,
      'viewCount', l.view_count, 'firstViewedAt', l.first_viewed_at,
      'lastViewedAt', l.last_viewed_at, 'signedAt', l.signed_at,
      'signerName', l.signature->>'signerName')
    FROM document_signature_links l JOIN users u ON u.id = l.created_by
    WHERE l.clinic_id = d.clinic_id AND l.document_id = d.id) AS "signatureLink"
`;

const isoDate = (value: string) => new Date(value).toISOString();

export function mapSignatureLink(
  row: SignatureLinkRow,
): NonNullable<IssuedDocument["signatureLink"]> {
  return {
    token: row.token,
    createdAt: isoDate(row.createdAt),
    expiresAt: isoDate(row.expiresAt),
    createdByName: row.createdByName,
    viewCount: row.viewCount,
    ...(row.firstViewedAt ? { firstViewedAt: isoDate(row.firstViewedAt) } : {}),
    ...(row.lastViewedAt ? { lastViewedAt: isoDate(row.lastViewedAt) } : {}),
    ...(row.signedAt ? { signedAt: isoDate(row.signedAt) } : {}),
    ...(row.signerName ? { signerName: row.signerName } : {}),
  };
}

export function mapDocumentTemplate(
  row: DocumentTemplateRow,
): DocumentTemplate {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    kind: row.kind,
    version: row.version,
    body: row.body,
    ...(row.content ? { content: row.content } : {}),
    active: row.active,
    ...(row.previousVersionId
      ? { previousVersionId: row.previousVersionId }
      : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapIssuedDocument(row: IssuedDocumentRow): IssuedDocument {
  return {
    id: row.id,
    clinicId: row.clinicId,
    templateId: row.templateId,
    ...(row.patientId ? { patientId: row.patientId } : {}),
    ...(row.supplierId ? { supplierId: row.supplierId } : {}),
    ...(row.planId ? { planId: row.planId } : {}),
    ...(row.professionalId ? { professionalId: row.professionalId } : {}),
    title: row.title,
    templateName: row.templateName,
    templateVersion: row.templateVersion,
    patientName: row.patientName,
    ...(row.planName ? { planName: row.planName } : {}),
    ...(row.manualSignature ? { manualSignature: row.manualSignature } : {}),
    ...(row.signatureLink
      ? { signatureLink: mapSignatureLink(row.signatureLink) }
      : {}),
    snapshotBody: row.snapshotBody,
    ...(row.snapshotContent ? { snapshotContent: row.snapshotContent } : {}),
    ...(row.branding ? { branding: row.branding } : {}),
    status: row.status,
    ...(row.issuedAt ? { issuedAt: row.issuedAt.toISOString() } : {}),
    ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
