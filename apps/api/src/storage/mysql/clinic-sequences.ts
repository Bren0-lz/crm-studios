import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";

export type ClinicSequenceName = "patient_record" | "receipt";

// Menor valor aceito: o maior número já gravado. Cobre linhas inseridas sem passar pelo
// contador (seed demo) e o primeiro uso da clínica.
const floors: Record<ClinicSequenceName, string> = {
  patient_record: `SELECT COALESCE(MAX(CAST(SUBSTRING(record_number, 5) AS UNSIGNED)), 0)
    FROM patients WHERE clinic_id = $1 AND record_number REGEXP '^PAC-[0-9]{5,}$'`,
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
): Promise<number> {
  // LAST_INSERT_ID(valor) guarda o número na própria conexão: as duas consultas precisam
  // rodar na mesma conexão (fora de transação, abre uma só para isso).
  if (!("lock" in client)) {
    const connection = await client.connect();
    try {
      return await nextClinicSequence(connection, clinicId, name);
    } finally {
      connection.release();
    }
  }
  await client.query(
    `INSERT INTO clinic_sequences (clinic_id, name, "last_value")
     VALUES ($1, $2, LAST_INSERT_ID((${floors[name]}) + 1))
     ON DUPLICATE KEY UPDATE
       "last_value" = LAST_INSERT_ID(GREATEST("last_value" + 1, VALUES("last_value")))`,
    [clinicId, name],
  );
  const result = await client.query<{ value: number }>(
    "SELECT LAST_INSERT_ID() AS value",
  );
  return Number(result.rows[0]!.value);
}
