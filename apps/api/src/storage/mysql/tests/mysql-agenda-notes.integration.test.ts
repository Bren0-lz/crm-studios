import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyAgendaNotesRepository } from "../../../test-support/agenda-notes-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL agenda notes", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;
  beforeAll(async () => {
    database = await createTestDatabase("agendanotes");
    pool = database.pool;
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("preserves series, scope, clinic isolation and transactional history", async () => {
    await verifyAgendaNotesRepository(new MysqlClinicRepository(pool));
  });
});
