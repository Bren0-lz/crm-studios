import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: chaves de integração`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("intkeys");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("creates, finds by hash, records use and revokes", async () => {
        const tokenHash = `${storage}`.padEnd(64, "a");
        const key = await repository.createIntegrationKey(
          clinicId,
          userId,
          { name: "Dashboard", scopes: ["sales:read"] },
          { prefix: "crm_1234abcd", tokenHash },
        );
        expect(key).toMatchObject({
          name: "Dashboard",
          prefix: "crm_1234abcd",
          scopes: ["sales:read"],
          createdByUserId: userId,
          createdByName: expect.any(String),
        });
        expect(key.createdByName).not.toBe("");
        expect(key).not.toHaveProperty("tokenHash");
        expect(await repository.findIntegrationKeyByTokenHash(tokenHash)).toEqual(
          { clinicId, key },
        );
        await repository.touchIntegrationKey(clinicId, key.id);
        const [listed] = await repository.listIntegrationKeys(clinicId);
        expect(listed?.lastUsedAt).toEqual(expect.any(String));
        const revoked = await repository.revokeIntegrationKey(clinicId, key.id);
        expect(revoked?.revokedAt).toEqual(expect.any(String));
        expect(
          await repository.findIntegrationKeyByTokenHash(tokenHash),
        ).toBeNull();
        expect(
          await repository.revokeIntegrationKey(
            "33333333-3333-4333-8333-333333333333",
            key.id,
          ),
        ).toBeNull();
      });
    },
  );
}
