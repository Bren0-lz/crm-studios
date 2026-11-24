import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  manualAccessFromEnv,
  createManualAccess,
  type ManualAccessConfig,
} from "./access.js";
import { searchManual } from "./search.js";

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
      const server = new McpServer({
        name: "manual-crm-organiza-studios",
        version: "1.0.0",
      });
      server.registerTool(
        "consultar_manual_crm",
        {
          description:
            "Consulta somente o manual do CRM Organiza Studios. Recebe a tarefa e a tela, sem dados pessoais, em até 300 caracteres. Responda em português do Brasil, com passos curtos e os nomes exatos dos botões e campos quando confirmados. Cite as referências e a revisão. Se faltar evidência pertinente, diga isso explicitamente e não invente passos.",
          inputSchema: { consulta: z.string().max(300).trim().min(1) },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async ({ consulta }) => {
          const result = searchManual(consulta);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
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
