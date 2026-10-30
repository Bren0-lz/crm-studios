// Build para um app Node.js da Hostinger (hPanel → Websites → Node.js).
// Gera dist-site/ com:
//   bin/server.mjs  API Fastify + servidor do site num arquivo só (apps/api/src/site.ts)
//   public/         site React (Vite) compilado com VITE_API_URL=/api
//   migrations/     cópia de apps/api/migrations (o servidor procura em ../migrations)
// No painel: comando de build `npm run hostinger-build`, arquivo de entrada `dist-site/bin/server.mjs`
// (ou comando de início `npm start`). As migrações rodam na inicialização do servidor.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist-site");

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

console.log("› Compilando o site com VITE_API_URL=/api");
execSync("npm run build -w @crm/web", {
  cwd: root,
  stdio: "inherit",
  // NODE_ENV fixo: com outro valor o Vite gera o React de desenvolvimento.
  env: { ...process.env, NODE_ENV: "production", VITE_API_URL: "/api" },
});
cpSync(join(root, "apps", "web", "dist"), join(output, "public"), {
  recursive: true,
});

cpSync(join(root, "apps", "api", "migrations"), join(output, "migrations"), {
  recursive: true,
});

console.log("› Empacotando a API e o servidor do site");
await build({
  entryPoints: [join(root, "apps", "api", "src", "site.ts")],
  outfile: join(output, "bin", "server.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Dependências CommonJS (fastify, mysql2…) chamam require(); no bundle ESM ele precisa existir.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "warning",
});
writeFileSync(
  join(output, "bin", "package.json"),
  JSON.stringify({ type: "module", private: true }),
);

console.log("✓ dist-site pronto");
