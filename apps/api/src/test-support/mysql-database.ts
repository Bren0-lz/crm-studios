import { randomUUID } from "node:crypto";
import {
  createDatabasePool,
  runMigrations,
  seedDemoData,
} from "../database.js";
import type { Database } from "../infrastructure/mysql-client.js";

export interface TestDatabase {
  pool: Database;
  drop(): Promise<void>;
}

/**
 * Cria um banco isolado (`<banco de TEST_DATABASE_URL>_<prefixo>_<aleatório>`), aplica as
 * migrações e, por padrão, os dados demo. O usuário do teste precisa de permissão para criar
 * bancos com esse prefixo. `drop()` fecha o pool e apaga o banco.
 */
export async function createTestDatabase(
  prefix: string,
  { seed = true }: { seed?: boolean } = {},
): Promise<TestDatabase> {
  const baseUrl = new URL(process.env.TEST_DATABASE_URL!);
  const name = `${baseUrl.pathname.slice(1)}_${prefix}_${randomUUID().slice(0, 8)}`;
  const admin = createDatabasePool({ max: 1, url: baseUrl.toString() });
  await admin.query(
    `CREATE DATABASE "${name}" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = createDatabasePool({ url: url.toString() });
  try {
    await runMigrations(pool);
    if (seed) await seedDemoData(pool);
  } catch (error) {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
    throw error;
  }
  return {
    pool,
    async drop() {
      try {
        await pool.end();
        await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      } finally {
        await admin.end();
      }
    },
  };
}
