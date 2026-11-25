import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  manualAccessFromEnv,
  createManualAccess,
  type ManualAccessConfig,
} from "./access.js";
import { manualInstructions } from "./instructions.js";
import { crmOverview, overviewModules } from "./overview.js";
import { listGuides, manualAreas, readGuides, searchGuides } from "./search.js";

/** Não recebe repository: a única fonte é o material de ajuda empacotado. */
export function registerManualRoutes(
  app: FastifyInstance,
  config: ManualAccessConfig | undefined = manualAccessFromEnv(),
) {
  if (!config) {
    app.route({
      method: ["GET", "POST", "DELETE"],
      url: "/mcp",
      logLevel: "silent",
      onRequest: async (_request, reply) =>
        reply.code(503).send({ code: "MCP_UNAVAILABLE" }),
      handler: async () => undefined,
    });
    return;
  }
  const access = createManualAccess(config);
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    logLevel: "silent",
    bodyLimit: 16_384,
    errorHandler: (error, _request, reply) => {
      const status =
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode < 500
          ? error.statusCode
          : 500;
      return reply.code(status).send({
        code: status === 413 ? "MCP_BODY_TOO_LARGE" : "MCP_REQUEST_ERROR",
      });
    },
    onRequest: async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (
        request.headers.origin &&
        request.headers.origin !== config.MCP_PUBLIC_ORIGIN
      )
        return reply.code(403).send({ code: "ORIGIN_DENIED" });
      if (!access.authenticate(request.headers.authorization))
        return reply
          .code(401)
          .header(
            "www-authenticate",
            'Bearer realm="manual-crm-organiza-studios"',
          )
          .send({ code: "MCP_UNAUTHORIZED" });
      if (!access.allow())
        return reply
          .code(429)
          .header("retry-after", "60")
          .send({ code: "RATE_LIMITED" });
    },
    handler: async (request, reply) => {
      // Sem sessão e sem notificações do servidor: GET e DELETE não abrem streams.
      if (request.method !== "POST")
        return reply.code(405).header("allow", "POST").send();
      const server = new McpServer(
        { name: "manual-crm-organiza-studios", version: "2.0.0" },
        { instructions: manualInstructions },
      );
      const readOnly = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };
      const json = (result: Record<string, unknown>) => ({
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      });
      server.registerTool(
        "buscar_guias",
        {
          description:
            "Procura nos guias do CRM Organiza Studios os mais próximos de uma tarefa. Envie palavras-chave ou a tarefa resumida (até 300 caracteres, sem dados pessoais), ou o id de um guia. Devolve até 8 guias com título, área, aderência e perguntas de exemplo; não devolve os passos. Leia os pertinentes com ler_guias. Repita com outras palavras se vier pouco.",
          inputSchema: { consulta: z.string().max(300).trim().min(1) },
          annotations: readOnly,
        },
        async ({ consulta }) => json(searchGuides(consulta)),
      );
      server.registerTool(
        "ler_guias",
        {
          description:
            "Lê o texto completo de até 10 guias pelo id (ex.: AG07, CL13), com os passos, condições e referências ao código conferido. Use os guias como base para montar a resposta adaptada à pergunta.",
          inputSchema: {
            ids: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
          },
          annotations: readOnly,
        },
        async ({ ids }) => json(readGuides(ids)),
      );
      server.registerTool(
        "listar_guias",
        {
          description:
            "Índice do manual por área. Sem área, devolve as áreas e quantos guias cada uma tem; com a área, devolve id, título e perguntas de exemplo de cada guia. Use para descobrir o que o manual cobre.",
          inputSchema: { area: z.enum(manualAreas).optional() },
          annotations: readOnly,
        },
        async ({ area }) => json(listGuides(area)),
      );
      server.registerTool(
        "visao_geral_crm",
        {
          description:
            "Mapa do CRM gerado do próprio código: grupos do menu, telas e endereços, o que cada módulo faz, conceitos gerais e, com o módulo, as operações (permissões) que existem nele. Use para situar a pergunta e explicar onde fica cada coisa; os passos estão nos guias.",
          inputSchema: { modulo: z.enum(overviewModules).optional() },
          annotations: readOnly,
        },
        async ({ modulo }) => json(crmOverview(modulo)),
      );
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        const response = await transport.handleRequest(
          new Request(access.resource, { method: "POST", headers }),
          { parsedBody: request.body },
        );
        response.headers.forEach((value, name) => reply.header(name, value));
        return reply.code(response.status).send(await response.text());
      } finally {
        await server.close();
      }
    },
  });
}
