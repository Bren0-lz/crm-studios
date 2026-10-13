import { z } from "zod";
import type {
  ClientRevenueRankingEntry,
  ClientSessionsRankingEntry,
  SaleMovement,
} from "../administration/types.js";
import type {
  Appointment,
  AppointmentReportBreakdown,
  AppointmentVisitType,
} from "../agenda/types.js";
import type { CommercialSourceBreakdown } from "../commercial/types.js";
import type { ReceivedPayment } from "../finance/types.js";
import type {
  ClientAgeBandCount,
  PatientWithoutReturn,
} from "../patients/types.js";
import {
  managementReportFilterSchema,
  retentionReportFilterSchema,
  salesReportFilterSchema,
} from "./model.js";

export type ManagementReportFilter = z.infer<
  typeof managementReportFilterSchema
>;

export type SalesReportFilter = z.infer<typeof salesReportFilterSchema>;

export interface SalesReportPeriod {
  from: string;
  to: string;
  grossSalesInCents: number;
  cancelledSalesInCents: number;
  netSalesInCents: number;
  receivedInCents: number;
  attendedPatients: number;
}

export interface SalesReport {
  month: string;
  generatedAt: string;
  current: SalesReportPeriod;
  previousComparable: SalesReportPeriod;
  changeInCents: number;
  changePercent: number | null;
  sales: SaleMovement[];
  payments: ReceivedPayment[];
  patientsWithoutReturn: PatientWithoutReturn[];
}

export type DashboardViewSummary = Pick<DashboardSummary, "date"> &
  Partial<Omit<DashboardSummary, "date">>;

export interface DashboardSummary {
  date: string;
  appointmentsToday: number;
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
  /** Até 20 clientes com mais recebimentos líquidos (positivos) no período. */
  topByRevenue: ClientRevenueRankingEntry[];
  /**
   * Clientes ativos no período (atendimento concluído ou plano vigente em
   * algum dia do período) por faixa etária, com a idade na data `to`.
   */
  activeClients: number;
  ageDistribution: ClientAgeBandCount[];
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
    paidInPeriodInCents: number;
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
  profitability: {
    dre: {
      serviceRevenueInCents: number;
      productRevenueInCents: number;
      grossRevenueInCents: number;
      productCostInCents: number;
      grossProfitInCents: number;
      operatingExpensesInCents: number;
      commissionsInCents: number;
      netResultInCents: number;
      netMargin: number;
    };
    byService: Array<{
      id: string;
      name: string;
      completedAppointments: number;
      revenueInCents: number;
      commissionsInCents: number;
      contributionInCents: number;
      contributionMargin: number;
    }>;
    byProduct: Array<{
      id: string;
      name: string;
      unitsSold: number;
      revenueInCents: number;
      costInCents: number;
      grossProfitInCents: number;
      grossMargin: number;
    }>;
    operational: {
      groupOccupancyRate: number;
      activeGroupSeats: number;
      totalGroupCapacity: number;
      waitlistCount: number;
      lowStockCount: number;
      productUnitsSold: number;
      averageReceiptInCents: number;
    };
  };
}
