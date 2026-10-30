// Build para o app Node.js da Hostinger: site e API num só processo, no mesmo domínio.
// Gera:
//   apps/web/dist/                 site React (Vite) compilado com VITE_API_URL=/api
//   apps/api/dist/site-server.mjs  a API + servidor do site num arquivo só (esbuild), porque o
//                                  @crm/contracts aponta para os .ts do src e o Node puro não os lê
// No hPanel: comando de build `npm run hostinger-build`, início `npm start`.
// As migrações rodam quando o app sobe (STORAGE_MODE=mysql), não no build.
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("› Compilando o site com VITE_API_URL=/api");
execSync("npm run build -w @crm/web", {
  cwd: root,
  stdio: "inherit",
  // NODE_ENV fixo: com outro valor o Vite gera o React de desenvolvimento.
  env: { ...process.env, NODE_ENV: "production", VITE_API_URL: "/api" },
});

console.log("› Empacotando a API e o servidor do site");
await build({
  entryPoints: [join(root, "apps", "api", "src", "site-server.ts")],
  // Na mesma pasta do tsc (apps/api/dist): os caminhos relativos ao import.meta.url
  // (../migrations, ../../web/dist, ../../../.env) continuam valendo.
  outfile: join(root, "apps", "api", "dist", "site-server.mjs"),
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

console.log("✓ Pronto: npm start sobe o site e a API");
