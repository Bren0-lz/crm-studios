import { z } from "zod";
import type { PermissionKey } from "../permissions.js";
import {
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
  serviceInputSchema,
  userRoleSchema,
} from "./model.js";

export type LoginInput = z.infer<typeof loginSchema>;

export type UserRole = z.infer<typeof userRoleSchema>;

export type AppModule = z.infer<typeof appModuleSchema>;

export type AdminUserInput = z.infer<typeof adminUserInputSchema>;

export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;

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

export interface SaleMovement {
  id: string;
  sourceId: string;
  sourceType: "plan" | "product" | "service";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  patientName: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  receivableId?: string;
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
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Acessa todas as filiais (admin: sempre `true`). */
  allBranches?: boolean;
  /** Filiais do usuário quando `allBranches` é `false`. */
  branchIds?: string[];
  /** Profissional da agenda ligado ao usuário (`professionals.user_id`). */
  professionalId?: string;
  professionalName?: string;
  /**
   * Percentual da regra de comissão do próprio usuário vigente hoje (fuso da clínica); não
   * depende do profissional ligado. Regras só do profissional (Financeiro) não aparecem aqui.
   */
  commissionKind?: "percentage" | "fixed";
  commissionFixedAmountInCents?: number;
  commissionPercentage?: number;
  /** Início de vigência (aaaa-mm-dd) da regra vigente hoje. */
  commissionEffectiveFrom?: string;
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

export interface Service extends ServiceInput {
  id: string;
  clinicId: string;
  active: boolean;
}

export interface ClientSessionsRankingEntry {
  patientId: string;
  patientName: string;
  /** Atendimentos concluídos no período (data no fuso da clínica). */
  completedSessions: number;
}

export interface ClientRevenueRankingEntry {
  patientId: string;
  patientName: string;
  /** Pagamentos menos estornos no período (data do evento no fuso da clínica). */
  receivedInCents: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
