import type { Pool, PoolClient } from "pg";

export type ClinicSequenceName = "patient_record" | "receipt";

// Menor valor aceito: o maior número já gravado. Cobre linhas inseridas sem passar pelo
// contador (seed demo) e o primeiro uso da clínica.
const floors: Record<ClinicSequenceName, string> = {
  patient_record: `SELECT COALESCE(MAX(substring(record_number FROM 5)::integer), 0)
    FROM patients WHERE clinic_id = $1 AND record_number ~ '^PAC-[0-9]{5,}$'`,
  receipt: `SELECT COALESCE(MAX(receipt_number), 0) FROM receivables WHERE clinic_id = $1`,
};

/**
 * Próximo número sequencial da clínica (QM15). A linha de `clinic_sequences` fica travada
 * até o fim da transação de quem chamou, então chamadas concorrentes saem em fila e nunca
 * repetem número.
 */
export async function nextClinicSequence(
  client: Pool | PoolClient,
  clinicId: string,
  name: ClinicSequenceName,
) {
  const result = await client.query<{ value: number }>(
    `INSERT INTO clinic_sequences (clinic_id, name, last_value)
     VALUES ($1, $2, (${floors[name]}) + 1)
     ON CONFLICT (clinic_id, name) DO UPDATE
       SET last_value = GREATEST(clinic_sequences.last_value + 1, EXCLUDED.last_value)
     RETURNING last_value AS value`,
    [clinicId, name],
  );
  return result.rows[0]!.value;
}
