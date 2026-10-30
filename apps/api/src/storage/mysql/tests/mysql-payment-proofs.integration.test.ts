import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyPaymentProofsRepository } from "../../../test-support/payment-proofs-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL payment proofs", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;
  beforeAll(async () => {
    database = await createTestDatabase("paymentproofs");
    pool = database.pool;
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("anexa comprovantes só a baixas e isola clínicas", async () => {
    await verifyPaymentProofsRepository(new MysqlClinicRepository(pool));
  });
});
