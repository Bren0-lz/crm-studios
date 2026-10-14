import {
  type PatientMergeInput,
  type Patient,
  patientProfile,
  saoPauloToday,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import {
  mergePreview,
  validateMerge,
  inactivityCutoff,
} from "../../modules/patients/management.js";
import type { PostgresRepositoryContext } from "./context.js";
import { mapPatient, patientColumns, type PatientRow } from "./helpers.js";

export function createPatientManagementRepository(
  context: PostgresRepositoryContext,
) {
  async function candidates(
    clinicId: string,
    months: number,
    client: Pool | PoolClient = context.pool,
  ) {
    const today = saoPauloToday(),
      cutoff = inactivityCutoff(today, months);
    const result = await client.query<PatientRow>(
      `SELECT ${patientColumns} FROM patients WHERE clinic_id=$1 AND status='active' AND merged_into_patient_id IS NULL AND created_at::date<=$2::date
      AND NOT EXISTS(SELECT 1 FROM patient_plans p WHERE p.clinic_id=$1 AND p.patient_id=patients.id AND p.status='active' AND p.valid_from<=$3::date AND (p.valid_until IS NULL OR p.valid_until>=$3::date))
      AND NOT EXISTS(SELECT 1 FROM appointments a JOIN clinics c ON c.id=a.clinic_id WHERE a.clinic_id=$1 AND a.patient_id=patients.id AND a.status<>'cancelled' AND (a.starts_at AT TIME ZONE c.timezone)::date>=$2::date)
      AND NOT EXISTS(SELECT 1 FROM group_enrollments e JOIN group_sessions s ON s.group_id=e.group_id AND s.clinic_id=e.clinic_id WHERE e.clinic_id=$1 AND e.patient_id=patients.id AND e.status='active' AND s.status='scheduled' AND s.starts_at>=$3::date)
      AND NOT EXISTS(SELECT 1 FROM group_attendance a JOIN group_sessions s ON s.id=a.session_id AND s.clinic_id=a.clinic_id JOIN clinics c ON c.id=a.clinic_id WHERE a.clinic_id=$1 AND a.patient_id=patients.id AND (s.starts_at AT TIME ZONE c.timezone)::date>=$2::date) ORDER BY full_name`,
      [clinicId, cutoff, today],
    );
    return result.rows.map(mapPatient);
  }
  async function preview(
    clinicId: string,
    sourceId: string,
    targetId: string,
    client: PoolClient,
  ) {
    const patients = await client.query<PatientRow>(
      `SELECT ${patientColumns} FROM patients WHERE clinic_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
      [clinicId, [sourceId, targetId]],
    );
    const collisions = await client.query<{ kind: string }>(
      `SELECT 'enrollment' AS kind FROM group_enrollments a JOIN group_enrollments b ON b.clinic_id=a.clinic_id AND b.group_id=a.group_id WHERE a.clinic_id=$1 AND a.patient_id=$2 AND b.patient_id=$3 AND a.status<>'cancelled' AND b.status<>'cancelled'
      UNION ALL SELECT 'attendance' AS kind FROM group_attendance a JOIN group_attendance b ON b.clinic_id=a.clinic_id AND b.session_id=a.session_id WHERE a.clinic_id=$1 AND a.patient_id=$2 AND b.patient_id=$3`,
      [clinicId, sourceId, targetId],
    );
    return mergePreview(
      patients.rows.find((item) => item.id === sourceId) &&
        mapPatient(patients.rows.find((item) => item.id === sourceId)!),
      patients.rows.find((item) => item.id === targetId) &&
        mapPatient(patients.rows.find((item) => item.id === targetId)!),
      [
        ...new Set(
          collisions.rows.map((item) =>
            item.kind === "enrollment"
              ? "Os dois clientes têm matrícula na mesma turma. Cancele a matrícula duplicada."
              : "Existem frequências dos dois clientes no mesmo encontro. Revise os registros antes de mesclar.",
          ),
        ),
      ],
    );
  }
  return {
    async getPatient(clinicId: string, patientId: string) {
      const result = await context.pool.query<PatientRow>(
        `SELECT ${patientColumns} FROM patients WHERE clinic_id=$1 AND id=(SELECT coalesce(merged_into_patient_id,id) FROM patients WHERE clinic_id=$1 AND id=$2)`,
        [clinicId, patientId],
      );
      return result.rows[0] ? mapPatient(result.rows[0]) : null;
    },
    async setPatientStatus(
      clinicId: string,
      actorUserId: string,
      patientId: string,
      status: Patient["status"],
    ) {
      return context.inTransaction(async (client) => {
        const result = await client.query<PatientRow>(
          `UPDATE patients SET status=$3,inactive_at=CASE WHEN $3='inactive' THEN coalesce(inactive_at,now()) ELSE NULL END,updated_at=now() WHERE clinic_id=$1 AND id=$2 AND merged_into_patient_id IS NULL RETURNING ${patientColumns}`,
          [clinicId, patientId, status],
        );
        if (!result.rows[0]) return null;
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "patient.status",
          "patient",
          patientId,
          { status },
        );
        return mapPatient(result.rows[0]);
      });
    },
    async previewInactivePatients(clinicId: string, months: number) {
      return candidates(clinicId, months);
    },
    async inactivatePatients(
      clinicId: string,
      actorUserId: string,
      months: number,
      patientIds: string[],
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT id FROM patients WHERE clinic_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
          [clinicId, patientIds],
        );
        const eligible = await candidates(clinicId, months, client);
        const ids = eligible
          .filter((item) => patientIds.includes(item.id))
          .map((item) => item.id);
        await client.query(
          "UPDATE patients SET status='inactive',inactive_at=now(),updated_at=now() WHERE clinic_id=$1 AND id=ANY($2::uuid[])",
          [clinicId, ids],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "patients.inactivated",
          "patient",
          undefined,
          { months, changed: ids.length },
        );
        return { changed: ids.length, skipped: patientIds.length - ids.length };
      });
    },
    async previewPatientMerge(
      clinicId: string,
      sourceId: string,
      targetId: string,
    ) {
      return context.inTransaction((client) =>
        preview(clinicId, sourceId, targetId, client),
      );
    },
    async mergePatients(
      clinicId: string,
      actorUserId: string,
      input: PatientMergeInput,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        const data = await preview(
            clinicId,
            input.sourceId,
            input.targetId,
            client,
          ),
          merged = validateMerge(data, input);
        await client.query(
          "UPDATE patients SET cpf=NULL,status='inactive',inactive_at=now(),merged_into_patient_id=$3,updated_at=now() WHERE clinic_id=$1 AND id=$2",
          [clinicId, input.sourceId, input.targetId],
        );
        const result = await client.query<PatientRow>(
          `UPDATE patients SET full_name=$3,cpf=$4,email=$5,phone=$6,whatsapp=$7,birth_date=$8,emergency_contact_name=$9,emergency_contact_phone=$10,notes=$11,tags=$12,profile=$13::jsonb,updated_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING ${patientColumns}`,
          [
            clinicId,
            input.targetId,
            merged.fullName,
            merged.cpf || null,
            merged.email || null,
            merged.phone,
            merged.whatsapp || null,
            merged.birthDate || null,
            merged.emergencyContactName || null,
            merged.emergencyContactPhone || null,
            merged.notes || null,
            merged.tags,
            JSON.stringify(patientProfile(merged)),
          ],
        );
        await client.query(
          "UPDATE communication_preferences a SET allowed=a.allowed AND b.allowed FROM communication_preferences b WHERE a.clinic_id=$1 AND b.clinic_id=$1 AND a.patient_id=$3 AND b.patient_id=$2 AND a.channel=b.channel",
          [clinicId, input.sourceId, input.targetId],
        );
        await client.query(
          "DELETE FROM communication_preferences a USING communication_preferences b WHERE a.clinic_id=$1 AND b.clinic_id=$1 AND a.patient_id=$2 AND b.patient_id=$3 AND a.channel=b.channel",
          [clinicId, input.sourceId, input.targetId],
        );
        const tables = await client.query<{ tableName: string }>(
          `SELECT DISTINCT k.table_name AS "tableName" FROM information_schema.key_column_usage k JOIN information_schema.constraint_column_usage c ON c.constraint_name=k.constraint_name AND c.constraint_schema=k.constraint_schema WHERE k.table_schema=current_schema() AND k.column_name='patient_id' AND c.table_name='patients' AND EXISTS(SELECT 1 FROM information_schema.columns p WHERE p.table_schema=k.table_schema AND p.table_name=k.table_name AND p.column_name='clinic_id')`,
        );
        await client.query(
          "UPDATE patients SET merged_into_patient_id=$3 WHERE clinic_id=$1 AND merged_into_patient_id=$2",
          [clinicId, input.sourceId, input.targetId],
        );
        for (const { tableName } of tables.rows.filter(
          (item) =>
            !/^(clinical_|therapeutic_|treatment_)/.test(item.tableName),
        )) {
          const quoted = '"' + tableName.replaceAll('"', '""') + '"';
          await client.query(
            `UPDATE ${quoted} SET patient_id=$3 WHERE clinic_id=$1 AND patient_id=$2`,
            [clinicId, input.sourceId, input.targetId],
          );
        }
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "patients.merged",
          "patient",
          input.targetId,
          {
            sourceId: input.sourceId,
            targetId: input.targetId,
            sourceSnapshot: data.source,
          },
        );
        return mapPatient(result.rows[0]!);
      });
    },
  };
}
