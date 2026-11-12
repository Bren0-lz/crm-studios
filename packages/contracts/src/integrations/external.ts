import { z } from "zod";
import type {
  ServiceBusinessLine,
  ServiceLineRef,
  UserSummary,
} from "../administration/types.js";
import { serviceBusinessLines } from "../administration/business-line.js";
import type { GroupEnrollment, GroupWeeklySlot } from "../agenda/types.js";
import type { PaymentMethod } from "../finance/types.js";
import type { Patient, PatientStatus } from "../patients/types.js";
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

/** Plano ativo do cliente na ficha (`GET /external/v1/patients/:id`). */
export interface ExternalPatientPlan {
  id: string;
  name: string;
  branchId?: string;
  validFrom: string;
  validUntil?: string;
}

/** Turma em que o cliente está inscrito (ativo ou na lista de espera da turma). */
export interface ExternalPatientGroup {
  groupId: string;
  groupName: string;
  branchId?: string;
  status: GroupEnrollment["status"];
}

/**
 * Dados cadastrais e de contato da ficha do cliente no CRM (só com acesso a Clientes). Campos do
 * perfil sem valor não vêm.
 */
export interface ExternalPatientRecord
  extends Pick<
    Patient,
    | "nickname"
    | "residenceType"
    | "address"
    | "addressNumber"
    | "complement"
    | "buildingName"
    | "block"
    | "floor"
    | "unit"
    | "referencePoint"
    | "neighborhood"
    | "city"
    | "state"
    | "postalCode"
    | "gender"
    | "guardianName"
    | "guardianPhone"
    | "occupation"
    | "source"
    | "level"
    | "clientSince"
    | "imageConsent"
    | "interests"
    | "cpf"
    | "birthDate"
    | "email"
    | "whatsapp"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "emergencyContactWhatsapp"
    | "discount"
  > {
  recordNumber: string;
  status: PatientStatus;
  inactiveAt?: string;
  phone: string;
  /** Etiquetas do cliente, com as automáticas da ficha do CRM ("Pagamento atrasado" só com Financeiro). */
  tags: string[];
  /**
   * O cliente é da rede: as filiais são as dos planos ativos e das turmas dele, sem repetir, na
   * ordem do cadastro de filiais.
   */
  branches: { id: string; name: string }[];
  activePlans: ExternalPatientPlan[];
  groups: ExternalPatientGroup[];
  createdAt: string;
}

/**
 * Ficha do cliente (`GET /external/v1/patients/:id`). O nome vem sempre; `record` só para quem
 * tem acesso a Clientes (`patients.view`).
 */
export interface ExternalPatientDetails {
  id: string;
  fullName: string;
  record?: ExternalPatientRecord;
}

/** De onde vem a cobrança: plano, comanda (com atendimento), venda de produto ou lançamento manual. */
export const externalPaymentOrigins = ["plan", "tab", "sale", "manual"] as const;
export type ExternalPaymentOrigin = (typeof externalPaymentOrigins)[number];

/**
 * Situação da cobrança: em aberto (no prazo), vencida, paga, parcialmente paga (paga com saldo
 * ainda em aberto, ver `balanceReceivableId`) e cancelada (inclusive venda/comanda/plano
 * cancelado, com a baixa estornada).
 */
export const externalPaymentStatuses = [
  "open",
  "overdue",
  "paid",
  "partially_paid",
  "cancelled",
] as const;
export type ExternalPaymentStatus = (typeof externalPaymentStatuses)[number];

/** Linha no filtro: as do cadastro e `other` (sem classificação, "Outros" no painel). */
export const externalPaymentLines = [...serviceBusinessLines, "other"] as const;
export type ExternalPaymentLine = (typeof externalPaymentLines)[number];

/** Baixa ou estorno de uma cobrança. */
export interface ExternalPaymentEvent {
  id: string;
  /** Data e hora (ISO 8601) da baixa/estorno, com a correção de data se houver. */
  occurredAt: string;
  /** Sempre positivo (no estorno, o valor estornado). */
  amountInCents: number;
  paymentMethod?: PaymentMethod;
  /** Só na baixa: desconto dado nela (no pagamento picado, só na última forma). */
  discountInCents?: number;
}

/** Cobrança do cliente no histórico de pagamentos (`GET /external/v1/patients/:id/payments`). */
export interface ExternalPatientPayment {
  /** Id da conta a receber. */
  id: string;
  branchId?: string;
  origin: ExternalPaymentOrigin;
  /** Plano ou comanda de origem (ausente no lançamento manual). */
  sourceId?: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  /** Vencimento (aaaa-mm-dd). */
  dueDate: string;
  /** Valor atual da cobrança (já com os descontos; paga, o valor quitado nela). */
  amountInCents: number;
  /** Desconto do cliente na cobrança + desconto dado na baixa em vigor (0 = sem desconto). */
  discountInCents: number;
  status: ExternalPaymentStatus;
  /** Teve baixa estornada (a cobrança voltou a ficar em aberto ou foi cancelada). */
  reversed: boolean;
  /** Baixas menos estornos. */
  paidInCents: number;
  /** Paga: data e hora da baixa em vigor e a forma. */
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  /** Baixa parcial: a cobrança do saldo que ela gerou. */
  balanceReceivableId?: string;
  /** Saldo de baixa parcial: a cobrança de origem (origem, serviços e produtos vêm dela). */
  balanceOfReceivableId?: string;
  /** Baixas, da mais antiga à mais recente (inclusive as estornadas depois). */
  payments: ExternalPaymentEvent[];
  reversals: ExternalPaymentEvent[];
  /** Serviços de origem (os do plano ou os atendimentos da comanda), com a linha do cadastro. */
  services: ServiceLineRef[];
  /** Linhas dos produtos da comanda/venda, sem repetir; `null` = produto sem classificação. */
  productLines: (ServiceBusinessLine | null)[];
}

export interface ExternalPatientPayments {
  patientId: string;
  patientName: string;
  /** Data de referência (aaaa-mm-dd, fuso da clínica) da situação "vencida". */
  referenceDate: string;
  /** Somas das cobranças filtradas. */
  totals: {
    count: number;
    amountInCents: number;
    paidInCents: number;
    openInCents: number;
    overdueInCents: number;
  };
  /** Do vencimento mais recente ao mais antigo. */
  payments: ExternalPatientPayment[];
}

/** Lista na query: `a,b` ou o parâmetro repetido. */
function queryList<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value])
        .flatMap((item) => item.split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)));
}

/**
 * Filtros do histórico de pagamentos; sem nenhum, todas as cobranças. Em cada filtro, basta um
 * dos valores; entre filtros, valem todos. `status=reversed` traz as cobranças com baixa
 * estornada. Período: `from`/`to` (aaaa-mm-dd, inclusive) pelo vencimento (`dateField=due`,
 * padrão) ou pela data das baixas (`dateField=paid`).
 */
export const externalPatientPaymentsQuerySchema = z
  .object({
    status: queryList([...externalPaymentStatuses, "reversed"]),
    origin: queryList(externalPaymentOrigins),
    serviceId: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) =>
        (Array.isArray(value) ? value : value === undefined ? [] : [value])
          .flatMap((item) => item.split(","))
          .map((item) => item.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.uuid())),
    businessLine: queryList(externalPaymentLines),
    dateField: z.enum(["due", "paid"]).default("due"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "A data inicial precisa ser anterior à final.",
    path: ["to"],
  });

export type ExternalPatientPaymentsQuery = z.infer<
  typeof externalPatientPaymentsQuerySchema
>;

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

/**
 * Filial que a pessoa logada no painel pode escolher (`GET /external/v1/branches`). O id vai no
 * cabeçalho `X-Branch-Id`; sem ele, a leitura é de todas as filiais da pessoa.
 */
export interface ExternalBranch {
  id: string;
  name: string;
  active: boolean;
  isDefault: boolean;
}

/** Índice da API: clínica, chave usada e rotas disponíveis. */
export interface ExternalApiIndex {
  version: "v1";
  clinic: { id: string; name: string };
  key: { id: string; name: string; scopes: IntegrationScope[] };
  endpoints: ExternalEndpoint[];
}
