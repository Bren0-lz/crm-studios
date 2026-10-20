import { parseSequenceNumber, patientInputSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const migration = "0085_clinic_sequence_numbers.sql";

// QM15: prontuário e recibo com número sequencial da clínica, sem trecho de UUID.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "postgres: numeração sequencial por clínica",
  () => {
    let adminPool: Pool;
    let pool: Pool;
    let repository: PostgresClinicRepository;
    const schema = `clinicseq_${randomUUID().replaceAll("-", "")}`;
    // Prontuários antigos: "PAC-" + 8 primeiros caracteres do id (um deles só com dígitos).
    const legacy = [
      { id: "12345678-0000-4000-8000-000000000001", createdAt: "2024-01-02" },
      { id: "e2cd5fdf-0000-4000-8000-000000000002", createdAt: "2024-01-01" },
      { id: "abcdef01-0000-4000-8000-000000000003", createdAt: "2024-01-03" },
    ];
    let top = 0;

    beforeAll(async () => {
      const connection = databaseConnectionConfig({
        url: process.env.TEST_DATABASE_URL!,
        ssl: "auto",
      });
      adminPool = new Pool(connection);
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      await adminPool.query(
        `CREATE TABLE ${schema}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
      );
      pool = new Pool({
        ...connection,
        options: `-c search_path=${schema},public`,
      });
      // Banco "antes da 0085", com clientes numerados pelo id.
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        migration,
      ]);
      await runMigrations(pool);
      await seedDemoData(pool);
      const current = await pool.query<{ top: number }>(
        `SELECT coalesce(max(substring(record_number FROM 5)::integer), 0) AS top
         FROM patients WHERE clinic_id = $1 AND record_number ~ '^PAC-[0-9]{5,}$'`,
        [clinicId],
      );
      top = current.rows[0]!.top;
      for (const [index, item] of legacy.entries())
        await pool.query(
          `INSERT INTO patients (id, clinic_id, record_number, full_name, phone, tags, created_at)
           VALUES ($1, $2, $3, $4, $5, '{}', $6::timestamptz)`,
          [
            item.id,
            clinicId,
            `PAC-${item.id.slice(0, 8).toUpperCase()}`,
            `Cliente Antigo ${index}`,
            `1190000000${index}`,
            item.createdAt,
          ],
        );
      await pool.query("DELETE FROM schema_migrations WHERE name = $1", [
        migration,
      ]);
      await runMigrations(pool);
      repository = new PostgresClinicRepository(pool);
    }, 20_000);

    afterAll(async () => {
      try {
        await pool?.end();
        await adminPool?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await adminPool?.end();
      }
    });

    it("renumera os prontuários antigos depois do maior PAC-NNNNN, em ordem de cadastro", async () => {
      const rows = await pool.query<{ id: string; recordNumber: string }>(
        `SELECT id, record_number AS "recordNumber" FROM patients WHERE id = ANY($1::uuid[])`,
        [legacy.map((item) => item.id)],
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row.recordNumber]));
      expect(byId.get(legacy[1]!.id)).toBe(`PAC-${String(top + 1).padStart(5, "0")}`);
      expect(byId.get(legacy[0]!.id)).toBe(`PAC-${String(top + 2).padStart(5, "0")}`);
      expect(byId.get(legacy[2]!.id)).toBe(`PAC-${String(top + 3).padStart(5, "0")}`);
      const leftover = await pool.query(
        "SELECT 1 FROM patients WHERE record_number = 'PAC-' || upper(left(id::text, 8))",
      );
      expect(leftover.rowCount).toBe(0);
    });

    it("numera clientes criados em paralelo sem repetir nem pular", async () => {
      const created = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          repository.createPatient(
            clinicId,
            patientInputSchema.parse({
              fullName: `Cliente Paralelo ${index}`,
              phone: `1198888000${index}`,
            }),
          ),
        ),
      );
      const numbers = created
        .map((item) => parseSequenceNumber("PAC", item.recordNumber))
        .sort((a, b) => a! - b!);
      expect(numbers).toEqual(
        Array.from({ length: 8 }, (_, index) => top + 4 + index),
      );
    });

    it("grava o número do recibo na primeira emissão e repete nas reemissões", async () => {
      const paid = await pool.query<{ id: string }>(
        `SELECT id FROM receivables WHERE clinic_id = $1 AND status = 'paid'
           AND paid_at IS NOT NULL AND payment_method IS NOT NULL
         ORDER BY id LIMIT 2`,
        [clinicId],
      );
      expect(paid.rows).toHaveLength(2);
      const [first, second] = paid.rows.map((row) => row.id);
      const parallel = await Promise.all([
        repository.getPaymentReceipt(clinicId, first!),
        repository.getPaymentReceipt(clinicId, first!),
      ]);
      expect(parallel[0]!.receiptNumber).toBe("REC-00001");
      expect(parallel[1]!.receiptNumber).toBe("REC-00001");
      expect(
        (await repository.getPaymentReceipt(clinicId, second!))!.receiptNumber,
      ).toBe("REC-00002");
      expect(
        (await repository.getPaymentReceipt(clinicId, first!))!.receiptNumber,
      ).toBe("REC-00001");
    });
  },
);
