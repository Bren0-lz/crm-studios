import { afterAll, beforeAll, describe, it } from "vitest";
import type { Database } from "../../../infrastructure/mysql-client.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { runBranchScenario } from "../../../test-support/branch-scenario.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("mysql: filiais", () => {
  let database: TestDatabase | undefined;
  let pool: Database;

  beforeAll(async () => {
    database = await createTestDatabase("branches");
    pool = database.pool;
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  it("separa cadastros, agenda, estoque, comercial e financeiro por filial", async () => {
    await runBranchScenario(new MysqlClinicRepository(pool));
  });
});
