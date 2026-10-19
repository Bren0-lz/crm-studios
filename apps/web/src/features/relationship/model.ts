import type {
  ContactOutcome,
  ContactReason,
  ContactSuggestion,
  LeadStage,
} from "@crm/contracts";
import { type RelationshipSettings, fillPatientMessage } from "@crm/contracts";
import { api } from "../../api";

export function addDaysToIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function birthdayMessage(
  settings: RelationshipSettings | null,
  patientName: string,
) {
  return fillPatientMessage(settings?.messages.birthday ?? "", patientName);
}

export const contactOutcomeLabels: Record<ContactOutcome, string> = {
  contacted: "Contato feito",
  no_answer: "Não atendeu",
  scheduled: "Agendou horário",
  not_interested: "Sem interesse",
  snoozed: "Adiar contato",
  dismissed: "Descartar sugestão",
};

export const contactReasonLabels: Record<ContactReason, string> = {
  birthday: "Aniversário",
  single_no_return: "Veio uma vez",
  plan_expiring: "Plano acabando",
  low_balance: "Saldo baixo",
  expired_with_balance: "Vencido com saldo",
  treatment_paused: "Tratamento parado",
  repeated_no_show: "Faltas seguidas",
  former_client: "Ex-cliente",
  overdue_payment: "Pagamento atrasado",
  nps_detractor: "Avaliação baixa",
};

export const leadStages: Array<{
  value: LeadStage;
  label: string;
  hint: string;
}> = [
  {
    value: "new_contact",
    label: "Novos",
    hint: "Leads recém-cadastrados aparecem aqui.",
  },
  {
    value: "contacted",
    label: "Em contato",
    hint: "Mova para cá quem já recebeu o primeiro contato.",
  },
  {
    value: "evaluation",
    label: "Avaliação",
    hint: "Leads com avaliação ou aula experimental marcada.",
  },
  {
    value: "proposal",
    label: "Proposta",
    hint: "Leads que receberam proposta de plano.",
  },
  {
    value: "won",
    label: "Ganhos",
    hint: "Leads convertidos em cliente ficam aqui.",
  },
  {
    value: "lost",
    label: "Perdidos",
    hint: "Leads perdidos ficam aqui, com o motivo.",
  },
];

export function markBirthdaySent(patientId: string, referenceKey: string) {
  return api.createContactActivity({
    patientId,
    reason: "birthday",
    referenceKey,
    outcome: "contacted",
  });
}

export function suggestionKey(suggestion: ContactSuggestion) {
  return `${suggestion.patientId}:${suggestion.reason}:${suggestion.referenceKey}`;
}

/**
 * Um grupo por cliente, na ordem de prioridade da lista (o mais urgente primeiro). Cliente em
 * várias categorias aparece uma vez, com todos os motivos.
 */
export function groupSuggestionsByPatient(suggestions: ContactSuggestion[]) {
  const groups = new Map<string, ContactSuggestion[]>();
  for (const suggestion of suggestions) {
    const group = groups.get(suggestion.patientId);
    if (group) group.push(suggestion);
    else groups.set(suggestion.patientId, [suggestion]);
  }
  return [...groups.values()];
}
