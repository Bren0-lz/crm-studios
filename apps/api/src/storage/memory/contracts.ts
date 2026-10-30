import {
  documentTemplateInputSchema,
  documentTemplateVersionInputSchema,
  documentBranding,
  documentTemplateValues,
  prepareDocumentContent,
  documentContentText,
  documentContentFields,
  type DocumentContent,
  type DocumentDraftInput,
} from "@crm/contracts";
import { formatPlanServices } from "../../modules/plans/plan-services.js";
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
  async function previewDocument(clinicId: string, input: IssuedDocumentInput) {
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

    const settings = repositoryContext.clinicSettings;
    if (settings.id !== clinicId)
      throw new DomainError("CLINIC_NOT_FOUND", "Clínica não encontrada.", 404);
    const values = documentTemplateValues({
      clinic: settings,
      patient,
      ...(plan
        ? { plan: { ...plan, services: formatPlanServices(plan.services) } }
        : {}),
      ...(professional ? { professional } : {}),
      issuedOn: new Intl.DateTimeFormat("pt-BR", {
        timeZone: settings.timezone,
      }).format(new Date()),
    });
    return {
      ...prepareDocumentContent(
        template.body,
        input.content ?? template.content,
        values,
      ),
      branding: documentBranding({
        ...settings,
        logoDataUrl: settings.logoDataUrl ?? "",
      }),
      templateName: template.name,
      templateVersion: template.version,
      patientName: patient.fullName,
      ...(plan ? { planName: plan.name } : {}),
    };
  }
  return {
    previewDocument,
    async updateDocumentDraft(
      clinicId: string,
      documentId: string,
      input: DocumentDraftInput,
    ) {
      const document = repositoryContext.issuedDocuments.find(
        (item) => item.clinicId === clinicId && item.id === documentId,
      );
      if (!document) return null;
      if (document.status !== "draft")
        throw new DomainError(
          "DOCUMENT_NOT_DRAFT",
          "Apenas rascunhos podem ser editados.",
          409,
        );
      if (documentContentFields(input.content).length)
        throw new DomainError(
          "DOCUMENT_UNFILLED_FIELDS",
          "Preencha os campos antes de salvar o contrato.",
        );
      document.title = input.title;
      document.snapshotContent = structuredClone(input.content);
      document.snapshotBody = documentContentText(input.content);
      document.updatedAt = now();
      return document;
    },
    async listDocumentTemplates(clinicId: string) {
      return repositoryContext.documentTemplates
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createDocumentTemplate(
      clinicId: string,
      input: DocumentTemplateInput,
    ) {
      input = documentTemplateInputSchema.parse(input);
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
      content?: DocumentContent,
    ) {
      ({ body, content } = documentTemplateVersionInputSchema.parse({
        body,
        content,
      }));
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
        ...(content ? { content } : {}),
        version: Math.max(...versions.map((item) => item.version)) + 1,
        active: true,
        previousVersionId: template.id,
        createdAt: now(),
      };
      repositoryContext.documentTemplates.push(next);
      return next;
    },

    async deleteDocumentTemplate(clinicId: string, templateId: string) {
      const template = repositoryContext.documentTemplates.find(
        (item) => item.clinicId === clinicId && item.id === templateId,
      );
      if (!template) return false;
      const name = template.name.toLocaleLowerCase();
      for (
        let index = repositoryContext.documentTemplates.length - 1;
        index >= 0;
        index--
      ) {
        const item = repositoryContext.documentTemplates[index]!;
        if (
          item.clinicId === clinicId &&
          item.name.toLocaleLowerCase() === name
        )
          repositoryContext.documentTemplates.splice(index, 1);
      }
      return true;
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
      const preview = await previewDocument(clinicId, input);
      const timestamp = now();
      const issuedDocument: IssuedDocument = {
        templateId: input.templateId,
        patientId: input.patientId,
        title: input.title,
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.professionalId
          ? { professionalId: input.professionalId }
          : {}),
        id: uuid(),
        clinicId,
        templateName: preview.templateName,
        templateVersion: preview.templateVersion,
        patientName: preview.patientName,
        ...(preview.planName ? { planName: preview.planName } : {}),
        snapshotBody: preview.snapshotBody,
        snapshotContent: preview.snapshotContent,
        branding: structuredClone(preview.branding),
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
