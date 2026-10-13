// Só aplica as migrações pendentes (sem dados demonstrativos). Usado pelo build da Vercel
// antes de publicar: se uma migração falhar, o build falha e o site anterior continua no ar.
import { config } from "./config.js";
import { createDatabasePool, runMigrations } from "./database.js";
import { migrationDatabaseUrl } from "./infrastructure/database-connection.js";

const pool = createDatabasePool({
  max: 1,
  url: migrationDatabaseUrl(config.DATABASE_URL),
});

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
