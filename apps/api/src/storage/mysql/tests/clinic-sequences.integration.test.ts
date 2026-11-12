import { nextTestCpf } from "../../../test-support/cpf.js";
import { parseSequenceNumber, patientInputSchema } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

// QM15: prontuário e recibo com número sequencial da clínica, sem trecho de UUID.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mysql: numeração sequencial por clínica",
  () => {
    let database: TestDatabase | undefined;
    let pool: Pool;
    let repository: MysqlClinicRepository;
    let top = 0;

    beforeAll(async () => {
      database = await createTestDatabase("sequences");
      pool = database.pool;
      const current = await pool.query<{ top: number }>(
        `SELECT CAST(COALESCE(MAX(CAST(SUBSTRING(record_number, 5) AS UNSIGNED)), 0) AS SIGNED) AS top
         FROM patients WHERE clinic_id = $1 AND record_number REGEXP '^PAC-[0-9]{5,}$'`,
        [clinicId],
      );
      top = current.rows[0]!.top;
      repository = new MysqlClinicRepository(pool);
    }, 60_000);

    afterAll(async () => {
      await database?.drop();
    });

    it("numera clientes criados em paralelo sem repetir nem pular", async () => {
      const created = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          repository.createPatient(
            clinicId,
            patientInputSchema.parse({
              cpf: nextTestCpf(),
              fullName: `Cliente Paralelo ${index}`,
              phone: `1198888000${index}`,
              whatsapp: `1198888000${index}`,
              emergencyContactName: `Cliente Paralelo ${index}`,
              emergencyContactPhone: `1198888000${index}`,
              emergencyContactWhatsapp: `1198888000${index}`,
            }),
          ),
        ),
      );
      const numbers = created
        .map((item) => parseSequenceNumber("PAC", item.recordNumber))
        .sort((a, b) => a! - b!);
      expect(numbers).toEqual(
        Array.from({ length: 8 }, (_, index) => top + 1 + index),
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
