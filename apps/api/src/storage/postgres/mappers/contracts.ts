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

export interface IssuedDocumentRow {
  manualSignature?: IssuedDocument["manualSignature"] | null;
  id: string;
  clinicId: string;
  templateId: string;
  patientId: string;
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

export const issuedDocumentColumns = `
  d.id, d.clinic_id AS "clinicId", d.template_id AS "templateId",
  d.patient_id AS "patientId", d.plan_id AS "planId",
  d.professional_id AS "professionalId", d.title,
  d.template_name AS "templateName", d.template_version AS "templateVersion",
  p.full_name AS "patientName", pp.name AS "planName",
  d.manual_signature AS "manualSignature",d.snapshot_body AS "snapshotBody", d.snapshot_content AS "snapshotContent", d.branding, d.status,
  d.issued_at AS "issuedAt", d.cancelled_at AS "cancelledAt",
  d.created_at AS "createdAt", d.updated_at AS "updatedAt"
`;

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
    patientId: row.patientId,
    ...(row.planId ? { planId: row.planId } : {}),
    ...(row.professionalId ? { professionalId: row.professionalId } : {}),
    title: row.title,
    templateName: row.templateName,
    templateVersion: row.templateVersion,
    patientName: row.patientName,
    ...(row.planName ? { planName: row.planName } : {}),
    ...(row.manualSignature ? { manualSignature: row.manualSignature } : {}),
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
