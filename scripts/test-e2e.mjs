import { spawnSync } from "node:child_process";

const env = { ...process.env, VITE_API_URL: "/api", NODE_ENV: "production" };
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Execute este script com npm run test:e2e.");
const build = spawnSync(process.execPath, [npm, "run", "build"], {
  env,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
