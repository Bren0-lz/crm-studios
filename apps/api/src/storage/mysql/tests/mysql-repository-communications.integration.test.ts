import { nextTestCpf } from "../../../test-support/cpf.js";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { clinicId, databaseUrl } from "../../../test-support/mysql-fixtures.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  beforeAll(async () => {
    database = await createTestDatabase("communicatio");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  it("queues a broadcast as manual outbox messages in one transaction", async () => {
    const broadcastPhone = "11977770391";
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM outbound_messages WHERE patient_id IN
         (SELECT id FROM patients WHERE clinic_id = $1 AND phone = $2)`,
        [clinicId, broadcastPhone],
      );
      await pool.query(
        "DELETE FROM patients WHERE clinic_id = $1 AND phone = $2",
        [clinicId, broadcastPhone],
      );
    };
    await cleanup();
    try {
      const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "Cliente Comunicado PG",
        phone: broadcastPhone,
        email: "comunicado.pg@example.com",
        tags: [],
      });
      expect(await repository.queueBroadcastMessages(clinicId, [])).toBe(0);
      expect(
        await repository.queueBroadcastMessages(clinicId, [
          {
            patientId: patient.id,
            channel: "email",
            recipient: "comunicado.pg@example.com",
            body: "Oi, Cliente!",
          },
        ]),
      ).toBe(1);
      // Destinatário de outra clínica (ou inexistente) desfaz o lote inteiro.
      await expect(
        repository.queueBroadcastMessages(clinicId, [
          {
            patientId: patient.id,
            channel: "whatsapp",
            recipient: broadcastPhone,
            body: "Oi",
          },
          {
            patientId: "12121212-1212-4121-8121-121212121212",
            channel: "whatsapp",
            recipient: "11900000000",
            body: "Oi",
          },
        ]),
      ).rejects.toMatchObject({ code: "PATIENT_NOT_FOUND" });
      const rows = await pool.query<{
        kind: string;
        channel: string;
        recipient: string;
        body: string;
        status: string;
        idempotency_key: string;
      }>(
        `SELECT kind, channel, recipient, body, status, idempotency_key
         FROM outbound_messages WHERE clinic_id = $1 AND patient_id = $2`,
        [clinicId, patient.id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        kind: "manual",
        channel: "email",
        recipient: "comunicado.pg@example.com",
        body: "Oi, Cliente!",
        status: "queued",
      });
      expect(rows.rows[0]!.idempotency_key).toMatch(/^broadcast:/);
    } finally {
      await cleanup();
    }
  });
});
