import { z } from "zod";
import type { PermissionKey } from "../permissions.js";
import {
  adminUserAgendaInputSchema,
  adminUserInputSchema,
  adminUserProfessionalInputSchema,
  adminUserUpdateSchema,
  appModuleSchema,
  auditHistoryQuerySchema,
  clinicSettingsInputSchema,
  loginSchema,
  ownPasswordChangeSchema,
  ownProfileUpdateSchema,
  professionalInputSchema,
  roomInputSchema,
  serviceBusinessLineSchema,
  serviceInputSchema,
  userRoleSchema,
} from "./model.js";

export type LoginInput = z.infer<typeof loginSchema>;

export type UserRole = z.infer<typeof userRoleSchema>;

export type AppModule = z.infer<typeof appModuleSchema>;

export type AdminUserInput = z.infer<typeof adminUserInputSchema>;

export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;

export type AdminUserAgendaInput = z.infer<typeof adminUserAgendaInputSchema>;

export type OwnProfileUpdate = z.infer<typeof ownProfileUpdateSchema>;

export type OwnPasswordChange = z.infer<typeof ownPasswordChangeSchema>;

/** Perfil do usuário logado (`GET /me/profile`). */
export interface OwnProfile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  jobTitle?: string;
  /** Foto em data URL; vazio = sem foto. */
  avatarDataUrl: string;
  /** Profissional da agenda ligado ao usuário (nome e cor exibidos na agenda). */
  professional: { id: string; fullName: string; color: string } | null;
}

export type ClinicSettingsInput = z.infer<typeof clinicSettingsInputSchema>;

export type ProfessionalInput = z.infer<typeof professionalInputSchema>;

export type RoomInput = z.infer<typeof roomInputSchema>;

export type ServiceInput = z.infer<typeof serviceInputSchema>;

export type AdminUserProfessionalInput = z.infer<
  typeof adminUserProfessionalInputSchema
>;

/**
 * Serviço com a linha no painel de vendas, como o cadastro tem hoje (inclusive serviço
 * inativo). `name` é o nome atual do cadastro (o vendido, se o serviço não existe mais);
 * `businessLine` `null` = sem classificação ou serviço não encontrado ("Outros" no painel).
 */
export interface ServiceLineRef {
  id: string;
  name: string;
  businessLine: ServiceBusinessLine | null;
}

/**
 * Tipo da venda nos relatórios: o `sourceType`, com o plano avulso (`planKind`) separado dos
 * demais planos.
 */
export type SaleType = "plan" | "single" | "product" | "service";

export interface SaleMovement {
  id: string;
  sourceId: string;
  /**
   * Origem da venda: plano (inclusive o plano avulso, com `planKind`), produto ou serviço de
   * comanda antiga (serviço não se vende mais; só aparece em comanda fechada antes da mudança).
   */
  sourceType: "plan" | "product" | "service";
  /** Só na venda de plano avulso (uma sessão de um serviço). */
  planKind?: "single";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  patientName: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  /**
   * Serviços da venda (painel de vendas): no serviço da comanda antiga, ele; no plano, todos os do
   * plano (o valor da venda conta inteiro em cada um, não se divide); no produto, vazio.
   */
  services: ServiceLineRef[];
  /**
   * Só na venda de produto: linha do produto no painel (`null` = sem classificação). Ausente
   * no plano e no serviço, cuja linha vem de cada item de `services`.
   */
  businessLine?: ServiceBusinessLine | null;
  receivableId?: string;
  /**
   * Desconto do cliente: no plano, o das cobranças (`amountInCents` é o valor do plano); no
   * produto, a parte da linha no desconto da venda (`amountInCents` já vem com ele abatido).
   */
  customerDiscountInCents?: number;
  /** Venda de plano recorrente com o 1º pagamento informado à mão (sem o cálculo proporcional). */
  manualFirstCharge?: true;
  /** Venda de produto: custo da linha (quantidade × custo unitário gravado na comanda). */
  costInCents?: number;
  /** Cancelamento: data da venda original (separa o cancelamento de venda de outro período). */
  saleOccurredAt?: string;
}

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  jobTitle?: string;
  /** Foto do perfil (só em `/me` e no login; ausente = sem foto). */
  avatarDataUrl?: string;
  /** Módulos efetivos (já resolvidos com `effectiveModules`). */
  modules: AppModule[];
  /** Módulos com edição efetiva (`effectiveEditModules`; sempre subconjunto de `modules`). */
  editModules: AppModule[];
  permissions: PermissionKey[];
}

export interface AdminUser extends UserSummary {
  clinicId: string;
  /** `true` quando há módulos ou edição gravados para o usuário comum (admin: sempre `false`). */
  customModules: boolean;
  /** WhatsApp com DDD, só dígitos (ausente = não informado). */
  whatsapp?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Acessa todas as filiais (admin: sempre `true`). */
  allBranches?: boolean;
  /** Filiais do usuário quando `allBranches` é `false`. */
  branchIds?: string[];
  /**
   * Acesso ao painel de vendas (dashboard externo). Permissão especial, fora do catálogo:
   * vale também para o admin, que não a recebe sozinho.
   */
  dashboardAccess?: boolean;
  /** Profissional da agenda ligado ao usuário (`professionals.user_id`). */
  professionalId?: string;
  professionalName?: string;
  /** Cadastro completo, inclusive quando está inativo. */
  professional?: Professional;
  /**
   * Percentual da regra de comissão do próprio usuário vigente hoje (fuso da clínica); não
   * depende do profissional ligado. Regras só do profissional (Financeiro) não aparecem aqui.
   */
  commissionPercentage?: number;
  /** Início de vigência (aaaa-mm-dd) da regra vigente hoje. */
  commissionEffectiveFrom?: string;
  /** Salário mensal (ausente = não recebe salário e não entra na folha). */
  salaryInCents?: number;
}

/** Dados públicos da clínica para qualquer usuário logado (logo, cabeçalho de documentos). */
export interface ClinicBranding {
  name: string;
  logoDataUrl: string;
  timezone: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  /** Chave Pix da clínica para as cobranças enviadas ao cliente. */
  pixKey?: string;
  /** Modelo da mensagem de cobrança Pix; vazio = texto padrão. */
  pixMessageTemplate?: string;
}

export interface ClinicSettings extends ClinicSettingsInput {
  id: string;
  updatedAt: string;
}

export interface AdminAuditEvent {
  id: string;
  module?: AppModule;
  description?: string;
  detailsRestricted?: boolean;
  clinicId?: string;
  actorUserId?: string;
  ipAddress?: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditPage {
  items: AdminAuditEvent[];
  nextCursor: string | null;
}

export type AuditHistoryQuery = z.infer<typeof auditHistoryQuerySchema>;

export type AuditHistoryFilters = Omit<AuditHistoryQuery, "cursor">;

export interface HistoryActor {
  id: string;
  name: string;
}

export interface PermissionMatrixItem {
  role: UserRole;
  /** Rótulos (pt-BR) dos módulos que o tipo vê por padrão (usuário comum novo: nenhum). */
  modules: string[];
  /** Rótulos (pt-BR) dos módulos que o tipo edita por padrão (subconjunto de `modules`). */
  editModules: string[];
}

export interface Professional extends ProfessionalInput {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  /** WhatsApp do usuário ligado (só em `GET /professionals`; ausente = não informado). */
  whatsapp?: string;
  id: string;
  clinicId: string;
  active: boolean;
}

export interface Room extends RoomInput {
  /** Filial a que pertence (ver `branches`). */
  branchId?: string;
  id: string;
  clinicId: string;
  active: boolean;
}

export type ServiceBusinessLine = z.infer<typeof serviceBusinessLineSchema>;

export interface Service extends Omit<ServiceInput, "businessLine"> {
  id: string;
  /** Linha no painel de vendas; `null` = sem classificação ("Outros" no painel). */
  businessLine: ServiceBusinessLine | null;
  clinicId: string;
  active: boolean;
  /**
   * Valor de uma sessão avulsa: o do plano avulso ativo do serviço (`singlePlanSessionPrices`).
   * Vem só na lista `GET /services`; `null` quando o serviço não tem plano avulso.
   */
  singleSessionPriceInCents?: number | null;
}

export interface ClientSessionsRankingEntry {
  patientId: string;
  patientName: string;
  /** Atendimentos concluídos no período (data no fuso da clínica). */
  completedSessions: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
