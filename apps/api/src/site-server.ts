import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { isApiPath, stripApiPrefix } from "./infrastructure/api-prefix.js";
import { defaultJwtSecret } from "./infrastructure/published-config.js";
import { openRepository } from "./infrastructure/startup.js";
import { createWebHandler } from "./infrastructure/web-static.js";

/**
 * Site e API num só processo Node, no mesmo domínio (app Node.js da Hostinger): `/api/*` vai
 * para o Fastify sem o prefixo, como na função da Vercel; o resto é o site de `apps/web/dist`,
 * compilado com `VITE_API_URL=/api` (`npm run hostinger-build`). Na hospedagem roda o bundle
 * `apps/api/dist/site-server.mjs` (`npm start`).
 */

if (config.NODE_ENV === "production") {
  if (config.STORAGE_MODE !== "mysql") {
    throw new Error(
      "Em produção use STORAGE_MODE=mysql: na memória tudo se perde quando o app reinicia.",
    );
  }
  if (config.JWT_SECRET === defaultJwtSecret) {
    throw new Error(
      "Defina JWT_SECRET (32+ caracteres aleatórios) nas variáveis de ambiente do app.",
    );
  }
}

const webDist = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const serveWeb = createWebHandler(webDist);

const { repository, close } = await openRepository();
const app = await buildApp({ repository });
if (close) app.addHook("onClose", close);
await app.ready();

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (isApiPath(url)) {
    req.url = stripApiPrefix(url);
    app.server.emit("request", req, res);
    return;
  }
  void serveWeb(req, res).catch((error: unknown) => {
    app.log.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.listen(config.API_PORT, "0.0.0.0", () => {
  app.log.info(`Site e API em http://0.0.0.0:${config.API_PORT}`);
});

async function shutdown() {
  server.close();
  await app.close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
