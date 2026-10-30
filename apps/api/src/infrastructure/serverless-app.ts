import type { FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { createDatabasePool } from "../database.js";
import { MysqlClinicRepository } from "../mysql-repository.js";
import { stripApiPrefix } from "./api-prefix.js";
import { defaultJwtSecret } from "./published-config.js";

export { apiPrefix, stripApiPrefix } from "./api-prefix.js";

/**
 * Entrada da API como função serverless (Vercel). A mesma aplicação Fastify do `server.ts`,
 * mas sem `listen`, sem migrações e sem seed: cada instância só atende requisições. As
 * migrações rodam à parte (`npm run db:migrate`, no build).
 */

let appPromise: Promise<FastifyInstance> | undefined;

export function assertServerlessConfig(current: {
  STORAGE_MODE: string;
  JWT_SECRET: string;
}) {
  if (current.STORAGE_MODE !== "mysql") {
    throw new Error(
      "A função serverless exige STORAGE_MODE=mysql (memória não persiste entre instâncias).",
    );
  }
  if (current.JWT_SECRET === defaultJwtSecret) {
    throw new Error(
      "Defina JWT_SECRET (32+ caracteres aleatórios) nas variáveis de ambiente do site publicado.",
    );
  }
}

function getApp() {
  assertServerlessConfig(config);
  appPromise ??= (async () => {
    // Uma conexão por instância, devolvida logo depois de ociosa: são muitas instâncias
    // curtas dividindo o limite de conexões do banco.
    const pool = createDatabasePool({ max: 1, idleTimeoutMillis: 5_000 });
    // Falha cedo e com motivo claro se a DATABASE_URL estiver errada ou o banco inacessível.
    try {
      await pool.query("SELECT 1");
    } catch (error) {
      await pool.end().catch(() => undefined);
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `não foi possível conectar ao banco (${reason}). Confira a DATABASE_URL.`,
        {
          cause: error,
        },
      );
    }
    const app = await buildApp({
      repository: new MysqlClinicRepository(pool),
    });
    app.addHook("onClose", () => pool.end());
    await app.ready();
    return app;
  })().catch((error: unknown) => {
    appPromise = undefined; // permite nova tentativa na próxima requisição
    throw error;
  });
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getApp();
  req.url = stripApiPrefix(req.url ?? "/");
  app.server.emit("request", req, res);
}
