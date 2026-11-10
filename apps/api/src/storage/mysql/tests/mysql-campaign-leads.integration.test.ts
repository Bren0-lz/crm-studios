import { afterAll, beforeAll, describe, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { verifyCampaignLeadRepository } from "../../../test-support/campaign-leads-suite.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("MySQL leads nas campanhas", () => {
  let database: TestDatabase | undefined;
  beforeAll(async () => {
    database = await createTestDatabase("campaignleads");
  }, 60_000);
  afterAll(async () => {
    await database?.drop();
  });
  it("grava destinatário e envio de lead e passa ao cliente na conversão", async () => {
    await verifyCampaignLeadRepository(
      new MysqlClinicRepository(database!.pool),
    );
  });
});
