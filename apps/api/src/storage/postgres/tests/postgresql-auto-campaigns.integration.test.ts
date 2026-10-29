import { Pool } from "pg";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  autoCampaignClinicId,
  autoCampaignPatientName,
  verifyAutoCampaignRepository,
} from "../../../test-support/auto-campaigns-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL auto campaigns", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool(databaseConnectionConfig({ url: databaseUrl! }));
    await runMigrations(pool);
    await seedDemoData(pool);
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      const ours =
        "SELECT id FROM auto_campaigns WHERE clinic_id=$1 AND (name LIKE 'Aniversário%' OR name LIKE 'Promoção%')";
      await pool.query(
        `DELETE FROM auto_campaign_redemptions WHERE clinic_id=$1 AND campaign_id IN (${ours})`,
        [autoCampaignClinicId],
      );
      await pool.query(
        "DELETE FROM appointments WHERE clinic_id=$1 AND patient_id IN (SELECT id FROM patients WHERE clinic_id=$1 AND full_name=$2)",
        [autoCampaignClinicId, autoCampaignPatientName],
      );
      await pool.query(
        `DELETE FROM auto_campaign_deliveries WHERE clinic_id=$1 AND campaign_id IN (${ours})`,
        [autoCampaignClinicId],
      );
      await pool.query(`DELETE FROM auto_campaigns WHERE id IN (${ours})`, [
        autoCampaignClinicId,
      ]);
      await pool.query(
        "DELETE FROM patients WHERE clinic_id=$1 AND full_name=$2",
        [autoCampaignClinicId, autoCampaignPatientName],
      );
    } finally {
      await pool.end();
    }
  });
  it("stores campaigns and one delivery per message and event", async () => {
    await verifyAutoCampaignRepository(new PostgresClinicRepository(pool));
  });
});
