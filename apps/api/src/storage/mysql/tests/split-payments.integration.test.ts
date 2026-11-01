import { afterAll, beforeAll, describe } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { splitPaymentSuite } from "../../../test-support/split-payment-suite.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("mysql", () => {
  let database: TestDatabase | undefined;
  let repository: MysqlClinicRepository;
  beforeAll(async () => {
    database = await createTestDatabase("splitpay");
    repository = new MysqlClinicRepository(database.pool);
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  splitPaymentSuite("mysql", () => repository);
});
