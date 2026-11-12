import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyTrashRepository } from "../../../test-support/trash-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL lixeira", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;
  beforeAll(async () => {
    database = await createTestDatabase("trash");
    pool = database.pool;
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("separa, restaura e exclui de vez com o que está ligado", async () => {
    await verifyTrashRepository(new MysqlClinicRepository(pool));
  });
});
