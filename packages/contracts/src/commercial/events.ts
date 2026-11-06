import { z } from "zod";
import { LEAD_LOST_STAGE } from "./stages.js";
import type { Lead } from "./types.js";

/**
 * Eventos do comercial (aulão, feira, palestra): o participante é um lead do CRM ligado ao
 * evento (`Lead.eventId`), com o mesmo registro de contato, avaliação e conversão do funil.
 */
export const EVENT_LEAD_SOURCE_PREFIX = "Evento: ";
/** Interesse do participante enquanto ninguém registrou o que ele procura. */
export const EVENT_LEAD_DEFAULT_INTEREST = "Evento";
/** O nome cabe na origem do lead ("Evento: <nome>", até 80 caracteres). */
export const EVENT_NAME_MAX = 80 - EVENT_LEAD_SOURCE_PREFIX.length;
export const EVENT_LOCATION_MAX = 160;
export const EVENT_NOTES_MAX = 2000;
export const EVENT_ATTENDEES_MAX = 100_000;

export const eventInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do evento.")
    .max(
      EVENT_NAME_MAX,
      `O nome do evento deve ter até ${EVENT_NAME_MAX} caracteres.`,
    ),
  /** Local ou cidade. */
  location: z
    .string()
    .trim()
    .max(EVENT_LOCATION_MAX)
    .optional()
    .or(z.literal("")),
  /** Número de pessoas no evento (público estimado). */
  attendeeCount: z.number().int().min(0).max(EVENT_ATTENDEES_MAX).optional(),
  startsAt: z.iso.datetime({ message: "Informe a data do evento." }),
  notes: z.string().trim().max(EVENT_NOTES_MAX).optional().or(z.literal("")),
  /** Filial do evento; vazio = evento da rede (aparece em todas as filiais). */
  branchId: z.uuid().optional().or(z.literal("")),
});
export type EventInput = z.infer<typeof eventInputSchema>;

/** Indicadores do evento, só estes quatro. */
export interface EventIndicators {
  /** Participantes com algum contato feito (tentativa sem resposta não conta). */
  contacted: number;
  /** Participantes não perdidos com interesse informado (diferente do padrão "Evento"). */
  interested: number;
  /** Participantes com avaliação ou aula experimental marcada (não cancelada). */
  evaluations: number;
  /** Participantes convertidos em cliente. */
  converted: number;
}

export interface CommercialEvent {
  id: string;
  clinicId: string;
  /** Ausente = evento da rede. */
  branchId?: string;
  name: string;
  location?: string;
  attendeeCount?: number;
  startsAt: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  /** Participantes visíveis nas filiais da consulta. */
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventParticipant extends Lead {
  /** Último contato feito (`reached` diferente de `false`); `lastContactAt` inclui tentativas. */
  contactedAt?: string;
  /** Início da avaliação/aula experimental marcada mais recente (não cancelada). */
  evaluationAt?: string;
}

export interface CommercialEventDetail extends CommercialEvent {
  participants: EventParticipant[];
  indicators: EventIndicators;
}

/** Origem gravada no lead criado pelo evento. */
export function eventLeadSource(eventName: string) {
  return `${EVENT_LEAD_SOURCE_PREFIX}${eventName.trim()}`;
}

/** O participante já disse o que procura (interesse diferente do padrão "Evento")? */
export function hasEventInterest(lead: Pick<Lead, "interest" | "interests">) {
  const key = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  return (
    key(lead.interest) !== key(EVENT_LEAD_DEFAULT_INTEREST) ||
    Boolean(lead.interests?.length)
  );
}

export function buildEventIndicators(
  participants: readonly EventParticipant[],
): EventIndicators {
  const count = (test: (item: EventParticipant) => boolean) =>
    participants.filter(test).length;
  return {
    contacted: count((item) => Boolean(item.contactedAt)),
    interested: count(
      (item) => item.stage !== LEAD_LOST_STAGE && hasEventInterest(item),
    ),
    evaluations: count((item) => Boolean(item.evaluationAt)),
    converted: count((item) => Boolean(item.convertedPatientId)),
  };
}
