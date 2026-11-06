import {
  type AdminUser,
  type Professional,
  type PermissionKey,
  type ServiceBusinessLine,
  effectiveEditModules,
  effectivePermissions,
  permissionEditModules,
  permissionKeySchema,
  permissionModules,
} from "@crm/contracts";
import type { AuthenticatedUser } from "../../../repository.js";
import { localToday } from "../sql.js";
import { json } from "./common.js";

export interface UserRow {
  sessionVersion?: number;
  id: string;
  clinicId: string;
  fullName: string;
  email: string;
  role: AuthenticatedUser["role"];
  jobTitle: string | null;
  whatsapp: string | null;
  modules: string[] | null;
  editModules: string[] | null;
  permissions: string[];
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  allBranches: boolean;
  branchIds: string[];
  dashboardAccess: boolean;
}

export const userColumns = `id, clinic_id AS "clinicId", full_name AS "fullName", email, role,
  job_title AS "jobTitle", whatsapp, modules, edit_modules AS "editModules", permissions,
  password_hash AS "passwordHash", session_version AS "sessionVersion", active,
  created_at AS "createdAt", updated_at AS "updatedAt", all_branches AS "allBranches",
  dashboard_access AS "dashboardAccess",
  (SELECT JSON_ARRAYAGG(ub.branch_id) FROM user_branches ub WHERE ub.user_id = users.id) AS "branchIds"`;

/** Normaliza as colunas JSON/booleanas da linha de usuário (vindas de subconsulta, chegam como texto). */
export function normalizeUserRow<T extends UserRow>(row: T): T {
  return {
    ...row,
    modules: json<string[] | null>(row.modules),
    editModules: json<string[] | null>(row.editModules),
    permissions: json<string[] | null>(row.permissions) ?? [],
    active: Boolean(row.active),
    allBranches: Boolean(row.allBranches),
    dashboardAccess: Boolean(row.dashboardAccess),
    branchIds: [...(json<string[] | null>(row.branchIds) ?? [])].sort(),
  };
}

export interface ProfessionalRow {
  branchId?: string;
  id: string;
  clinicId: string;
  fullName: string;
  crefito: string;
  specialty: string;
  color: string;
  active: boolean;
}

export interface RoomRow {
  branchId?: string;
  id: string;
  clinicId: string;
  name: string;
  capacity: number;
  active: boolean;
}

export interface ServiceRow {
  id: string;
  clinicId: string;
  name: string;
  durationMinutes: number;
  active: boolean;
  professionalIds: string[];
  roomIds: string[];
  businessLine: ServiceBusinessLine;
}

export function present(value: string | null) {
  return value ?? undefined;
}

export function rowPermissions(row: UserRow): PermissionKey[] {
  return effectivePermissions(
    row.role,
    row.permissions.filter(
      (key): key is PermissionKey => permissionKeySchema.safeParse(key).success,
    ),
  );
}

export function mapAdminUser(raw: UserRow): AdminUser {
  const row = normalizeUserRow(raw);
  return {
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    ...(row.whatsapp ? { whatsapp: row.whatsapp } : {}),
    permissions: rowPermissions(row),
    modules: permissionModules(rowPermissions(row)),
    editModules:
      row.role === "admin"
        ? effectiveEditModules("admin")
        : permissionEditModules(rowPermissions(row)),
    customModules: row.role !== "admin" && row.permissions.length > 0,
    allBranches: row.role === "admin" || row.allBranches,
    branchIds: row.role === "admin" || row.allBranches ? [] : row.branchIds,
    dashboardAccess: row.dashboardAccess,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface AdminUserRow extends UserRow {
  professionalId: string | null;
  professionalName: string | null;
  professional: Professional | null;
  commissionPercentage: string | null;
  commissionEffectiveFrom: string | null;
  /** Salário do colaborador da folha ligado ao usuário (0 = não recebe). */
  salaryInCents?: number | null;
}

/**
 * Usuários com o profissional ligado (`professionals.user_id`) e a regra de comissão DO USUÁRIO
 * (`commission_rules.user_id`) vigente hoje no fuso da clínica (ativa, maior vigência que já
 * começou). `$1` = clínica; para um só usuário, filtre por `u.id` no WHERE.
 */
export const adminUserSelect = `SELECT u.*, p.id AS "professionalId", p.full_name AS "professionalName",
    (SELECT JSON_OBJECT('id',pr.id,'clinicId',pr.clinic_id,'branchId',pr.branch_id,'fullName',pr.full_name,
      'crefito',COALESCE(pr.crefito,''),'specialty',pr.specialty,'color',pr.color,'active',pr.active = 1)
      FROM professionals pr WHERE pr.id = p.id) AS professional,
    (SELECT pe.base_salary_in_cents FROM payroll_employees pe
      WHERE pe.clinic_id = u."clinicId" AND pe.user_id = u.id) AS "salaryInCents",
    cr.percentage AS "commissionPercentage", cr.effective_from AS "commissionEffectiveFrom"
  FROM (SELECT ${userColumns} FROM users WHERE clinic_id = $1) u
  LEFT JOIN professionals p ON p.id = (SELECT pr.id FROM professionals pr
    WHERE pr.clinic_id = u."clinicId" AND pr.user_id = u.id
    ORDER BY pr.created_at, pr.id LIMIT 1)
  LEFT JOIN commission_rules cr ON cr.id = (SELECT r.id FROM commission_rules r
    WHERE r.clinic_id = u."clinicId" AND r.user_id = u.id AND r.active AND r.service_id IS NULL AND r.kind <> 'fixed'
      AND r.effective_from <= ${localToday()} AND (r.effective_until IS NULL OR r.effective_until >= ${localToday()})
    ORDER BY r.effective_from DESC LIMIT 1)`;

export function mapAuthenticatedUser(row: UserRow): AuthenticatedUser {
  return {
    ...mapAdminUser(row),
    passwordHash: row.passwordHash,
    sessionVersion: row.sessionVersion ?? 0,
  };
}
