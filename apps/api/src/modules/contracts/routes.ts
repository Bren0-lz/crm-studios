import { z } from "zod";
import {
  documentSignatureInputSchema,
  documentDraftInputSchema,
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentTransitionSchema,
  issuedDocumentInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerContractsRoutes(context: RouteContext) {
  const { app, authenticate, repository, assertPermissions } = context;

  app.post(
    "/documents/:id/signature",
    { preHandler: authenticate, bodyLimit: 8 * 1024 * 1024 },
    async (request) =>
      repository.recordDocumentSignature(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
        documentSignatureInputSchema.parse(request.body),
      ),
  );
  app.get(
    "/documents/:id/signature/content",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.getDocumentSignatureContent(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "DOCUMENT_SIGNATURE_NOT_FOUND",
        message: "Cópia assinada não encontrada.",
      }),
  );
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
        input.content,
      );
      if (!template)
        return reply.status(404).send({
          code: "DOCUMENT_TEMPLATE_NOT_FOUND",
          message: "Modelo não encontrado.",
        });
      return reply.status(201).send(template);
    },
  );

  app.post(
    "/documents/preview",
    { preHandler: authenticate },
    async (request) =>
      repository.previewDocument(
        request.user.clinicId,
        issuedDocumentInputSchema.parse(request.body),
      ),
  );
  app.patch(
    "/documents/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const document = await repository.updateDocumentDraft(
        request.user.clinicId,
        z.object({ id: z.uuid() }).parse(request.params).id,
        documentDraftInputSchema.parse(request.body),
      );
      return (
        document ??
        reply.status(404).send({
          code: "DOCUMENT_NOT_FOUND",
          message: "Documento não encontrado.",
        })
      );
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
