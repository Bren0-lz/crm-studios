// Roda um comando com TEST_DATABASE_URL apontando para a conexão direta do Supabase (sem pooler).
// Uso: node with-direct-db.cjs <comando> [args...]  — não imprime credenciais e não altera o .env.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const repo = require("path").join(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(repo, ".env"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }));
const url = new URL(env.TEST_DATABASE_URL || env.DATABASE_URL);
const ref = decodeURIComponent(url.username).split(".")[1];
url.username = "postgres"; url.hostname = `db.${ref}.supabase.co`; url.port = "5432"; url.searchParams.delete("sslmode");
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { cwd: process.cwd(), stdio: "inherit", shell: true, env: { ...process.env, TEST_DATABASE_URL: url.toString() } });
process.exit(result.status ?? 1);
