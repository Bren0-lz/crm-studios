import type { ApiError, PublicRequestMetadata } from "@crm/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { createRateLimiter } from "../../infrastructure/rate-limit.js";
import { signatureTokenPattern } from "./signature-evidence.js";

/**
 * Proteções comuns das rotas públicas de assinatura (documento e recibo): sem login, o
 * token aleatório identifica o registro.
 */

export const publicSignatureTokenParams = z.object({
  token: z.string().regex(signatureTokenPattern),
});

/** Limites por minuto das rotas públicas de assinatura, por IP e por token. */
export const publicSignatureRateLimits = { GET: 60, POST: 10 } as const;

/** Corpo máximo da assinatura pública (a imagem desenhada vem em base64). */
export const publicSignatureBodyLimit = 1024 * 1024;

export function publicRequestMetadata(
  request: FastifyRequest,
): PublicRequestMetadata {
  const userAgent = request.headers["user-agent"];
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

/**
 * Gancho `onRequest` (antes de ler o corpo): barra quem abre ou tenta assinar em excesso
 * (429 com Retry-After). Cada chamada tem os próprios contadores.
 */
export function createPublicSignatureLimiter() {
  const limiters = {
    GET: createRateLimiter({
      limit: publicSignatureRateLimits.GET,
      windowMs: 60_000,
    }),
    POST: createRateLimiter({
      limit: publicSignatureRateLimits.POST,
      windowMs: 60_000,
    }),
  };
  return async function limitPublicSignature(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const limiter = limiters[request.method === "POST" ? "POST" : "GET"];
    const { token = "" } = request.params as { token?: string };
    for (const key of [`ip:${request.ip}`, `token:${token.slice(0, 64)}`]) {
      const result = limiter.hit(key);
      if (!result.allowed)
        return reply
          .status(429)
          .header("retry-after", String(result.retryAfter))
          .send({
            code: "TOO_MANY_REQUESTS",
            message:
              "Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.",
          } satisfies ApiError);
    }
  };
}
