import type {
  Appointment,
  AppointmentStatus,
  CommunicationChannel,
  CommunicationKind,
  ContactActivity,
  ContactOutcome,
  ContactReason,
  OutboundMessage,
  PatientPlan,
  PatientTimelineEntry,
  PaymentMethod,
  ReceivedPayment,
  SatisfactionSurvey,
} from "@crm/contracts";

/** Dados brutos do cliente; o repositório já filtra por clínica. */
export interface PatientTimelineSources {
  appointments: Appointment[];
  plans: PatientPlan[];
  /** Mesma fonte do relatório de vendas (pagamentos e estornos por data do evento). */
  payments: ReceivedPayment[];
  contacts: ContactActivity[];
  messages: OutboundMessage[];
  surveys: SatisfactionSurvey[];
}

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Finalizado",
  no_show: "Não compareceu",
  excused_absence: "Ausência justificada",
  professional_absence: "Ausência profissional",
  cancelled: "Cancelado",
};

const contactReasonLabels: Record<ContactReason, string> = {
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

const contactOutcomeLabels: Record<ContactOutcome, string> = {
  contacted: "Contato feito",
  no_answer: "Não atendeu",
  scheduled: "Agendou horário",
  not_interested: "Sem interesse",
  snoozed: "Adiar contato",
  dismissed: "Descartar sugestão",
};

const messageKindLabels: Record<CommunicationKind, string> = {
  appointment_reminder: "Lembrete de atendimento",
  payment_reminder: "Lembrete de pagamento",
  manual: "Mensagem",
  birthday_reminder: "Lembrete de aniversário",
  satisfaction_followup: "Acompanhamento de NPS",
};

const channelLabels: Record<CommunicationChannel, string> = {
  whatsapp: "WhatsApp",
  email: "e-mail",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
};

/**
 * Junta o histórico do cliente, do mais recente ao mais antigo. Só usa dados
 * de agenda, comerciais e de relacionamento — nada de conteúdo clínico.
 */
export function buildPatientTimeline(
  patientId: string,
  sources: PatientTimelineSources,
): PatientTimelineEntry[] {
  const entries: PatientTimelineEntry[] = [];
  // Atendimentos de lead (sem `patientId`) nunca entram no histórico do cliente.
  const own = <T extends { patientId?: string | undefined }>(items: T[]) =>
    items.filter((item) => item.patientId === patientId);

  for (const item of own(sources.appointments))
    entries.push({
      id: `appointment:${item.id}`,
      kind: "appointment",
      occurredAt: item.startsAt,
      title: `${item.serviceName} com ${item.professionalName}`,
      detail: appointmentStatusLabels[item.status],
      status: item.status,
    });

  for (const plan of own(sources.plans)) {
    const renewed = Boolean(plan.renewedFromPlanId);
    entries.push({
      id: `${renewed ? "plan_renewed" : "plan_created"}:${plan.id}`,
      kind: renewed ? "plan_renewed" : "plan_created",
      occurredAt: plan.createdAt,
      title: `${renewed ? "Plano renovado" : "Plano contratado"}: ${plan.name}`,
      detail: plan.serviceName,
      amountInCents: plan.totalValueInCents,
    });
    if (plan.cancelledAt)
      entries.push({
        id: `plan_cancelled:${plan.id}`,
        kind: "plan_cancelled",
        occurredAt: plan.cancelledAt,
        title: `Plano cancelado: ${plan.name}`,
        detail: plan.serviceName,
        amountInCents: -(plan.cancelledValueInCents ?? plan.totalValueInCents),
      });
  }

  for (const item of own(sources.payments)) {
    const reversal = item.kind === "reversal";
    entries.push({
      id: `${reversal ? "payment_reversal" : "payment"}:${item.id}`,
      kind: reversal ? "payment_reversal" : "payment",
      occurredAt: item.occurredAt,
      title: reversal ? "Estorno de pagamento" : "Pagamento recebido",
      detail: item.paymentMethod
        ? `${item.description} · ${paymentMethodLabels[item.paymentMethod]}`
        : item.description,
      amountInCents: item.amountInCents,
    });
  }

  for (const item of own(sources.contacts))
    entries.push({
      id: `contact:${item.id}`,
      kind: "contact",
      occurredAt: item.createdAt,
      title: `Contato: ${contactReasonLabels[item.reason]}`,
      detail: item.notes
        ? `${contactOutcomeLabels[item.outcome]} · ${item.notes}`
        : contactOutcomeLabels[item.outcome],
      status: item.outcome,
    });

  for (const item of own(sources.messages))
    entries.push({
      id: `message:${item.id}`,
      kind: "message",
      occurredAt: item.sentAt ?? item.scheduledFor,
      title: `${messageKindLabels[item.kind]} por ${channelLabels[item.channel]}`,
      detail: item.body,
      status: item.status,
    });

  for (const item of own(sources.surveys))
    entries.push({
      id: `satisfaction:${item.id}`,
      kind: "satisfaction",
      occurredAt: item.createdAt,
      title: `Pesquisa de satisfação: nota ${item.score}`,
      ...(item.comment ? { detail: item.comment } : {}),
      score: item.score,
    });

  return entries.sort(
    (a, b) =>
      Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
      a.id.localeCompare(b.id),
  );
}
