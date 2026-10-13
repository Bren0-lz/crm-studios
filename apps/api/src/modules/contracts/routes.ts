import {
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentTransitionSchema,
  issuedDocumentInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerContractsRoutes(context: RouteContext) {
  const { app, authenticate, repository, assertPermissions } = context;

  app.get(
    "/document-templates",
    { preHandler: authenticate },
    async (request) => repository.listDocumentTemplates(request.user.clinicId),
  );

  app.post(
    "/document-templates",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createDocumentTemplate(
            request.user.clinicId,
            documentTemplateInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/document-templates/:id/versions",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = documentTemplateVersionInputSchema.parse(request.body);
      const template = await repository.createDocumentTemplateVersion(
        request.user.clinicId,
        id,
        input.body,
      );
      if (!template)
        return reply.status(404).send({
          code: "DOCUMENT_TEMPLATE_NOT_FOUND",
          message: "Modelo não encontrado.",
        });
      return reply.status(201).send(template);
    },
  );

  app.get("/documents", { preHandler: authenticate }, async (request) =>
    repository.listIssuedDocuments(request.user.clinicId),
  );

  app.post("/documents", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createIssuedDocument(
          request.user.clinicId,
          request.user.sub,
          issuedDocumentInputSchema.parse(request.body),
        ),
      ),
  );

  app.patch(
    "/documents/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = documentTransitionSchema.parse(
        (request.body as { status?: unknown }).status,
      );

      assertPermissions(
        request,
        status === "cancelled" ? "contracts.cancel" : "contracts.status",
      );
      const document = await repository.updateIssuedDocumentStatus(
        request.user.clinicId,
        id,
        status,
      );
      if (!document)
        return reply.status(404).send({
          code: "DOCUMENT_NOT_FOUND",
          message: "Documento não encontrado.",
        });
      return document;
    },
  );
}
