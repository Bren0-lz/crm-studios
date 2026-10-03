// Build para a Vercel usando a Build Output API v3 (https://vercel.com/docs/build-output-api/v3).
// Em produção, aplica antes as migrações pendentes (npm run db:migrate).
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

// Migrações antes de tudo, só no deploy de produção (previews não tocam o banco do site).
// Se uma falhar, o comando sai com erro, o build para e a versão anterior continua no ar:
// o código novo nunca é publicado sem as colunas de que precisa.
if (process.env.VERCEL_ENV === "production" && process.env.STORAGE_MODE === "postgres") {
  console.log("› Aplicando migrações pendentes no banco");
  execSync("npm run db:migrate", { cwd: root, stdio: "inherit" });
} else {
  console.log("› Migrações puladas (não é deploy de produção com STORAGE_MODE=postgres)");
}

console.log("› Compilando o site com VITE_API_URL=/api");
execSync("npm run build -w @crm/web", {
  cwd: root,
  stdio: "inherit",
  // NODE_ENV fixo: se o ambiente de build trouxer outro valor (ex.: development), o Vite
  // gera o React de desenvolvimento, mais pesado e com nomes de arquivo e linhas embutidos.
  env: { ...process.env, NODE_ENV: "production", VITE_API_URL: "/api" },
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
      // Mesma região do banco (Supabase em sa-east-1): cada consulta evita ir e voltar dos EUA.
      regions: ["gru1"],
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
