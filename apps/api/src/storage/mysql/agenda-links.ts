import type { AppointmentRescheduleInput } from "@crm/contracts";
import type { MysqlRepositoryContext } from "./context.js";
import { DomainError } from "../../repository.js";
import { localDate } from "./sql.js";
export function createAgendaLinksRepository(context: MysqlRepositoryContext) {
  return {
    async createAbsenceSuccessor(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AppointmentRescheduleInput,
    ) {
      return context.inTransaction(async (client) => {
        await client.lock(clinicId);
        await client.query(
          "SELECT id FROM appointments WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, id],
        );
        const source = await context.findAppointment(clinicId, id, client);
        if (!source)
          throw new DomainError(
            "APPOINTMENT_NOT_FOUND",
            "Atendimento não encontrado.",
            404,
          );
        await client.query(
          "SELECT id FROM appointments WHERE clinic_id=$1 AND id=$2 FOR UPDATE",
          [clinicId, id],
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
          (
            await client.query(
              "SELECT id FROM appointments WHERE clinic_id=$1 AND predecessor_id=$2 AND status<>'cancelled'",
              [clinicId, id],
            )
          ).rowCount
        )
          throw new DomainError(
            "APPOINTMENT_SUCCESSOR_EXISTS",
            "A ausência já possui remarcação vinculada.",
            409,
          );
        const related = await client.query<{ duration: number }>(
          "SELECT s.duration_minutes AS duration FROM services s,professionals p,rooms r WHERE s.clinic_id=$1 AND s.id=$2 AND s.active AND p.clinic_id=$1 AND p.id=$3 AND p.active AND r.clinic_id=$1 AND r.id=$4 AND r.active",
          [clinicId, source.serviceId, input.professionalId, input.roomId],
        );
        if (!related.rows[0])
          throw new DomainError(
            "RELATED_RECORD_NOT_FOUND",
            "Profissional, sala ou serviço não encontrado.",
            404,
          );
        const data = {
            ...input,
            serviceId: source.serviceId,
            ...(source.planId ? { planId: source.planId } : {}),
            visitType: source.visitType,
            notes: source.notes ?? "",
          },
          owner = source.patientId
            ? { patientId: source.patientId, leadId: null }
            : { patientId: null, leadId: source.leadId! };
        const successor = await context.insertAppointment(
          clinicId,
          data,
          related.rows[0].duration,
          owner,
          client,
        );
        await client.query(
          "UPDATE appointments SET predecessor_id=$3 WHERE clinic_id=$1 AND id=$2",
          [clinicId, successor.id, id],
        );
        await client.query(
          `UPDATE patient_plans SET source_appointment_id=$3,valid_from=${localDate("$4")},updated_at=NOW(6) WHERE clinic_id=$1 AND source_appointment_id=$2 AND status='active'`,
          [clinicId, id, successor.id, successor.startsAt],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "appointment.absence_rescheduled",
          "appointment",
          id,
          { sourceId: id, successorId: successor.id },
        );
        return { ...successor, predecessorId: id };
      });
    },
  };
}
