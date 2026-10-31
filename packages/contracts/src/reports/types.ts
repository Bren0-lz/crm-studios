import { z } from "zod";
import type {
  ClientSessionsRankingEntry,
  SaleMovement,
} from "../administration/types.js";
import type {
  Appointment,
  AppointmentReportBreakdown,
  AppointmentStatus,
  AppointmentVisitType,
} from "../agenda/types.js";
import type { CommercialSourceBreakdown } from "../commercial/types.js";
import type {
  ClientAgeBandCount,
  PatientWithoutReturn,
} from "../patients/types.js";
import {
  managementReportFilterSchema,
  notificationKindSchema,
  notificationPreferencesSchema,
  retentionReportFilterSchema,
  salesReportFilterSchema,
} from "./model.js";

export type ManagementReportFilter = z.infer<
  typeof managementReportFilterSchema
>;

export type SalesReportFilter = z.infer<typeof salesReportFilterSchema>;

/** Linha das tabelas de vendas por tipo e por item (só vendas feitas no período). */
export interface SalesBreakdownRow {
  key: string;
  label: string;
  sourceType: SaleMovement["sourceType"];
  /** Planos e comandas distintos. */
  salesCount: number;
  quantity: number;
  grossInCents: number;
  /** Cancelamentos (até o fim do período) dessas mesmas vendas. */
  cancelledInCents: number;
  customerDiscountInCents: number;
  netInCents: number;
  /** Só produto: custo das unidades não canceladas. */
  costInCents?: number;
}

export interface SalesBuyer {
  patientId: string;
  patientName: string;
  salesCount: number;
  netInCents: number;
  /** Primeira compra da história do cliente caiu no período. */
  firstPurchase: boolean;
}

export interface SalesReportPeriod {
  from: string;
  to: string;
  grossSalesInCents: number;
  /** Todos os cancelamentos registrados no período (planilha). */
  cancelledSalesInCents: number;
  /** Cancelamentos de vendas feitas no próprio período: abatem o líquido. */
  cancelledInPeriodSalesInCents: number;
  /** Cancelamentos de vendas de períodos anteriores: informativo, fora do líquido. */
  cancelledPriorSalesInCents: number;
  /** Vendas brutas menos os cancelamentos das vendas do próprio período. */
  netSalesInCents: number;
  /** Planos e comandas vendidos no período. */
  salesCount: number;
  /** Vendas brutas ÷ número de vendas (0 sem vendas). */
  averageTicketInCents: number;
  buyers: number;
  /** Compradores cuja primeira compra da história foi no período. */
  newBuyers: number;
  byType: SalesBreakdownRow[];
  byItem: SalesBreakdownRow[];
  /** Até 10 clientes com maior valor líquido comprado no período. */
  topBuyers: SalesBuyer[];
  /** Contas a receber das vendas do período (sem as canceladas). */
  payment: {
    paidInCents: number;
    openInCents: number;
    overdueInCents: number;
  };
  /** Descontos do cliente nas vendas de plano do período (informativo). */
  customerDiscountInCents?: number;
}

export interface SalesReport {
  month: string;
  generatedAt: string;
  current: SalesReportPeriod;
  previousComparable: SalesReportPeriod;
  changeInCents: number;
  changePercent: number | null;
  sales: SaleMovement[];
  patientsWithoutReturn: PatientWithoutReturn[];
}

/** Vendas entre datas inclusivas, comparadas ao intervalo de mesmo tamanho anterior. */
export interface SalesPeriodReport {
  from: string;
  to: string;
  generatedAt: string;
  summary: SalesReportPeriod;
  /** Intervalo de mesmo tamanho imediatamente anterior. */
  previous: SalesReportPeriod;
  changeInCents: number;
  changePercent: number | null;
  sales: SaleMovement[];
  patientsWithoutReturn: PatientWithoutReturn[];
  /** Base exclusiva da lista de clientes sem retorno. */
  returnReference: { from: string; to: string };
}

export type CampaignReportKind = "manual" | "automatic";

/** Uma campanha no relatório de campanhas (`GET /reports/campaigns`). */
export interface CampaignReportRow {
  campaignId: string;
  kind: CampaignReportKind;
  name: string;
  /** Modelo de mensagem (manual) ou evento que dispara a campanha (automática). */
  origin: string;
  createdAt: string;
  createdByName: string;
  /** Automática: ligada agora. Manual: ainda em andamento (sem data de conclusão). */
  active: boolean;
  /** Manual: destinatários da campanha. Automática: mensagens tratadas no período. */
  total: number;
  sent: number;
  skipped: number;
  /** Só campanhas manuais; nas automáticas a fila do dia fica em Comunicação. */
  pending: number;
  /** Agendamentos com a promoção da campanha no período, sem os cancelados. */
  redemptions: number;
  /** Campanha automática promocional (tem promoção para usar ao agendar). */
  promotional?: boolean | undefined;
}

/**
 * Campanhas do período: manuais criadas entre as datas (com a situação atual de cada
 * destinatário) e automáticas com mensagens marcadas ou promoções usadas nas datas,
 * além das automáticas ligadas.
 */
export interface CampaignReport {
  from: string;
  to: string;
  generatedAt: string;
  summary: {
    manualCampaigns: number;
    automaticCampaigns: number;
    sent: number;
    skipped: number;
    pending: number;
    redemptions: number;
  };
  campaigns: CampaignReportRow[];
}

/** Uma mensagem da planilha do relatório de campanhas. */
export interface CampaignReportMessage {
  campaignId: string;
  campaignName: string;
  kind: CampaignReportKind;
  patientName: string;
  phone: string;
  status: "pending" | "sent" | "skipped";
  /** Etapa da campanha automática ou motivo de não envio. */
  detail: string;
  handledAt?: string | undefined;
  handledByName?: string | undefined;
  /** Mensagem da campanha automática ("No dia", "2 dias antes"…). */
  step?: string | undefined;
  /** Data do evento (aaaa-mm-dd), quando houver. */
  eventDate?: string | undefined;
  /** Motivo de não envio (escolhido pela equipe ou apontado pelo sistema) e observação. */
  reason?: string | undefined;
  /** Texto da mensagem (personalizado para o cliente). */
  message?: string | undefined;
  /** Ainda não marcada e prevista na fila de hoje (campanha automática). */
  upcoming?: boolean | undefined;
  /** Só campanhas promocionais: validade e uso da promoção por este cliente. */
  promotion?:
    | {
        validUntil?: string | undefined;
        redeemedOn?: string | undefined;
        appointmentStatus?: AppointmentStatus | undefined;
      }
    | undefined;
}

export type DashboardViewSummary = Pick<DashboardSummary, "date"> &
  Partial<Omit<DashboardSummary, "date">> & {
    /** Atendimentos passados ainda agendados/confirmados (qualquer data). */
    pendingFinalization?: number | undefined;
  };

/**
 * Sino do cabeçalho (`GET /notifications`, QM13): só contagens. Cada grupo aparece apenas
 * para quem vê o módulo correspondente; sem o módulo, o campo fica ausente.
 */
export interface NotificationsSummary {
  /** Data de referência (aaaa-mm-dd, fuso da clínica). */
  date: string;
  /** Aniversariantes de hoje ainda sem parabéns registrados (módulo relationship). */
  birthdaysToday?: number | undefined;
  /** Parcelas em aberto com vencimento antes de hoje (módulo finance). */
  overdueReceivables?: number | undefined;
  /** Contas de despesas fixas no prazo de aviso ou vencidas, ainda não pagas (módulo finance). */
  recurringPayablesDue?: number | undefined;
  /** Atendimentos passados ainda agendados/confirmados (módulo agenda). */
  pendingFinalization?: number | undefined;
  /** Tarefas comerciais em aberto já vencidas, de leads em andamento (módulo crm). */
  overdueLeadTasks?: number | undefined;
  /** Clientes cujo contato adiado voltou para a lista (módulo relationship). */
  snoozedContactsDue?: number | undefined;
  /** Planos pausados com retorno previsto até hoje (módulo plans). */
  pauseReturnsDue?: number | undefined;
  /** Campanhas automáticas com mensagens pendentes hoje (módulo communications). */
  autoCampaigns?:
    Array<{ id: string; name: string; pending: number }> | undefined;
}

export type NotificationKind = z.infer<typeof notificationKindSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export interface DashboardSummary {
  date: string;
  appointmentsToday: number;
  /** Todos os status do dia, exceto cancelados. */
  nonCancelledAppointmentsToday: number;
  /** Agendados e confirmados do dia, inclusive horários já passados. */
  pendingToday: number;
  /** Agendados do dia que ainda não foram confirmados. */
  awaitingConfirmationToday: number;
  completedToday: number;
  patientsActive: number;
  noShowsThisMonth: number;
  nextAppointments: Appointment[];
}

export type RetentionReportFilter = z.infer<typeof retentionReportFilterSchema>;

/** Retenção de clientes num mês. Atendimentos de lead ficam de fora. */
export interface RetentionMonth {
  /** Mês (AAAA-MM). */
  month: string;
  /** Clientes com atendimento concluído no mês ou plano vigente em algum dia do mês. */
  activeClients: number;
  /** Clientes cuja primeira atividade (atendimento concluído ou plano) caiu no mês. */
  newClients: number;
  /** Ativos no mês anterior que não estão ativos no mês. */
  lostClients: number;
  /**
   * (ativos do mês anterior − perdidos) ÷ ativos do mês anterior, entre 0 e 1;
   * `null` quando o mês anterior não teve ativos.
   */
  retentionRate: number | null;
  /** Planos cancelados no mês (pela data do cancelamento). */
  cancelledPlans: number;
  /** Soma do valor em aberto cancelado junto com esses planos. */
  cancelledValueInCents: number;
}

export interface RetentionReport {
  generatedAt: string;
  /** Período pedido (aaaa-mm-dd), já com os padrões aplicados. */
  from: string;
  to: string;
  /** Mês de `from` e mês de `to` limitado ao mês atual da clínica. */
  startMonth: string;
  endMonth: string;
  months: RetentionMonth[];
  totals: {
    newClients: number;
    lostClients: number;
    cancelledPlans: number;
    cancelledValueInCents: number;
  };
}

export type ClientReportFilter = RetentionReportFilter;

export interface ClientReport {
  generatedAt: string;
  /** Período pedido (aaaa-mm-dd), já com os padrões aplicados. */
  from: string;
  to: string;
  /** Até 20 clientes com mais sessões concluídas no período. */
  topBySessions: ClientSessionsRankingEntry[];
  /**
   * Clientes ativos no período (atendimento concluído ou plano vigente em
   * algum dia do período) por faixa etária, com a idade na data `to`.
   */
  activeClients: number;
  ageDistribution: ClientAgeBandCount[];
}

/**
 * Produção da equipe no período, lida pelo repositório (`listTeamProduction`): sessões
 * concluídas (atendimento individual com cliente ou presença em turma) e comissões das
 * competências que o período toca.
 */
export interface TeamProductionSources {
  sessions: Array<{
    professionalId: string;
    professionalName: string;
    serviceId: string;
    serviceName: string;
    /** Plano que teve a sessão consumida, quando houver. */
    planId?: string;
  }>;
  /** Comissões geradas nas competências do período. */
  commissions: Array<{
    professionalId: string;
    professionalName: string;
    competence: string;
    amountInCents: number;
    status: "open" | "paid";
  }>;
  /** Previsão para sessões das competências que ainda não tiveram comissão gerada. */
  pendingCommissions: Array<{
    professionalId: string;
    professionalName: string;
    amountInCents: number;
  }>;
}

export interface TeamFinanceCommission {
  paidInCents: number;
  openInCents: number;
  /** Previsto para sessões concluídas ainda sem comissão gerada. */
  pendingInCents: number;
  totalInCents: number;
}

/** Valores da equipe, serviços e turmas (permissão `reports.team_finance`). */
export interface TeamFinanceReport {
  /** Competências (AAAA-MM) somadas na comissão. */
  commissionMonths: string[];
  byProfessional: Array<{
    id: string;
    name: string;
    completedSessions: number;
    generatedInCents: number;
    commission: TeamFinanceCommission;
  }>;
  byService: Array<{
    id: string;
    name: string;
    completedSessions: number;
    generatedInCents: number;
    averageTicketInCents: number;
  }>;
  byGroup: Array<{
    id: string;
    name: string;
    serviceName: string;
    professionalName: string;
    capacity: number;
    activeEnrollments: number;
    /** % inteiro de vagas ocupadas. */
    occupancyRate: number;
    /** Aulas por mês (horários semanais × 4). */
    monthlySessions: number;
    monthlyRevenueInCents: number;
    /** Quanto renderia com todas as vagas ocupadas. */
    potentialRevenueInCents: number;
    idleRevenueInCents: number;
  }>;
}

export interface ManagementReport {
  from: string;
  to: string;
  generatedAt: string;
  appointments: {
    total: number;
    completed: number;
    noShows: number;
    cancelled: number;
    attendanceRate: number;
    // Atendimentos do período (inclusive cancelados) por tipo.
    byVisitType: Record<AppointmentVisitType, number>;
  };
  // Experimentais e avaliações (visitType trial/evaluation) com início no período.
  trials: {
    // Não canceladas (agendadas, confirmadas, concluídas ou faltas).
    scheduled: number;
    // Com status concluído.
    completed: number;
    // Concluídas cujo cliente teve plano criado entre o início do atendimento
    // e 30 dias depois (contagem por atendimento).
    converted: number;
    // converted / completed em % inteiro; 0 sem concluídas.
    conversionRate: number;
  };
  plans: {
    active: number;
    availableSessions: number;
    consumedInPeriod: number;
  };
  finance: {
    openInCents: number;
    overdueInCents: number;
  };
  commercial: {
    leadsCreated: number;
    won: number;
    lost: number;
    conversionRate: number;
    averageFirstResponseMinutes: number;
  };
  byProfessional: AppointmentReportBreakdown[];
  byService: AppointmentReportBreakdown[];
  bySource: CommercialSourceBreakdown[];
  /** Só para quem tem `reports.team_finance`. */
  teamFinance?: TeamFinanceReport;
  /** Recebimento e caixa ficam no Financeiro; vendas de produto, em Vendas. */
  profitability: {
    byService: Array<{
      id: string;
      name: string;
      completedAppointments: number;
      revenueInCents: number;
      commissionsInCents: number;
      contributionInCents: number;
      contributionMargin: number;
    }>;
    operational: {
      groupOccupancyRate: number;
      activeGroupSeats: number;
      totalGroupCapacity: number;
      waitlistCount: number;
      lowStockCount: number;
    };
  };
}
