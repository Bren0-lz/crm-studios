import type {
  DocumentSignatureLink,
  DocumentSignatureLinkDetails,
  IssuedDocument,
  PublicDocumentSignInput,
  PublicRequestMetadata,
  PublicSignatureDocument,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import {
  createSignatureToken,
  documentTextSha256,
  maxStoredSignatureViews,
  signatureLinkView,
} from "../../modules/contracts/signature-links.js";
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
      if (!link) {
        const actor = context.users.find(
          (item) => item.clinicId === clinicId && item.id === actorUserId,
        );
        if (!actor)
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        link = {
          clinicId,
          documentId,
          token: createSignatureToken(),
          createdAt: now(),
          createdByName: actor.fullName,
          viewCount: 0,
          views: [],
        };
        links.set(documentId, link);
        sync(document, link);
        context.recordAudit(
          clinicId,
          actorUserId,
          "document.signature_link_created",
          "document",
          {},
          documentId,
        );
      }
      const patient = context.patients.find(
        (item) => item.clinicId === clinicId && item.id === document.patientId,
      );
      return {
        document: structuredClone(document),
        token: link.token,
        ...(patient?.phone ? { patientPhone: patient.phone } : {}),
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
      const viewedAt = now();
      link.viewCount += 1;
      link.firstViewedAt ??= viewedAt;
      link.lastViewedAt = viewedAt;
      link.views = [...link.views, signatureLinkView(metadata, viewedAt)].slice(
        -maxStoredSignatureViews,
      );
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
