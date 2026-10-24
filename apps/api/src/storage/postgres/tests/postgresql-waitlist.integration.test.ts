import { Pool } from "pg";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  verifyWaitlistRepository,
  waitlistClinicId,
} from "../../../test-support/waitlist-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL waitlist", () => {
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
        "DELETE FROM waitlist_entries w USING patients p WHERE w.patient_id=p.id AND w.clinic_id=$1 AND p.full_name IN ('Ana Espera','Bruno Espera')",
        [waitlistClinicId],
      );
    } finally {
      await pool.end();
    }
  });
  it("keeps queues per item, refuses duplicates and isolates clinics", async () => {
    await verifyWaitlistRepository(new PostgresClinicRepository(pool));
  });
});
