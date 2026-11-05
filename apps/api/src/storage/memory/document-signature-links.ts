import {
  signatureLinkExpired,
  signatureLinkExpiresAt,
  type DocumentSignatureLink,
  type DocumentSignatureLinkDetails,
  type IssuedDocument,
  type PublicDocumentSignInput,
  type PublicRequestMetadata,
  type PublicSignatureDocument,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import {
  assertSignatureLinkOpen,
  documentTextSha256,
} from "../../modules/contracts/signature-links.js";
import {
  appendSignatureView,
  createSignatureToken,
} from "../../modules/signatures/signature-evidence.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now } from "./helpers.js";

interface StoredLink extends DocumentSignatureLinkDetails {
  clinicId: string;
  documentId: string;
}

function summary(link: StoredLink): DocumentSignatureLink {
  return {
    token: link.token,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    createdByName: link.createdByName,
    viewCount: link.viewCount,
    ...(link.firstViewedAt ? { firstViewedAt: link.firstViewedAt } : {}),
    ...(link.lastViewedAt ? { lastViewedAt: link.lastViewedAt } : {}),
    ...(link.signedAt ? { signedAt: link.signedAt } : {}),
    ...(link.signerName ? { signerName: link.signerName } : {}),
  };
}

export function createDocumentSignatureLinksRepository(
  context: MemoryRepositoryContext,
) {
  const links = new Map<string, StoredLink>();
  const byToken = (token: string) =>
    [...links.values()].find((link) => link.token === token);
  function sync(document: IssuedDocument, link: StoredLink) {
    document.signatureLink = summary(link);
  }
  function publicDocument(
    document: IssuedDocument,
    link: StoredLink,
  ): PublicSignatureDocument {
    return structuredClone({
      title: document.title,
      patientName: document.patientName,
      clinicName: document.branding?.name || context.clinicSettings.name,
      snapshotBody: document.snapshotBody,
      ...(document.snapshotContent
        ? { snapshotContent: document.snapshotContent }
        : {}),
      ...(document.branding ? { branding: document.branding } : {}),
      status: link.signedAt
        ? "signed"
        : document.status === "cancelled"
          ? "cancelled"
          : "pending",
      documentSha256:
        link.documentSha256 ?? documentTextSha256(document.snapshotBody),
      ...(link.signedAt ? { signedAt: link.signedAt } : {}),
      ...(link.signerName ? { signerName: link.signerName } : {}),
    });
  }
  function findDocument(link: StoredLink) {
    return context.issuedDocuments.find(
      (item) => item.clinicId === link.clinicId && item.id === link.documentId,
    );
  }
  return {
    async createDocumentSignatureLink(
      clinicId: string,
      actorUserId: string,
      documentId: string,
    ) {
      const document = context.issuedDocuments.find(
        (item) => item.clinicId === clinicId && item.id === documentId,
      );
      if (!document) return null;
      if (document.status !== "issued")
        throw new DomainError(
          "DOCUMENT_NOT_ISSUED",
          "Emita o documento antes de enviar o link de assinatura.",
          409,
        );
      let link = links.get(documentId);
      // Link vencido sem assinatura: troca o token (o antigo deixa de abrir) e renova o prazo.
      const renewing = Boolean(link && signatureLinkExpired(link));
      if (!link || renewing) {
        const actor = context.users.find(
          (item) => item.clinicId === clinicId && item.id === actorUserId,
        );
        if (!actor)
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        const createdAt = now();
        link = {
          clinicId,
          documentId,
          viewCount: 0,
          views: [],
          ...link,
          token: createSignatureToken(),
          createdAt,
          expiresAt: signatureLinkExpiresAt(createdAt),
          createdByName: actor.fullName,
        };
        links.set(documentId, link);
        sync(document, link);
        context.recordAudit(
          clinicId,
          actorUserId,
          renewing
            ? "document.signature_link_renewed"
            : "document.signature_link_created",
          "document",
          {},
          documentId,
        );
      }
      // Quem assina: o cliente ou o fornecedor (WhatsApp, senão telefone).
      const patient = document.patientId
        ? context.patients.find(
            (item) =>
              item.clinicId === clinicId && item.id === document.patientId,
          )
        : undefined;
      const supplier = document.supplierId
        ? context.suppliers.find(
            (item) =>
              item.clinicId === clinicId && item.id === document.supplierId,
          )
        : undefined;
      const phone = patient?.phone || supplier?.whatsapp || supplier?.phone;
      return {
        document: structuredClone(document),
        token: link.token,
        ...(phone ? { patientPhone: phone } : {}),
        clinicName: document.branding?.name || context.clinicSettings.name,
      };
    },
    async getDocumentSignatureLink(clinicId: string, documentId: string) {
      const link = links.get(documentId);
      if (!link || link.clinicId !== clinicId) return null;
      const details: DocumentSignatureLinkDetails = structuredClone(link);
      delete (details as Partial<StoredLink>).clinicId;
      delete (details as Partial<StoredLink>).documentId;
      return details;
    },
    async openPublicSignatureDocument(
      token: string,
      metadata: PublicRequestMetadata,
    ) {
      const link = byToken(token);
      const document = link && findDocument(link);
      if (!link || !document) return null;
      assertSignatureLinkOpen(link);
      const viewedAt = now();
      link.viewCount += 1;
      link.firstViewedAt ??= viewedAt;
      link.lastViewedAt = viewedAt;
      link.views = appendSignatureView(link.views, metadata, viewedAt);
      sync(document, link);
      return publicDocument(document, link);
    },
    async signPublicDocument(
      token: string,
      input: PublicDocumentSignInput,
      metadata: PublicRequestMetadata,
    ) {
      const link = byToken(token);
      const document = link && findDocument(link);
      if (!link || !document) return null;
      if (link.signedAt)
        throw new DomainError(
          "DOCUMENT_ALREADY_SIGNED",
          "Este documento já foi assinado.",
          409,
        );
      assertSignatureLinkOpen(link);
      if (document.status !== "issued")
        throw new DomainError(
          "DOCUMENT_NOT_AVAILABLE",
          "Este documento não está mais disponível para assinatura.",
          410,
        );
      link.signedAt = now();
      link.signerName = input.signerName;
      if (input.signerCpf) link.signerCpf = input.signerCpf;
      link.signatureImage = input.signatureImage;
      if (metadata.ipAddress) link.signerIpAddress = metadata.ipAddress;
      if (metadata.userAgent)
        link.signerUserAgent = metadata.userAgent.slice(0, 300);
      link.documentSha256 = documentTextSha256(document.snapshotBody);
      document.updatedAt = link.signedAt;
      sync(document, link);
      return publicDocument(document, link);
    },
  };
}
