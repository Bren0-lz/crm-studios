import { z } from "zod";
import {
  documentSignatureInputSchema,
  documentDraftInputSchema,
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentTransitionSchema,
  issuedDocumentInputSchema,
  publicDocumentSignInputSchema,
  type PublicRequestMetadata,
} from "@crm/contracts";
import type { FastifyRequest } from "fastify";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { signatureTokenPattern } from "./signature-links.js";

const tokenParams = z.object({
  token: z.string().regex(signatureTokenPattern),
});
const signatureLinkNotFound = {
  code: "DOCUMENT_SIGNATURE_LINK_NOT_FOUND",
  message: "Link de assinatura não encontrado.",
};

function requestMetadata(request: FastifyRequest): PublicRequestMetadata {
  const userAgent = request.headers["user-agent"];
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

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
  app.get("/public/document-signatures/:token", async (request, reply) => {
    const params = tokenParams.safeParse(request.params);
    const document =
      params.success &&
      (await repository.openPublicSignatureDocument(
        params.data.token,
        requestMetadata(request),
      ));
    return document || reply.status(404).send(signatureLinkNotFound);
  });
  app.post(
    "/public/document-signatures/:token",
    { bodyLimit: 1024 * 1024 },
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
