import type {
  Appointment,
  GroupEnrollment,
  IssuedDocument,
  PatientPlan,
  PlanPurchaseInput,
  PlanPurchaseResult,
} from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import {
  purchaseFingerprint,
  assertPlanEnrollmentSeat,
  validatePurchaseSchedule,
} from "../../modules/plans/purchase.js";
/** Reserva as sessões da contratação no plano (conflito de agenda recusa a operação). */
export async function bookPlanAppointments(
  context: MemoryRepositoryContext,
  clinicId: string,
  plan: PatientPlan,
  appointments: PlanPurchaseInput["appointments"],
) {
  const booked: Appointment[] = [];
  for (const appointment of appointments)
    booked.push(
      await context.operations.createAppointment(clinicId, {
        ...appointment,
        patientId: plan.patientId,
        planId: plan.id,
      }),
    );
  return booked;
}

/** Emite o documento da contratação ligado ao plano, pronto para o link de assinatura. */
export async function issuePlanDocument(
  context: MemoryRepositoryContext,
  clinicId: string,
  actorId: string,
  plan: PatientPlan,
  document: NonNullable<PlanPurchaseInput["document"]>,
): Promise<IssuedDocument> {
  const draft = await context.operations.createIssuedDocument(
    clinicId,
    actorId,
    { ...document, patientId: plan.patientId, planId: plan.id },
  );
  return (await context.operations.updateIssuedDocumentStatus(
    clinicId,
    draft.id,
    "issued",
  ))!;
}

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
      // A confirmação altera matrículas já existentes, que o corte por tamanho não desfaz.
      let restoreGroupEnrollments: (() => void) | undefined;
      const promoteWaitlisted = async (waiting: GroupEnrollment) => {
        const group = context.groupClasses.find(
          (item) => item.clinicId === clinicId && item.id === waiting.groupId,
        );
        const active = context.groupEnrollments.filter(
          (item) =>
            item.groupId === waiting.groupId && item.status === "active",
        ).length;
        if (!group || active >= group.capacity) return undefined;
        const saved = context.groupEnrollments
          .filter((item) => item.groupId === waiting.groupId)
          .map((item) => [item, structuredClone(item)] as const);
        restoreGroupEnrollments = () => {
          for (const [item, copy] of saved) {
            for (const field of Object.keys(item))
              delete (item as Partial<GroupEnrollment>)[
                field as keyof GroupEnrollment
              ];
            Object.assign(item, copy);
          }
          context.refreshGroupCounts(group);
        };
        return (
          (await context.operations.confirmGroupEnrollment(
            clinicId,
            waiting.id,
          )) ?? undefined
        );
      };
      try {
        const plan = await context.operations.createPatientPlan(
          clinicId,
          actorId,
          input.plan,
        );
        const appointments = await bookPlanAppointments(
          context,
          clinicId,
          plan,
          input.appointments,
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
        // Cliente na lista de espera da turma e com vaga livre: a venda confirma a matrícula
        // (como "Cliente aceitou" na Lista de espera), em vez de recusar como turma cheia.
        const promoted =
          current?.status === "waitlisted"
            ? await promoteWaitlisted(current)
            : undefined;
        const enrollment = current
          ? structuredClone(promoted ?? current)
          : input.groupId
            ? await context.operations.createGroupEnrollment(clinicId, {
                groupId: input.groupId,
                patientId: plan.patientId,
              })
            : undefined;
        // Sem vaga confirmada na turma não há venda (TW3): desfaz plano e matrícula.
        assertPlanEnrollmentSeat(enrollment);
        const document = input.document
          ? await issuePlanDocument(
              context,
              clinicId,
              actorId,
              plan,
              input.document,
            )
          : undefined;
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
        restoreGroupEnrollments?.();
        throw error;
      }
    },
  };
}
