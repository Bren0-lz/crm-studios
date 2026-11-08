import {
  buildEventIndicators,
  type CommercialEvent,
  type CommercialEventDetail,
  type EventInput,
  type EventParticipant,
  type PatientLeadOrigin,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

/** Evento gravado; contagem e nome de quem cadastrou vêm na leitura. */
export type EventRow = Omit<
  CommercialEvent,
  "participantCount" | "createdByName"
>;

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
/** Participantes por nome (sem diferenciar maiúsculas e acentos, como o banco), depois id. */
const byName = (
  a: { fullName: string; id: string },
  b: { fullName: string; id: string },
) =>
  a.fullName.localeCompare(b.fullName, "pt-BR", { sensitivity: "base" }) ||
  byId(a, b);

export function createEventsRepository(context: MemoryRepositoryContext) {
  /** Evento da rede (sem filial) aparece em todas; o da filial, só nela. */
  const visible = (row: EventRow, clinicId: string) =>
    row.clinicId === clinicId && (!row.branchId || context.inBranchScope(row));
  const participantRows = (row: EventRow) =>
    context.leads.filter(
      (lead) =>
        lead.clinicId === row.clinicId &&
        lead.eventId === row.id &&
        context.inBranchScope(lead),
    );
  const toEvent = (row: EventRow): CommercialEvent => {
    const createdByName = row.createdBy
      ? context.users.find((user) => user.id === row.createdBy)?.fullName
      : undefined;
    return {
      ...structuredClone(row),
      ...(createdByName ? { createdByName } : {}),
      participantCount: participantRows(row).length,
    };
  };
  /** Avaliação/experimental não cancelada do lead (ou do cliente convertido a partir dele). */
  const evaluationAt = (lead: EventParticipant) =>
    context.appointments
      .filter(
        (item) =>
          item.clinicId === lead.clinicId &&
          item.status !== "cancelled" &&
          (item.visitType === "evaluation" || item.visitType === "trial") &&
          (item.leadId === lead.id ||
            (Boolean(lead.convertedPatientId) &&
              item.patientId === lead.convertedPatientId &&
              item.createdAt >= lead.createdAt)),
      )
      .map((item) => item.startsAt)
      .sort()
      .at(-1);
  /** Último contato feito (tentativa sem resposta fica de fora). */
  const contactedAt = (lead: EventParticipant) =>
    context.leadContacts
      .filter(
        (item) =>
          item.clinicId === lead.clinicId &&
          item.leadId === lead.id &&
          item.reached !== false,
      )
      .map((item) => item.occurredAt)
      .sort()
      .at(-1);
  const eventFields = (clinicId: string, input: EventInput) => {
    if (input.branchId) {
      if (
        !context.branches.some(
          (item) => item.clinicId === clinicId && item.id === input.branchId,
        )
      )
        throw new DomainError(
          "BRANCH_NOT_FOUND",
          "Filial não encontrada.",
          404,
        );
      context.assertBranchInScope(input.branchId);
    }
    return {
      ...(input.branchId ? { branchId: input.branchId } : {}),
      name: input.name,
      ...(input.location ? { location: input.location } : {}),
      ...(input.attendeeCount !== undefined
        ? { attendeeCount: input.attendeeCount }
        : {}),
      startsAt: new Date(input.startsAt).toISOString(),
      ...(input.notes ? { notes: input.notes } : {}),
    };
  };
  return {
    async listEvents(clinicId: string) {
      return context.events
        .filter((row) => visible(row, clinicId))
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || byId(a, b))
        .map(toEvent);
    },
    async getEvent(
      clinicId: string,
      id: string,
    ): Promise<CommercialEventDetail | null> {
      const row = context.events.find(
        (item) => item.id === id && visible(item, clinicId),
      );
      if (!row) return null;
      const leads = await context.operations.listLeads(clinicId);
      const participants = leads
        .filter((lead) => lead.eventId === row.id)
        .sort(byName)
        .map((lead): EventParticipant => {
          const at = evaluationAt(lead),
            contacted = contactedAt(lead);
          return {
            ...lead,
            ...(contacted ? { contactedAt: contacted } : {}),
            ...(at ? { evaluationAt: at } : {}),
          };
        });
      return {
        ...toEvent(row),
        participants,
        indicators: buildEventIndicators(participants),
      };
    },
    async createEvent(
      clinicId: string,
      actorUserId: string,
      input: EventInput,
    ) {
      const timestamp = now();
      const row: EventRow = {
        id: uuid(),
        clinicId,
        ...eventFields(clinicId, input),
        ...(context.users.some(
          (user) => user.clinicId === clinicId && user.id === actorUserId,
        )
          ? { createdBy: actorUserId }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      context.events.push(row);
      return toEvent(row);
    },
    async updateEvent(
      clinicId: string,
      _actorUserId: string,
      id: string,
      input: EventInput,
    ) {
      const index = context.events.findIndex(
        (item) => item.id === id && visible(item, clinicId),
      );
      if (index < 0) return null;
      const current = context.events[index]!;
      const row: EventRow = {
        id: current.id,
        clinicId,
        ...eventFields(clinicId, input),
        ...(current.createdBy ? { createdBy: current.createdBy } : {}),
        createdAt: current.createdAt,
        updatedAt: now(),
      };
      context.events[index] = row;
      return toEvent(row);
    },
    async listPatientLeadOrigins(clinicId: string) {
      return context.leads
        .filter((lead) => lead.clinicId === clinicId && lead.convertedPatientId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a, b))
        .flatMap((lead): PatientLeadOrigin[] => {
          const patient = context.patients.find(
            (item) =>
              item.clinicId === clinicId && item.id === lead.convertedPatientId,
          );
          if (!patient) return [];
          const eventName = lead.eventId
            ? context.events.find(
                (item) =>
                  item.clinicId === clinicId && item.id === lead.eventId,
              )?.name
            : undefined;
          return [
            {
              patientId: patient.mergedIntoPatientId ?? patient.id,
              ...(eventName ? { eventName } : {}),
            },
          ];
        });
    },
  };
}
