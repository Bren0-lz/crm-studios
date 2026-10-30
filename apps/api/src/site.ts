import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { assertServerlessConfig } from "./infrastructure/serverless-app.js";
import { createSiteServer } from "./infrastructure/site-server.js";
import { createRepositoryFromConfig } from "./infrastructure/startup.js";

/**
 * Entrada do site publicado como app Node.js (Hostinger): um processo com a API em `/api` e o
 * site React. Gerado por `npm run hostinger-build` em `dist-site/bin/server.mjs`; o site compilado
 * fica em `dist-site/public` e as migrações em `dist-site/migrations` (o `database.ts` as
 * procura em `../migrations`, relativo ao arquivo). Mesmas exigências da função da Vercel: MySQL e
 * JWT_SECRET próprio.
 */
assertServerlessConfig(config);

const webDir = fileURLToPath(new URL("../public", import.meta.url));
const { repository, close } = await createRepositoryFromConfig();
const app = await buildApp({ repository });
if (close) app.addHook("onClose", close);
await app.ready();

const server = createSiteServer(app, webDir);
server.on("error", (error) => {
  app.log.error(error);
  process.exit(1);
});
server.listen(config.API_PORT, "0.0.0.0", () => {
  console.log(`Site no ar na porta ${config.API_PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close();
    void app.close().finally(() => process.exit(0));
  });
}
