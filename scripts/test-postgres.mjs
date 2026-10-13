import { spawnSync } from "node:child_process";

if (process.env.CI && !process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL é obrigatória no job PostgreSQL do CI.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "../../node_modules/vitest/vitest.mjs",
    "run",
    "src/storage/postgres/tests",
    "plan-services.integration.test.ts",
    "repository-parity.integration.test.ts",
    "--no-file-parallelism",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
