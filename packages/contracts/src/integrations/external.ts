import { z } from "zod";
import type {
  ServiceBusinessLine,
  ServiceLineRef,
  UserSummary,
} from "../administration/types.js";
import type { GroupEnrollment, GroupWeeklySlot } from "../agenda/types.js";
import type { IntegrationScope } from "./types.js";

/**
 * Formatos estáveis da API externa `/external/v1` (dashboard de vendas). Mudanças nas telas
 * internas não alteram estes formatos; campo novo entra como opcional.
 */

/** Linha da tabela de turmas: ocupação, vagas, lista de espera e faturamento mensal. */
export interface ExternalGroupRow {
  id: string;
  branchId?: string;
  name: string;
  active: boolean;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  roomId: string;
  roomName: string;
  /** Resumo legível dos horários ("Seg e Qua às 18:00"). */
  schedule: string;
  weeklySlots: GroupWeeklySlot[];
  capacity: number;
  enrolled: number;
  freeSeats: number;
  waitlistCount: number;
  /**
   * Nomes dos matriculados ativos (sem a lista de espera), na ordem de inscrição. Só o nome,
   * como no detalhe da turma: vem com ou sem acesso a Clientes.
   */
  memberNames: string[];
  /** Matriculados ÷ capacidade, de 0 a 100. */
  occupancyPercent: number;
  /** Encontros por mês: horários semanais × 4 semanas. */
  sessionsPerMonth: number;
  /** Soma mensal dos planos ativos dos matriculados para o serviço da turma. */
  monthlyRevenueInCents: number;
  /** Atual + vagas livres × ticket médio (turma cheia). */
  potentialMonthlyRevenueInCents: number;
  /**
   * Linha do serviço da turma no painel (Studio ou Estética); `null` = serviço sem classificação
   * ou não encontrado ("Outros" no painel).
   */
  businessLine: ServiceBusinessLine | null;
  /**
   * Matriculados ativos com parcela vencida (mesma regra de `GET /external/v1/overdue`). Só vem
   * para quem tem acesso ao Financeiro, junto de `overdueInCents`.
   */
  overdueMembers?: number;
  /** Soma das parcelas vencidas desses matriculados (todas as do cliente, não só da turma). */
  overdueInCents?: number;
}

export interface ExternalGroupsTotals {
  groups: number;
  capacity: number;
  enrolled: number;
  freeSeats: number;
  waitlistCount: number;
  occupancyPercent: number;
  monthlyRevenueInCents: number;
  potentialMonthlyRevenueInCents: number;
}

export interface ExternalGroupsOverview {
  /** Data de referência (aaaa-mm-dd, fuso da clínica) dos planos ativos. */
  referenceDate: string;
  totals: ExternalGroupsTotals;
  groups: ExternalGroupRow[];
}

/**
 * Atraso do inscrito: parcelas vencidas do cliente (todas, não só da turma; mesma regra de
 * `GET /external/v1/overdue`).
 */
export interface MemberOverdue {
  amountInCents: number;
  installments: number;
  /** Vencimento da parcela vencida mais antiga (aaaa-mm-dd). */
  oldestDueDate: string;
  daysOverdue: number;
}

/**
 * Pessoa inscrita na turma (ativa ou na lista de espera da turma). O contato (`phone`,
 * `whatsapp`, `email`) só vem para quem tem acesso a Clientes; sem ele, só o nome.
 */
export interface ExternalGroupMember {
  enrollmentId: string;
  patientId: string;
  patientName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  status: GroupEnrollment["status"];
  queuePosition?: number;
  startsOn: string;
  /** Valor mensal do plano para a turma; null sem plano ativo (ou na lista de espera). */
  monthlyInCents: number | null;
  /** Só para inscritos ativos com parcela vencida e para quem tem acesso ao Financeiro. */
  overdue?: MemberOverdue;
}

export interface ExternalGroupDetails extends ExternalGroupRow {
  members: ExternalGroupMember[];
  waitlist: ExternalGroupMember[];
}

export const externalGroupsQuerySchema = z.object({
  /** Inclui turmas desativadas (padrão: só as ativas). */
  includeInactive: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const externalPatientsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Cliente resumido para buscar e vender pelo dashboard. */
export interface ExternalPatientSummary {
  id: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  tags: string[];
  activePlans: { id: string; name: string; validUntil?: string }[];
  activeGroups: { groupId: string; groupName: string; status: GroupEnrollment["status"] }[];
}

/** Faixa de atraso da inadimplência, em dias corridos desde a parcela mais antiga. */
export type ExternalOverdueBand = "1-7" | "8-30" | "31-60" | "60+";

export function externalOverdueBand(daysOverdue: number): ExternalOverdueBand {
  if (daysOverdue <= 7) return "1-7";
  if (daysOverdue <= 30) return "8-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

/** Cliente com parcelas em aberto já vencidas (soma de todas as parcelas vencidas). */
export interface ExternalOverdueRow {
  patientId: string;
  patientName: string;
  phone?: string;
  /** Turmas em que o cliente está matriculado, com a lotação (para saber se a vaga tem fila). */
  groups: {
    groupId: string;
    groupName: string;
    full: boolean;
    waitlistCount: number;
  }[];
  /**
   * Serviços de onde vêm as parcelas vencidas (os do plano e os atendimentos da comanda), sem
   * repetir, com a linha do cadastro. Parcela avulsa (lançada à mão) e saldo de baixa parcial de
   * comanda não têm vínculo com a origem e não entram.
   */
  services: ServiceLineRef[];
  /**
   * Linhas dos produtos dessas parcelas (comanda), sem repetir; `null` = produto sem
   * classificação. Vazio quando nenhuma parcela vencida vem de produto.
   */
  productLines: (ServiceBusinessLine | null)[];
  amountInCents: number;
  installments: number;
  /** Vencimento da parcela vencida mais antiga (aaaa-mm-dd). */
  oldestDueDate: string;
  daysOverdue: number;
  band: ExternalOverdueBand;
}

/** Inadimplência por cliente (`GET /external/v1/overdue`), do mais atrasado ao menos. */
export interface ExternalOverdueReport {
  /** Data de referência (aaaa-mm-dd, fuso da clínica) do cálculo do atraso. */
  referenceDate: string;
  rows: ExternalOverdueRow[];
}

/**
 * Cabeçalho com o token de usuário do painel de vendas (`POST /external/v1/auth/login`): com
 * ele, a chamada da API externa age como esse usuário (permissões, filiais e histórico dele).
 */
export const EXTERNAL_USER_TOKEN_HEADER = "x-crm-user-token";

/** Login do painel de vendas: só entra quem tem `dashboardAccess` (nem o admin, sem ela). */
export interface ExternalLoginResult {
  token: string;
  expiresAt: string;
  user: Pick<
    UserSummary,
    "id" | "fullName" | "email" | "role" | "modules" | "permissions"
  >;
}

export interface ExternalEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  scope: IntegrationScope;
  description: string;
}

/** Índice da API: clínica, chave usada e rotas disponíveis. */
export interface ExternalApiIndex {
  version: "v1";
  clinic: { id: string; name: string };
  key: { id: string; name: string; scopes: IntegrationScope[] };
  endpoints: ExternalEndpoint[];
}
