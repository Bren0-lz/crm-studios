import { defaultRelationshipSettings } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { clinicId, databaseUrl } from "../../../test-support/mysql-fixtures.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  beforeAll(async () => {
    database = await createTestDatabase("relationship");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  it("returns default relationship settings and upserts changes", async () => {
    await pool.query("DELETE FROM relationship_settings WHERE clinic_id = $1", [
      clinicId,
    ]);
    expect(await repository.getRelationshipSettings(clinicId)).toEqual(
      defaultRelationshipSettings,
    );
    const changed = {
      ...defaultRelationshipSettings,
      birthdayDaysAhead: 3,
      formerClientMinDays: 15,
      formerClientMaxDays: 45,
      messages: {
        ...defaultRelationshipSettings.messages,
        birthday: "Parabéns, {{nome}}!",
      },
    };
    expect(
      await repository.updateRelationshipSettings(clinicId, changed),
    ).toEqual(changed);
    const again = { ...changed, planExpiringDays: 12 };
    await repository.updateRelationshipSettings(clinicId, again);
    expect(
      await new MysqlClinicRepository(pool).getRelationshipSettings(clinicId),
    ).toEqual(again);
    const rows = await pool.query(
      "SELECT COUNT(*) AS total FROM relationship_settings WHERE clinic_id = $1",
      [clinicId],
    );
    expect(rows.rows[0]!.total).toBe(1);
  });
});
