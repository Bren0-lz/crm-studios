import {
  appointmentNotStartedMessage,
  isAppointmentStarted,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";

/**
 * Realizado/falta e evolução clínica só a partir de 15 min antes do início do atendimento.
 * Comanda continua aceitando atendimento futuro (pré-venda) e não usa esta regra.
 */
export function assertAppointmentStarted(
  startsAt: string | Date,
  now: Date = new Date(),
) {
  const iso = typeof startsAt === "string" ? startsAt : startsAt.toISOString();
  if (!isAppointmentStarted({ startsAt: iso }, now))
    throw new DomainError(
      "APPOINTMENT_NOT_STARTED",
      `${appointmentNotStartedMessage(iso)}.`,
      409,
    );
}
