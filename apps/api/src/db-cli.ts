import { config } from "./config.js";
import { createDatabasePool, runMigrations, seedDemoData } from "./database.js";

const pool = createDatabasePool();

try {
  await runMigrations(pool);
  if (config.SEED_DEMO_DATA) await seedDemoData(pool);
  process.stdout.write(
    `Banco atualizado${config.SEED_DEMO_DATA ? " e dados demonstrativos carregados" : ""}.\n`,
  );
} finally {
  await pool.end();
}
