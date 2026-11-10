import type { ClinicRepository } from "../../../repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { payrollSuite } from "../../../test-support/payroll-suite.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("mysql: folha de pagamento", () => {
  let database: TestDatabase | undefined;
  let repository: ClinicRepository;
  beforeAll(async () => {
    database = await createTestDatabase("payroll");
    repository = new MysqlClinicRepository(database.pool);
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  payrollSuite(() => repository);
});
