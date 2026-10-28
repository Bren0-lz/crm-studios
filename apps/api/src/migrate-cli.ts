// Só aplica as migrações pendentes (sem dados demonstrativos). Usado no deploy antes de
// publicar: se uma migração falhar, o comando sai com erro e a versão anterior continua no ar.
import { config } from "./config.js";
import { createDatabasePool, runMigrations } from "./database.js";

const pool = createDatabasePool({ max: 1, url: config.DATABASE_URL });

try {
  const applied = await runMigrations(pool);
  process.stdout.write(
    applied.length > 0
      ? `Migrações aplicadas: ${applied.join(", ")}.\n`
      : "Banco já está com todas as migrações.\n",
  );
} finally {
  await pool.end();
}
