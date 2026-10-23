import type {
  DocumentStatus,
  DocumentTemplate,
  DocumentTemplateInput,
  IssuedDocument,
  IssuedDocumentInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createContractsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  return {
    async listDocumentTemplates(clinicId: string) {
      return repositoryContext.documentTemplates
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createDocumentTemplate(
      clinicId: string,
      input: DocumentTemplateInput,
    ) {
      if (
        repositoryContext.documentTemplates.some(
          (item) =>
            item.clinicId === clinicId &&
            item.active &&
            item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
        )
      )
        throw new DomainError(
          "DOCUMENT_TEMPLATE_DUPLICATE",
          "Já existe um modelo ativo com este nome.",
          409,
        );
      const template: DocumentTemplate = {
        ...input,
        id: uuid(),
        clinicId,
        version: 1,
        active: true,
        createdAt: now(),
      };
      repositoryContext.documentTemplates.push(template);
      return template;
    },

    async createDocumentTemplateVersion(
      clinicId: string,
      templateId: string,
      body: string,
    ) {
      const template = repositoryContext.documentTemplates.find(
        (item) => item.clinicId === clinicId && item.id === templateId,
      );
      if (!template) return null;
      const versions = repositoryContext.documentTemplates.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.name.toLocaleLowerCase() === template.name.toLocaleLowerCase(),
      );
      for (const item of versions) item.active = false;
      const next: DocumentTemplate = {
        id: uuid(),
        clinicId,
        name: template.name,
        kind: template.kind,
        body,
        version: Math.max(...versions.map((item) => item.version)) + 1,
        active: true,
        previousVersionId: template.id,
        createdAt: now(),
      };
      repositoryContext.documentTemplates.push(next);
      return next;
    },

    async listIssuedDocuments(clinicId: string) {
      return repositoryContext.issuedDocuments
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createIssuedDocument(
      clinicId: string,
      _actorUserId: string,
      input: IssuedDocumentInput,
    ) {
      const template = repositoryContext.documentTemplates.find(
        (item) =>
          item.clinicId === clinicId &&
          item.id === input.templateId &&
          item.active,
      );
      if (!template)
        throw new DomainError(
          "DOCUMENT_TEMPLATE_NOT_FOUND",
          "Modelo ativo não encontrado.",
          404,
        );
      const patient = repositoryContext.patients.find(
        (item) => item.clinicId === clinicId && item.id === input.patientId,
      );
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      const plan = input.planId
        ? repositoryContext.patientPlans.find(
            (item) =>
              item.clinicId === clinicId &&
              item.id === input.planId &&
              item.patientId === patient.id,
          )
        : undefined;
      if (input.planId && !plan)
        throw new DomainError(
          "DOCUMENT_PLAN_MISMATCH",
          "O plano informado não pertence ao cliente.",
        );
      const professional = input.professionalId
        ? repositoryContext.professionals.find(
            (item) =>
              item.clinicId === clinicId && item.id === input.professionalId,
          )
        : undefined;
      if (input.professionalId && !professional)
        throw new DomainError(
          "PROFESSIONAL_NOT_FOUND",
          "Profissional não encontrado.",
          404,
        );
      const timestamp = now();
      const issuedDocument: IssuedDocument = {
        ...input,
        id: uuid(),
        clinicId,
        templateName: template.name,
        templateVersion: template.version,
        patientName: patient.fullName,
        ...(plan ? { planName: plan.name } : {}),
        snapshotBody: repositoryContext.renderDocument(
          template.body,
          patient,
          plan,
          professional,
        ),
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      repositoryContext.issuedDocuments.push(issuedDocument);
      return issuedDocument;
    },

    async updateIssuedDocumentStatus(
      clinicId: string,
      documentId: string,
      status: Exclude<DocumentStatus, "draft">,
    ) {
      const document = repositoryContext.issuedDocuments.find(
        (item) => item.clinicId === clinicId && item.id === documentId,
      );
      if (!document) return null;
      if (document.status === "cancelled")
        throw new DomainError(
          "DOCUMENT_ALREADY_CANCELLED",
          "Um documento cancelado não pode ser alterado.",
          409,
        );
      if (status === "issued" && document.status !== "draft")
        throw new DomainError(
          "DOCUMENT_ALREADY_ISSUED",
          "Este documento já foi emitido.",
          409,
        );
      document.status = status;
      document.updatedAt = now();
      if (status === "issued") document.issuedAt = now();
      if (status === "cancelled") document.cancelledAt = now();
      return document;
    },
  };
}
