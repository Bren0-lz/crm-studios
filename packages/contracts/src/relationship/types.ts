import { z } from "zod";
import {
  contactActivityInputSchema,
  contactOutcomeSchema,
  contactReasonSchema,
  relationshipSettingsSchema,
  satisfactionFilterSchema,
  satisfactionSurveyInputSchema,
} from "./model.js";

export type ContactReason = z.infer<typeof contactReasonSchema>;

export type ContactOutcome = z.infer<typeof contactOutcomeSchema>;

export type RelationshipSettings = z.infer<typeof relationshipSettingsSchema>;

export type ContactActivityInput = z.infer<typeof contactActivityInputSchema>;

export interface ContactSuggestion {
  patientId: string;
  patientName: string;
  phone: string;
  whatsapp?: string | undefined;
  reason: ContactReason;
  referenceKey: string;
  /** Texto legível que explica a situação (ex.: "Plano termina em 3 dias"). */
  detail: string;
  dueDate?: string | undefined;
  /** Menor número = mais urgente. */
  priority: number;
}

export interface ContactActivity {
  id: string;
  clinicId: string;
  patientId: string;
  reason: ContactReason;
  referenceKey: string;
  outcome: ContactOutcome;
  notes?: string | undefined;
  snoozeUntil?: string | undefined;
  actorUserId: string;
  createdAt: string;
}

/** Aniversariante do mês (`GET /relationship/birthdays?month=aaaa-mm`). */
export interface BirthdayEntry {
  patientId: string;
  patientName: string;
  phone: string;
  whatsapp?: string | undefined;
  birthDate: string;
  /** Data do aniversário no ano do mês consultado (29/02 vira 28/02 em ano não bissexto). */
  date: string;
  day: number;
  /** Idade que o cliente completa nesse aniversário. */
  ageTurning: number;
  /** Chave de supressão da sugestão `birthday`: `<patientId>:<ano>`. */
  referenceKey: string;
  /** Já existe atividade `birthday`/`contacted` com a chave do ano. */
  congratulated: boolean;
}

export type SatisfactionSurveyInput = z.infer<
  typeof satisfactionSurveyInputSchema
>;

export type SatisfactionFilter = z.infer<typeof satisfactionFilterSchema>;

export interface SatisfactionSurvey {
  sourceMessageId?: string;
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  appointmentId?: string | undefined;
  score: number;
  comment?: string | undefined;
  /** Usuário que registrou a resposta. */
  actorUserId: string;
  createdAt: string;
}

export interface SatisfactionSummary {
  total: number;
  /** Notas 9–10. */
  promoters: number;
  /** Notas 7–8. */
  passives: number;
  /** Notas 0–6. */
  detractors: number;
  /** %promotores − %detratores, arredondado (Math.round); `null` sem respostas. */
  nps: number | null;
}

export interface SatisfactionReport {
  from: string;
  to: string;
  /** Mais recentes primeiro. */
  surveys: SatisfactionSurvey[];
  summary: SatisfactionSummary;
}

export type SatisfactionCategory = "promoter" | "passive" | "detractor";
