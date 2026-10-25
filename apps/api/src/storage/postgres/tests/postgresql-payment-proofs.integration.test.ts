import { Pool } from "pg";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  paymentProofsClinicId,
  verifyPaymentProofsRepository,
} from "../../../test-support/payment-proofs-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL payment proofs", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool(databaseConnectionConfig({ url: databaseUrl! }));
    await runMigrations(pool);
    await seedDemoData(pool);
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query(
        "DELETE FROM payment_proofs WHERE clinic_id=$1 AND file_name IN ('pix.pdf','recibo.pdf')",
        [paymentProofsClinicId],
      );
    } finally {
      await pool.end();
    }
  });
  it("anexa comprovantes só a baixas e isola clínicas", async () => {
    await verifyPaymentProofsRepository(new PostgresClinicRepository(pool));
  });
});
