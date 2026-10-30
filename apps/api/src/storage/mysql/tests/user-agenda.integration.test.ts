import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { userAgendaSuite } from "../../../test-support/user-agenda-suite.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mysql: cadastro unificado",
  () => {
    let pool: Pool;
    let database: TestDatabase | undefined;
    let repository: MysqlClinicRepository;
    beforeAll(async () => {
      database = await createTestDatabase("useragenda");
      pool = database.pool;
      repository = new MysqlClinicRepository(pool);
    }, 60_000);
    afterAll(async () => {
      await database?.drop();
    });
    userAgendaSuite(() => repository);
  },
);
