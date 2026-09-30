import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createDatabasePool } from "./database.js";
import { PostgresClinicRepository } from "./postgres-repository.js";

/**
 * Entrada da API como função serverless (Vercel). A mesma aplicação Fastify do `server.ts`,
 * mas sem `listen`, sem migrações e sem seed: cada instância só atende requisições. As
 * migrações rodam à parte (`npm run db:setup`), porque a função usa o pooler em modo
 * transação, que não suporta a trava de sessão das migrações.
 */

/** Prefixo público das rotas da API no mesmo domínio do site. */
export const apiPrefix = "/api";

let appPromise: Promise<FastifyInstance> | undefined;

/** Segredo padrão do `config.ts`: público no repositório, nunca aceito num site publicado. */
const defaultJwtSecret = "development-secret-change-before-production";

export function assertServerlessConfig(current: {
  STORAGE_MODE: string;
  JWT_SECRET: string;
}) {
  if (current.STORAGE_MODE !== "postgres") {
    throw new Error("A função serverless exige STORAGE_MODE=postgres (memória não persiste entre instâncias).");
  }
  if (current.JWT_SECRET === defaultJwtSecret) {
    throw new Error("Defina JWT_SECRET (32+ caracteres aleatórios) nas variáveis de ambiente do site publicado.");
  }
}

function getApp() {
  assertServerlessConfig(config);
  appPromise ??= (async () => {
    const pool = createDatabasePool({ max: 3 });
    const app = await buildApp({ repository: new PostgresClinicRepository(pool) });
    app.addHook("onClose", () => pool.end());
    await app.ready();
    return app;
  })().catch((error: unknown) => {
    appPromise = undefined; // permite nova tentativa na próxima requisição
    throw error;
  });
  return appPromise;
}

/** Remove o prefixo `/api` para casar com as rotas registradas no Fastify. */
export function stripApiPrefix(url: string) {
  if (url === apiPrefix) return "/";
  if (url.startsWith(`${apiPrefix}/`) || url.startsWith(`${apiPrefix}?`)) {
    const rest = url.slice(apiPrefix.length);
    return rest.startsWith("?") ? `/${rest}` : rest;
  }
  return url;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  req.url = stripApiPrefix(req.url ?? "/");
  app.server.emit("request", req, res);
}
