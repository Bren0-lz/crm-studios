import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyAutoCampaignRepository } from "../../../test-support/auto-campaigns-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL auto campaigns", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;
  beforeAll(async () => {
    database = await createTestDatabase("autocampaigns");
    pool = database.pool;
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("stores campaigns and one delivery per message and event", async () => {
    await verifyAutoCampaignRepository(new MysqlClinicRepository(pool));
  });
});
