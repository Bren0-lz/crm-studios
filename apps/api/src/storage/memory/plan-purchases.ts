import type { PlanPurchaseInput, PlanPurchaseResult } from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import {
  purchaseFingerprint,
  assertPlanEnrollmentSeat,
  validatePurchaseSchedule,
} from "../../modules/plans/purchase.js";
export function createPlanPurchasesRepository(
  context: MemoryRepositoryContext,
) {
  return {
    async purchasePatientPlan(
      clinicId: string,
      actorId: string,
      input: PlanPurchaseInput,
    ): Promise<PlanPurchaseResult> {
      const key = `${clinicId}:${input.idempotencyKey}`,
        fingerprint = purchaseFingerprint(input),
        cached = context.planPurchases.get(key);
      if (cached) {
        if (cached.fingerprint !== fingerprint)
          throw new DomainError(
            "PLAN_PURCHASE_KEY_REUSED",
            "Esta confirmação já foi usada com outras condições. Inicie uma nova contratação.",
            409,
          );
        return structuredClone(cached.result);
      }
      validatePurchaseSchedule(input, context.clinicSettings.timezone);
      if (input.groupId) {
        const group = context.groupClasses.find(
          (item) =>
            item.clinicId === clinicId &&
            item.id === input.groupId &&
            item.active,
        );
        if (!group)
          throw new DomainError(
            "GROUP_OR_PATIENT_NOT_FOUND",
            "Turma ativa não encontrada.",
            404,
          );
        if (
          !input.plan.services.some(
            (item) => item.serviceId === group.serviceId,
          )
        )
          throw new DomainError(
            "GROUP_SERVICE_MISMATCH",
            "A turma escolhida não é do serviço do plano.",
            400,
          );
      }
      const collections: unknown[][] = [
        context.patientPlans,
        context.receivables,
        context.sessionMovements,
        context.appointments,
        context.groupEnrollments,
        context.issuedDocuments,
        context.adminAuditEvents,
      ];
      const lengths = collections.map((items) => items.length);
      try {
        const plan = await context.operations.createPatientPlan(
          clinicId,
          actorId,
          input.plan,
        );
        const appointments = [];
        for (const appointment of input.appointments)
          appointments.push(
            await context.operations.createAppointment(clinicId, {
              ...appointment,
              patientId: plan.patientId,
              planId: plan.id,
            }),
          );
        // Cliente que já está na turma (plano anterior vencido ou cancelado não encerra a
        // matrícula): o novo plano segue com a mesma matrícula, sem duplicar.
        const current = input.groupId
          ? context.groupEnrollments.find(
              (item) =>
                item.clinicId === clinicId &&
                item.groupId === input.groupId &&
                item.patientId === plan.patientId &&
                item.status !== "cancelled",
            )
          : undefined;
        const enrollment = current
          ? structuredClone(current)
          : input.groupId
            ? await context.operations.createGroupEnrollment(clinicId, {
                groupId: input.groupId,
                patientId: plan.patientId,
              })
            : undefined;
        // Sem vaga confirmada na turma não há venda (TW3): desfaz plano e matrícula.
        assertPlanEnrollmentSeat(enrollment);
        let document = input.document
          ? await context.operations.createIssuedDocument(clinicId, actorId, {
              ...input.document,
              patientId: plan.patientId,
              planId: plan.id,
            })
          : undefined;
        if (document)
          document = (await context.operations.updateIssuedDocumentStatus(
            clinicId,
            document.id,
            "issued",
          ))!;
        const result: PlanPurchaseResult = {
          plan,
          appointments,
          ...(enrollment ? { enrollment } : {}),
          ...(document ? { document } : {}),
        };
        context.recordAudit(
          clinicId,
          actorId,
          "plan.purchased",
          "plan",
          {
            appointmentIds: appointments.map((item) => item.id),
            enrollmentId: enrollment?.id,
            documentId: document?.id,
          },
          plan.id,
        );
        context.planPurchases.set(key, {
          fingerprint,
          result: structuredClone(result),
        });
        return structuredClone(result);
      } catch (error) {
        collections.forEach((items, index) => {
          items.length = lengths[index]!;
        });
        throw error;
      }
    },
  };
}
