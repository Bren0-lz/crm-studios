import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createDatabasePool, runMigrations, seedDemoData } from "./database.js";
import { MemoryClinicRepository } from "./memory-repository.js";
import { PostgresClinicRepository } from "./postgres-repository.js";
import type { ClinicRepository } from "./repository.js";

let repository: ClinicRepository;
let closeDatabase: (() => Promise<void>) | undefined;

if (config.STORAGE_MODE === "postgres") {
  const pool = createDatabasePool();
  await runMigrations(pool);
  if (config.SEED_DEMO_DATA) await seedDemoData(pool);
  repository = new PostgresClinicRepository(pool);
  closeDatabase = () => pool.end();
} else {
  repository = new MemoryClinicRepository();
}

const app = await buildApp({ repository });
if (closeDatabase) app.addHook("onClose", closeDatabase);

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
