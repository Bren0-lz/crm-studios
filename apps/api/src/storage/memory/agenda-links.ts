import { clinicDateOf } from "../../modules/finance/daily-cash.js";
import type { AppointmentRescheduleInput } from "@crm/contracts";
import type { MemoryRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { createClinicWriteLock } from "./write-lock.js";
export function createAgendaLinksRepository(context: MemoryRepositoryContext) {
  const write = createClinicWriteLock();
  return {
    createAbsenceSuccessor(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AppointmentRescheduleInput,
    ) {
      return write(clinicId, async () => {
        const source = context.appointments.find(
          (item) => item.clinicId === clinicId && item.id === id,
        );
        if (!source)
          throw new DomainError(
            "APPOINTMENT_NOT_FOUND",
            "Atendimento não encontrado.",
            404,
          );
        if (
          !["no_show", "excused_absence", "professional_absence"].includes(
            source.status,
          )
        )
          throw new DomainError(
            "APPOINTMENT_SUCCESSOR_FORBIDDEN",
            "Este atendimento não é uma ausência.",
            409,
          );
        if (
          context.appointments.some(
            (item) =>
              item.clinicId === clinicId &&
              item.predecessorId === id &&
              item.status !== "cancelled",
          )
        )
          throw new DomainError(
            "APPOINTMENT_SUCCESSOR_EXISTS",
            "A ausência já possui remarcação vinculada.",
            409,
          );
        const data = {
          ...input,
          serviceId: source.serviceId,
          ...((input.planId ?? source.planId)
            ? { planId: input.planId ?? source.planId }
            : {}),
          visitType: source.visitType,
          notes: source.notes ?? "",
        };
        const successor = source.patientId
          ? await context.operations.createAppointment(clinicId, {
              ...data,
              patientId: source.patientId,
            })
          : await context.operations.createLeadAppointment(
              clinicId,
              source.leadId!,
              // Lead só tem aula experimental: a remarcação também é experimental.
              { ...data, visitType: "trial" },
            );
        if (!successor)
          throw new DomainError(
            "APPOINTMENT_NOT_FOUND",
            "Atendimento não encontrado.",
            404,
          );
        successor.predecessorId = source.id;
        for (const plan of context.patientPlans.filter(
          (p) =>
            p.clinicId === clinicId &&
            p.sourceAppointmentId === source.id &&
            p.status === "active",
        )) {
          plan.sourceAppointmentId = successor.id;
          plan.validFrom = clinicDateOf(
            new Date(successor.startsAt),
            context.clinicSettings.timezone,
          );
        }
        context.recordAudit(
          clinicId,
          actorUserId,
          "appointment.absence_rescheduled",
          "appointment",
          { sourceId: id, successorId: successor.id },
          id,
        );
        return structuredClone(successor);
      });
    },
  };
}
