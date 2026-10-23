import {
  type AdminUser,
  type Professional,
  type PermissionKey,
  effectiveEditModules,
  effectivePermissions,
  permissionEditModules,
  permissionKeySchema,
  permissionModules,
} from "@crm/contracts";
import type { AuthenticatedUser } from "../../../repository.js";

export interface UserRow {
  sessionVersion?: number;
  id: string;
  clinicId: string;
  fullName: string;
  email: string;
  role: AuthenticatedUser["role"];
  jobTitle: string | null;
  modules: string[] | null;
  editModules: string[] | null;
  permissions: string[];
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  allBranches: boolean;
  branchIds: string[];
}

export const userColumns = `id, clinic_id AS "clinicId", full_name AS "fullName", email, role,
  job_title AS "jobTitle", modules, edit_modules AS "editModules", permissions,
  password_hash AS "passwordHash", session_version AS "sessionVersion", active,
  created_at AS "createdAt", updated_at AS "updatedAt", all_branches AS "allBranches",
  ARRAY(SELECT ub.branch_id::text FROM user_branches ub WHERE ub.user_id = users.id
    ORDER BY ub.branch_id) AS "branchIds"`;

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
  priceInCents: number;
  color: string;
  active: boolean;
  professionalIds: string[];
  roomIds: string[];
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

export function mapAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    permissions: rowPermissions(row),
    modules: permissionModules(rowPermissions(row)),
    editModules:
      row.role === "admin"
        ? effectiveEditModules("admin")
        : permissionEditModules(rowPermissions(row)),
    customModules: row.role !== "admin" && row.permissions.length > 0,
    allBranches: row.role === "admin" || row.allBranches,
    branchIds: row.role === "admin" || row.allBranches ? [] : row.branchIds,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface AdminUserRow extends UserRow {
  professionalId: string | null;
  professionalName: string | null;
  professional: Professional | null;
  commissionKind?: "fixed" | "percentage" | null;
  commissionFixedAmountInCents?: number | null;
  commissionPercentage: string | null;
  commissionEffectiveFrom: string | null;
}

/**
 * Usuários com o profissional ligado (`professionals.user_id`) e a regra de comissão DO USUÁRIO
 * (`commission_rules.user_id`) vigente hoje no fuso da clínica (ativa, maior vigência que já
 * começou). `$1` = clínica; para um só usuário, filtre por `u.id` no WHERE.
 */
export const adminUserSelect = `SELECT u.*, p.id AS "professionalId", p.full_name AS "professionalName", p.professional,
    cr.kind AS "commissionKind",cr.fixed_amount_in_cents AS "commissionFixedAmountInCents",cr.percentage AS "commissionPercentage", cr.effective_from::text AS "commissionEffectiveFrom"
  FROM (SELECT ${userColumns} FROM users WHERE clinic_id = $1) u
  JOIN clinics c ON c.id = u."clinicId"
  LEFT JOIN LATERAL (SELECT pr.id, pr.full_name, json_build_object(
    'id',pr.id,'clinicId',pr.clinic_id,'branchId',pr.branch_id,'fullName',pr.full_name,
    'crefito',COALESCE(pr.crefito,''),'specialty',pr.specialty,'color',pr.color,'active',pr.active) AS professional FROM professionals pr
    WHERE pr.clinic_id = u."clinicId" AND pr.user_id = u.id
    ORDER BY pr.created_at, pr.id LIMIT 1) p ON true
  LEFT JOIN LATERAL (SELECT r.percentage,r.kind,r.fixed_amount_in_cents, r.effective_from FROM commission_rules r
    WHERE r.clinic_id = u."clinicId" AND r.user_id = u.id AND r.active AND r.service_id IS NULL
      AND r.effective_from <= (now() AT TIME ZONE c.timezone)::date AND (r.effective_until IS NULL OR r.effective_until>=(now() AT TIME ZONE c.timezone)::date)
    ORDER BY r.effective_from DESC LIMIT 1) cr ON true`;

export function mapAuthenticatedUser(row: UserRow): AuthenticatedUser {
  return {
    ...mapAdminUser(row),
    passwordHash: row.passwordHash,
    sessionVersion: row.sessionVersion ?? 0,
  };
}
