import { z } from "zod";
import { LEAD_LOST_STAGE } from "./stages.js";
import type { Lead } from "./types.js";
import { leadInputSchema } from "./model.js";
import { splitPhone } from "../common/model.js";
import {
  EXTRA_FIELDS_LABEL,
  type ExtraFields,
} from "../common/extra-fields.js";

/**
 * Eventos do comercial (aulão, feira, palestra): o participante é um lead do CRM ligado ao
 * evento (`Lead.eventId`), com o mesmo registro de contato, avaliação e conversão do funil.
 */
export const EVENT_LEAD_SOURCE_PREFIX = "Evento: ";
/** Interesse do participante enquanto ninguém registrou o que ele procura. */
export const EVENT_LEAD_DEFAULT_INTEREST = "Evento";

/** Participantes podem entrar sem dados de contato e sem validação do telefone. */
export const eventLeadInputSchema = leadInputSchema.extend({
  eventId: z.uuid(),
  fullName: z.string().trim().max(160).default(""),
  phone: z
    .string()
    .trim()
    .max(40)
    .default("")
    .transform((value) => {
      const { ddd, number } = splitPhone(value);
      return ddd ? ddd + number.replace(/\D/g, "") : value;
    }),
  source: leadInputSchema.shape.source.default("Evento"),
  interest: leadInputSchema.shape.interest.default(EVENT_LEAD_DEFAULT_INTEREST),
});

export const eventImportFieldLabels = {
  fullName: "Nome",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  cpf: "CPF",
  interest: "Interesse",
  notes: "Observações",
  phoneAreaCode: "DDD do telefone",
  whatsappAreaCode: "DDD do WhatsApp",
  extra: EXTRA_FIELDS_LABEL,
} as const;
/** "Outros" (`extra`) pode ser escolhido em várias colunas; os demais, em uma só. */
export const EVENT_IMPORT_EXTRA_FIELD = "extra";
export const eventImportFieldSchema = z.enum([
  "fullName",
  "phone",
  "whatsapp",
  "email",
  "cpf",
  "interest",
  "notes",
  "phoneAreaCode",
  "whatsappAreaCode",
  EVENT_IMPORT_EXTRA_FIELD,
]);
export type EventImportField = z.infer<typeof eventImportFieldSchema>;
export const eventImportFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1),
  mapping: z
    .array(eventImportFieldSchema.nullable())
    .max(200)
    .optional()
    .superRefine((mapping, context) => {
      const used = new Set<string>();
      for (const field of mapping ?? []) {
        if (!field || field === EVENT_IMPORT_EXTRA_FIELD) continue;
        if (used.has(field)) {
          context.addIssue({
            code: "custom",
            message: `O campo ${eventImportFieldLabels[field]} foi escolhido em mais de uma coluna.`,
          });
          return;
        }
        used.add(field);
      }
    }),
});
export type EventImportFileInput = z.infer<typeof eventImportFileSchema>;
/** Participante pronto para gravar: o lead e o "Outros" da linha. */
export type EventImportParticipantInput = z.infer<
  typeof eventLeadInputSchema
> & { extraFields?: ExtraFields };
export interface EventImportAnalysis {
  columns: { index: number; title: string; samples: string[] }[];
  mapping: (EventImportField | null)[];
  rows: {
    line: number;
    fullName: string;
    phone: string;
    status: "valid" | "error";
    errors: string[];
    input?: EventImportParticipantInput;
  }[];
  errors: string[];
  totals: { valid: number; error: number };
}
/**
 * Resultado da importação (EN1): `created` participantes novos, `linked` participantes ligados a
 * um cliente já cadastrado (mesmo telefone, e-mail ou CPF), `skipped` contatos que já eram
 * participantes do evento e `errors` linhas com erro.
 */
export interface EventImportResult {
  created: number;
  linked: number;
  skipped: number;
  errors: number;
}
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
  /**
   * Quando virou cliente: a conversão (etapa `won`) ou, no participante importado já ligado a um
   * cliente existente, o próprio cadastro. Ausente se não virou cliente.
   */
  convertedAt?: string;
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
