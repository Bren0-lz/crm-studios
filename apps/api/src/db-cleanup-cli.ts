// `npm run db:cleanup-test-data`: apaga os dados de teste e deixa só o estúdio, a filial padrão
// e um administrador (ver db-cleanup.ts). Simulação por padrão; conecta em DATABASE_URL, como
// `db:setup`/`db:migrate`.
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createDatabasePool } from "./database.js";
import {
  cleanupDatabase,
  CleanupError,
  cleanupUsage,
  formatCleanupReport,
  parseCleanupArgs,
} from "./db-cleanup.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${cleanupUsage}\n`);
  process.exit(0);
}

let exitCode = 0;
const pool = createDatabasePool({ max: 1, url: config.DATABASE_URL });
try {
  const options = parseCleanupArgs(args, process.env);
  const report = await cleanupDatabase(pool, options, {
    defaultBackupDir: fileURLToPath(
      new URL("../../../backups", import.meta.url),
    ),
    // O npm roda o script dentro de apps/api; --backup-dir relativo vale de onde foi chamado.
    baseDir: process.env.INIT_CWD ?? process.cwd(),
  });
  process.stdout.write(formatCleanupReport(report, options));
  if (config.SEED_DEMO_DATA)
    process.stdout.write(
      "\nAVISO: SEED_DEMO_DATA não está como false neste ambiente. Na Hostinger, deixe SEED_DEMO_DATA=false: com true, a API recria o estúdio e os dados demonstrativos (e o usuário demo) ao iniciar.\n",
    );
} catch (error) {
  exitCode = 1;
  process.stderr.write(
    error instanceof CleanupError
      ? `Erro: ${error.message}\n`
      : `Erro inesperado: ${error instanceof Error ? error.message : String(error)}\n`,
  );
} finally {
  await pool.end();
}
process.exit(exitCode);
