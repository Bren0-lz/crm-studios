import {
  DEFAULT_PATIENT_TAG_COLOR,
  type Patient,
  type PatientTag,
  patientProfile,
  patientTagKey,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { present } from "./administration.js";

export interface PatientRow {
  inactiveAt?: Date | null;
  mergedIntoPatientId?: string | null;
  profile?: ReturnType<typeof patientProfile>;
  id: string;
  clinicId: string;
  recordNumber: string;
  fullName: string;
  cpf: string | null;
  email: string | null;
  phone: string;
  whatsapp: string | null;
  birthDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  tags: string[];
  status: Patient["status"];
  createdAt: Date;
  updatedAt: Date;
}

export const patientColumns = `
  id,
  clinic_id AS "clinicId",
  record_number AS "recordNumber",
  full_name AS "fullName",
  cpf,
  email,
  phone,
  whatsapp,
  birth_date::text AS "birthDate",
  emergency_contact_name AS "emergencyContactName",
  emergency_contact_phone AS "emergencyContactPhone",
  notes,
  tags,
  profile,
  inactive_at AS "inactiveAt",
  merged_into_patient_id AS "mergedIntoPatientId",
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export function mapPatient(row: PatientRow): Patient {
  return {
    ...patientProfile(row.profile ?? {}),
    ...(row.inactiveAt ? { inactiveAt: row.inactiveAt.toISOString() } : {}),
    ...(row.mergedIntoPatientId
      ? { mergedIntoPatientId: row.mergedIntoPatientId }
      : {}),
    id: row.id,
    clinicId: row.clinicId,
    recordNumber: row.recordNumber,
    fullName: row.fullName,
    phone: row.phone,
    tags: row.tags,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cpf: present(row.cpf),
    email: present(row.email),
    whatsapp: present(row.whatsapp),
    birthDate: present(row.birthDate),
    emergencyContactName: present(row.emergencyContactName),
    emergencyContactPhone: present(row.emergencyContactPhone),
    notes: present(row.notes),
  };
}

export interface PatientTagRow {
  id: string;
  clinicId: string;
  name: string;
  color: string;
  patientCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Colunas de `patient_tags pt` com a contagem de clientes que usam a etiqueta. */
export const patientTagColumns = `pt.id, pt.clinic_id AS "clinicId", pt.name, pt.color,
  (SELECT count(*)::int FROM patients p
    WHERE p.clinic_id = pt.clinic_id AND pt.name = ANY(p.tags)) AS "patientCount",
  pt.created_at AS "createdAt", pt.updated_at AS "updatedAt"`;

export function mapPatientTag(row: PatientTagRow): PatientTag {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Garante a etiqueta configurada com a cor padrão (ex.: "Convertido do CRM", dados demo). */
export async function ensurePatientTags(
  client: Pool | PoolClient,
  clinicId: string,
  names: readonly string[],
) {
  for (const name of names) {
    const key = patientTagKey(name);
    if (!key) continue;
    await client.query(
      `INSERT INTO patient_tags (clinic_id, name, name_key, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clinic_id, name_key) DO NOTHING`,
      [clinicId, name.trim(), key, DEFAULT_PATIENT_TAG_COLOR],
    );
  }
}
