import { z } from "zod";
import {
  documentSignatureInputSchema,
  documentDraftInputSchema,
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentTransitionSchema,
  issuedDocumentInputSchema,
  publicDocumentSignInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import {
  createPublicSignatureLimiter,
  publicRequestMetadata as requestMetadata,
  publicSignatureBodyLimit,
  publicSignatureTokenParams as tokenParams,
} from "../signatures/public-signature-guard.js";

const signatureLinkNotFound = {
  code: "DOCUMENT_SIGNATURE_LINK_NOT_FOUND",
  message: "Link de assinatura não encontrado.",
};

export function registerContractsRoutes(context: RouteContext) {
  const { app, authenticate, repository, assertPermissions } = context;
  /** Rotas sem login (antes de ler o corpo): barra quem abre ou tenta assinar em excesso (429 com Retry-After). */
  const limitPublicSignature = createPublicSignatureLimiter();

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
  app.post(
    "/documents/:id/signature-link",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.createDocumentSignatureLink(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      )) ??
      reply.status(404).send({
        code: "DOCUMENT_NOT_FOUND",
        message: "Documento não encontrado.",
      }),
  );
  app.get(
    "/documents/:id/signature-link",
    { preHandler: authenticate },
    async (request, reply) =>
      (await repository.getDocumentSignatureLink(
        request.user.clinicId,
        z.object({ id: z.uuid() }).parse(request.params).id,
      )) ?? reply.status(404).send(signatureLinkNotFound),
  );
  // Link público enviado ao cliente: sem login, o token aleatório identifica o documento.
  app.get(
    "/public/document-signatures/:token",
    { onRequest: limitPublicSignature },
    async (request, reply) => {
      const params = tokenParams.safeParse(request.params);
      const document =
        params.success &&
        (await repository.openPublicSignatureDocument(
          params.data.token,
          requestMetadata(request),
        ));
      return document || reply.status(404).send(signatureLinkNotFound);
    },
  );
  app.post(
    "/public/document-signatures/:token",
    { bodyLimit: publicSignatureBodyLimit, onRequest: limitPublicSignature },
    async (request, reply) => {
      const params = tokenParams.safeParse(request.params);
      if (!params.success) return reply.status(404).send(signatureLinkNotFound);
      const document = await repository.signPublicDocument(
        params.data.token,
        publicDocumentSignInputSchema.parse(request.body),
        requestMetadata(request),
      );
      return document ?? reply.status(404).send(signatureLinkNotFound);
    },
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
            request.user.sub,
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
        { actorId: request.user.sub },
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
    "/document-templates/:id/restore",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const template =
        z.uuid().safeParse(id).success &&
        (await repository.restoreDocumentTemplateVersion(
          request.user.clinicId,
          id,
          request.user.sub,
        ));
      if (!template)
        return reply.status(404).send({
          code: "DOCUMENT_TEMPLATE_NOT_FOUND",
          message: "Modelo não encontrado.",
        });
      return reply.status(201).send(template);
    },
  );

  app.delete(
    "/document-templates/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted =
        z.uuid().safeParse(id).success &&
        (await repository.deleteDocumentTemplate(request.user.clinicId, id));
      if (!deleted)
        return reply.status(404).send({
          code: "DOCUMENT_TEMPLATE_NOT_FOUND",
          message: "Modelo não encontrado.",
        });
      return reply.status(204).send();
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
