// Build para a Vercel usando a Build Output API v3 (https://vercel.com/docs/build-output-api/v3).
// Gera .vercel/output com:
//   static/                 site React (Vite) compilado com VITE_API_URL=/api
//   functions/api.func/     a API Fastify empacotada numa função Node (apps/api/src/serverless.ts)
//   config.json             rotas: /api/* → função; demais rotas → index.html (SPA)
// No painel da Vercel: Framework Preset "Other", Build Command `npm run vercel-build`.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".vercel", "output");
const functionDir = join(output, "functions", "api.func");
const nodeRuntime = "nodejs22.x";

rmSync(output, { recursive: true, force: true });
mkdirSync(functionDir, { recursive: true });

console.log("› Compilando o site com VITE_API_URL=/api");
execSync("npm run build -w @crm/web", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_API_URL: "/api" },
});
cpSync(join(root, "apps", "web", "dist"), join(output, "static"), { recursive: true });

console.log("› Empacotando a API como função");
await build({
  entryPoints: [join(root, "apps", "api", "src", "serverless.ts")],
  outfile: join(functionDir, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Dependências CommonJS (fastify, pg…) chamam require(); no bundle ESM ele precisa existir.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // pg-native é opcional no pg e não é usado.
  external: ["pg-native"],
  logLevel: "warning",
});
writeFileSync(join(functionDir, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(
  join(functionDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: nodeRuntime,
      handler: "index.mjs",
      launcherType: "Nodejs",
      // Entrega o corpo cru ao Fastify, sem os helpers da Vercel que consomem a requisição.
      shouldAddHelpers: false,
      maxDuration: 30,
    },
    null,
    2,
  ),
);

writeFileSync(
  join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api(?:/.*)?$", dest: "/api" },
        { handle: "filesystem" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("✓ .vercel/output pronto");
