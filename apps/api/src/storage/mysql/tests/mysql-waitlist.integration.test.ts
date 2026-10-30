import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyWaitlistRepository } from "../../../test-support/waitlist-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL waitlist", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;
  beforeAll(async () => {
    database = await createTestDatabase("waitlist");
    pool = database.pool;
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("keeps queues per item, refuses duplicates and isolates clinics", async () => {
    await verifyWaitlistRepository(new MysqlClinicRepository(pool));
  });
});
