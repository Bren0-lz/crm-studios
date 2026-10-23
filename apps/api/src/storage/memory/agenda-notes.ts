import type {
  AgendaNote,
  AgendaNoteInput,
  AgendaNoteScope,
  AgendaNoteUpdate,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { noteOccurrences } from "../../modules/agenda/notes.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now, uuid } from "./helpers.js";

export function createAgendaNotesRepository(context: MemoryRepositoryContext) {
  const visible = (item: AgendaNote, clinicId: string) =>
    item.clinicId === clinicId && context.inBranchScope(item);
  const assertProfessional = (
    clinicId: string,
    professionalId: string | null,
  ) => {
    const professional = context.professionals.find(
      (item) =>
        item.clinicId === clinicId &&
        item.id === professionalId &&
        context.inBranchScope(item),
    );
    if (professionalId && !professional)
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
    return professional;
  };
  return {
    async listAgendaNotes(
      clinicId: string,
      from: string,
      to: string,
      professionalScope?: string,
    ) {
      return context.agendaNotes
        .filter(
          (item) =>
            visible(item, clinicId) &&
            Date.parse(item.startsAt) < Date.parse(to) &&
            Date.parse(item.endsAt) > Date.parse(from) &&
            (!professionalScope ||
              item.professionalId === null ||
              item.professionalId === professionalScope),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((item) => ({ ...item }));
    },
    async createAgendaNotes(
      clinicId: string,
      actorUserId: string,
      input: AgendaNoteInput,
    ) {
      const professional = assertProfessional(clinicId, input.professionalId);
      const occurrences = noteOccurrences(
        input,
        context.clinicSettings.timezone,
      );
      const timestamp = now();
      const seriesId = input.repeat ? uuid() : null;
      const items: AgendaNote[] = occurrences.map((occurrence) => ({
        professionalId: input.professionalId,
        description: input.description,
        backgroundColor: input.backgroundColor,
        ...occurrence,
        id: uuid(),
        clinicId,
        branchId: professional
          ? context.resourceBranch(professional)
          : context.writeBranchId(clinicId),
        seriesId,
        authorUserId: actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      context.agendaNotes.push(...items);
      for (const item of items)
        context.addAdminAudit(
          actorUserId,
          "agenda.note_created",
          "agenda_note",
          item.id,
          {},
          clinicId,
        );
      return items.map((item) => ({ ...item }));
    },
    async updateAgendaNote(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AgendaNoteUpdate,
      scope: AgendaNoteScope,
      professionalScope?: string,
    ) {
      const source = context.agendaNotes.find(
        (item) =>
          visible(item, clinicId) &&
          item.id === id &&
          (!professionalScope || item.professionalId === professionalScope),
      );
      if (!source) return null;
      const professional = assertProfessional(clinicId, input.professionalId);
      if (professional)
        context.sameBranch(
          "A nota e o profissional precisam ser da mesma filial.",
          source,
          professional,
        );
      const selected = context.agendaNotes.filter(
        (item) =>
          visible(item, clinicId) &&
          (!professionalScope || item.professionalId === professionalScope) &&
          (item.id === id ||
            (scope === "following" &&
              source.seriesId &&
              item.seriesId === source.seriesId &&
              item.startsAt >= source.startsAt)),
      );
      const delta = Date.parse(input.startsAt) - Date.parse(source.startsAt);
      const duration = Date.parse(input.endsAt) - Date.parse(input.startsAt);
      // Separar a parte editada impede que mudanças posteriores na série antiga a alcancem.
      const seriesId = scope === "following" && source.seriesId ? uuid() : null;
      for (const item of selected) {
        const start = Date.parse(item.startsAt) + delta;
        Object.assign(item, input, {
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + duration).toISOString(),
          updatedAt: now(),
          seriesId,
        });
        context.addAdminAudit(
          actorUserId,
          "agenda.note_updated",
          "agenda_note",
          item.id,
          { scope },
          clinicId,
        );
      }
      return selected.map((item) => ({ ...item }));
    },
    async deleteAgendaNote(
      clinicId: string,
      actorUserId: string,
      id: string,
      scope: AgendaNoteScope,
      professionalScope?: string,
    ) {
      const source = context.agendaNotes.find(
        (item) =>
          visible(item, clinicId) &&
          item.id === id &&
          (!professionalScope || item.professionalId === professionalScope),
      );
      if (!source) return false;
      const selected = context.agendaNotes.filter(
        (item) =>
          visible(item, clinicId) &&
          (!professionalScope || item.professionalId === professionalScope) &&
          (item.id === id ||
            (scope === "following" &&
              source.seriesId &&
              item.seriesId === source.seriesId &&
              item.startsAt >= source.startsAt)),
      );
      for (const item of selected) {
        context.agendaNotes.splice(context.agendaNotes.indexOf(item), 1);
        context.addAdminAudit(
          actorUserId,
          "agenda.note_deleted",
          "agenda_note",
          item.id,
          { scope },
          clinicId,
        );
      }
      return true;
    },
  };
}
