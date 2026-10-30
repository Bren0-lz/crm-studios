import { config } from "../config.js";
import {
  createDatabasePool,
  runMigrations,
  seedDemoData,
} from "../database.js";
import { MemoryClinicRepository } from "../memory-repository.js";
import { MysqlClinicRepository } from "../mysql-repository.js";
import type { ClinicRepository } from "../repository.js";

/**
 * Repositório dos servidores de processo longo (`server.ts` e `site-server.ts`): no MySQL,
 * aplica as migrações pendentes e o seed demo (se `SEED_DEMO_DATA=true`) antes de atender.
 */
export async function openRepository(): Promise<{
  repository: ClinicRepository;
  close?: () => Promise<void>;
}> {
  if (config.STORAGE_MODE !== "mysql") {
    return { repository: new MemoryClinicRepository(config.SEED_DEMO_DATA) };
  }
  const pool = createDatabasePool();
  await runMigrations(pool);
  if (config.SEED_DEMO_DATA) await seedDemoData(pool);
  return {
    repository: new MysqlClinicRepository(pool),
    close: () => pool.end(),
  };
}
