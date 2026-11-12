import type {
  CommercialEvent,
  CommercialEventDetail,
  EventInput,
  EventListQuery,
  EventImportFileInput,
  EventImportAnalysis,
  EventImportResult,
  Lead,
  LeadActivity,
  LeadBoard,
  LeadFilter,
  LeadFilterOptions,
  LeadInsights,
  LeadStagePage,
  LeadContact,
  LeadContactInput,
  LeadConversion,
  LeadConversionInput,
  LeadDuplicateMatch,
  LeadDuplicateQuery,
  LeadImportAnalysis,
  LeadImportFileInput,
  LeadImportPreviewInput,
  LeadImportResult,
  LeadInput,
  LeadStage,
  LeadStageConfig,
  LeadStagesInput,
  LeadTask,
  LeadTaskInput,
  LeadTaskStatus,
} from "@crm/contracts";
import { request, requestBlob } from "../transport";

/** Filtros do funil (+ paginação) como query string, sem chaves vazias. */
function leadQuery(filter: LeadFilter, extra: Record<string, number> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filter, ...extra }))
    if (value !== undefined && value !== "") params.set(key, String(value));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const commercialApi = {
  events: (query: EventListQuery = {}) =>
    request<CommercialEvent[]>(
      query.serviceId
        ? `/events?serviceId=${encodeURIComponent(query.serviceId)}`
        : "/events",
    ),
  event: (id: string) => request<CommercialEventDetail>(`/events/${id}`),
  /** Planilha dos participantes visíveis na filial ativa. */
  eventParticipantsXlsx: (id: string) =>
    requestBlob(`/events/${id}/participants/export.xlsx`),
  previewEventImport: (id: string, input: EventImportFileInput) =>
    request<EventImportAnalysis>(`/events/${id}/import/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  importEventParticipants: (id: string, input: EventImportFileInput) =>
    request<EventImportResult>(`/events/${id}/import`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** LI1: importação de leads por planilha na tela do CRM (sem evento). */
  previewLeadImport: (input: LeadImportPreviewInput) =>
    request<LeadImportAnalysis>("/leads/import/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  importLeads: (input: LeadImportFileInput) =>
    request<LeadImportResult>("/leads/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createEvent: (input: EventInput) =>
    request<CommercialEvent>("/events", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEvent: (id: string, input: EventInput) =>
    request<CommercialEvent>(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Os participantes continuam como leads, sem evento. */
  deleteEvent: (id: string) =>
    request<void>(`/events/${id}`, { method: "DELETE" }),
  /** Tira o participante do evento; o lead continua no funil. */
  removeEventParticipant: (id: string, leadId: string) =>
    request<void>(`/events/${id}/participants/${leadId}`, {
      method: "DELETE",
    }),
  leads: () => request<Lead[]>("/leads"),
  /** Funil paginado: a primeira página e o total de cada etapa. */
  leadBoard: (filter: LeadFilter = {}) =>
    request<LeadBoard>(`/leads/board${leadQuery(filter)}`),
  /** Próxima página de uma coluna do funil ("Carregar mais"). */
  leadStagePage: (stage: LeadStage, filter: LeadFilter, offset: number) =>
    request<LeadStagePage>(
      `/leads/board/${stage}${leadQuery(filter, { offset })}`,
    ),
  leadInsights: (filter: LeadFilter = {}) =>
    request<LeadInsights>(`/leads/insights${leadQuery(filter)}`),
  leadFilterOptions: () => request<LeadFilterOptions>("/leads/filter-options"),
  /** Etapas do funil da clínica, na ordem, com a etapa final (`won`) e a de perdidos. */
  leadStages: () => request<LeadStageConfig[]>("/leads/stages"),
  /** Salva o funil inteiro (nomes, etapas novas/removidas e etapa final). */
  saveLeadStages: (stages: LeadStagesInput["stages"]) =>
    request<LeadStageConfig[]>("/leads/stages", {
      method: "PUT",
      body: JSON.stringify({ stages }),
    }),
  /** Clientes e leads com o mesmo telefone, e-mail ou CPF (só id e nome). */
  leadDuplicates: (query: LeadDuplicateQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (typeof value === "string" && value.trim()) params.set(key, value);
    return request<{ matches: LeadDuplicateMatch[] }>(
      `/leads/duplicates?${params.toString()}`,
    );
  },
  createLead: (input: LeadInput) =>
    request<Lead>("/leads", { method: "POST", body: JSON.stringify(input) }),
  updateLead: (id: string, input: LeadInput) =>
    request<Lead>(`/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  moveLead: (id: string, stage: LeadStage, lostReason?: string) =>
    request<Lead>(`/leads/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage, lostReason }),
    }),
  convertLead: (id: string, input: LeadConversionInput) =>
    request<LeadConversion>(`/leads/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  leadActivity: (id: string) => request<LeadActivity>(`/leads/${id}/activity`),
  createLeadContact: (id: string, input: LeadContactInput) =>
    request<LeadContact>(`/leads/${id}/contacts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createLeadTask: (id: string, input: LeadTaskInput) =>
    request<LeadTask>(`/leads/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLeadTaskStatus: (id: string, status: LeadTaskStatus) =>
    request<LeadTask>(`/lead-tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
