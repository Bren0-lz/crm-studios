import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { commissionBaseSuite } from "../../../test-support/commission-base-suite.js";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: base da comissão`,
    () => {
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("commissionbase");
        pool = database.pool;
      }, 60_000);

      afterAll(async () => {
        await database?.drop();
      });

      commissionBaseSuite(() =>
        storage === "memory"
          ? new MemoryClinicRepository()
          : new MysqlClinicRepository(pool!),
      );
    },
  );
}
