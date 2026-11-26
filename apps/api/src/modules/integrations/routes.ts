import {
  type IntegrationKeyCreated,
  integrationKeyInputSchema,
  type McpConnectorStatus,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";
import { manualAccessFromEnv, manualEndpoint } from "../manual/access.js";
import { generateIntegrationToken } from "./tokens.js";

/** Chaves da API externa (Configurações → Integrações): só admin. */
export function registerIntegrationRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  app.get("/integration-keys", { preHandler: authenticate }, async (request) =>
    repository.listIntegrationKeys(request.user.clinicId),
  );

  // O token completo só aparece nesta resposta; depois, só o prefixo.
  app.post(
    "/integration-keys",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = integrationKeyInputSchema.parse(request.body);
      const { token, prefix, tokenHash } = generateIntegrationToken();
      const key = await repository.createIntegrationKey(
        request.user.clinicId,
        request.user.sub,
        input,
        { prefix, tokenHash },
      );
      return reply
        .status(201)
        .send({ key, token } satisfies IntegrationKeyCreated);
    },
  );

  app.post(
    "/integration-keys/:id/revoke",
    { preHandler: authenticate },
    async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const key = await repository.revokeIntegrationKey(
        request.user.clinicId,
        id,
      );
      if (!key)
        throw new DomainError(
          "INTEGRATION_KEY_NOT_FOUND",
          "Chave de integração não encontrada.",
          404,
        );
      return key;
    },
  );

  // Conector MCP do manual (INT5): só o estado e o endereço; o token fica na hospedagem.
  const manual = manualAccessFromEnv();
  const mcpStatus: McpConnectorStatus = manual
    ? { enabled: true, endpoint: manualEndpoint(manual) }
    : { enabled: false, endpoint: null };
  app.get(
    "/integrations/mcp",
    { preHandler: authenticate },
    async () => mcpStatus,
  );
}
