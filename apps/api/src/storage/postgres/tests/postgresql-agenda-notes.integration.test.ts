import { Pool } from "pg";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import {
  noteClinicId,
  verifyAgendaNotesRepository,
} from "../../../test-support/agenda-notes-suite.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("PostgreSQL agenda notes", () => {
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
        "DELETE FROM agenda_notes WHERE clinic_id=$1 AND description IN ('Teste S01','Só a primeira','Próximas')",
        [noteClinicId],
      );
    } finally {
      await pool.end();
    }
  });
  it("preserves series, scope, clinic isolation and transactional history", async () => {
    await verifyAgendaNotesRepository(new PostgresClinicRepository(pool));
  });
});
