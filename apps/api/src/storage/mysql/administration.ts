import { saveUserAgenda, userSaveError } from "./user-agenda.js";
import { syncUserPayroll } from "./user-payroll.js";
import {
  type AutoFinalizationSettings,
  defaultProLaboreSettings,
  type ProLaboreSettings,
  type ProLaboreSettingsInput,
  type AutoFinalizationSettingsInput,
  type AdminAuditPage,
  type AdminUserInput,
  type AdminUserUpdate,
  type AuditHistoryFilters,
  type ClinicSettings,
  type ClinicSettingsInput,
  type HistoryActor,
  type NavTabLabel,
  type NavTabLabelsInput,
  type IntegrationKey,
  type IntegrationKeyInput,
  type IntegrationScope,
  type NotificationPreferences,
  type OwnProfile,
  type OwnProfileUpdate,
  type Professional,
  type ProfessionalInput,
  type RoomInput,
  type ServiceInput,
  defaultAutoFinalizationSettings,
  type PaymentMethodInstallments,
  type PaymentMethodSettingsInput,
  resolvePaymentMethodSettings,
  permissionEditModules,
  permissionModules,
  resolveNavTabLabels,
  resolveNotificationPreferences,
  resolvePermissionInput,
} from "@crm/contracts";
import type { Pool, PoolClient } from "../../infrastructure/mysql-client.js";
import {
  DomainError,
  lastAdminError,
  type CommissionRecalculationRequest,
} from "../../repository.js";
import { userCommissionDrafts } from "../../modules/finance/commission-recalculation.js";
import { createMysqlCommissionRecalculation } from "./commission-recalculation.js";
import type { MysqlRepositoryContext } from "./context.js";
import { historyEventsTable } from "./system-history.js";
import { branchOrDefault, writeAndRead } from "./sql.js";
import { randomUUID } from "node:crypto";
import {
  type AdminUserRow,
  type ProfessionalRow,
  type RoomRow,
  type ServiceRow,
  type UserRow,
  adminUserSelect,
  hasDatabaseCode,
  mapAdminUser,
  mapAdminUserWithCommission,
  mapAuthenticatedUser,
  rowPermissions,
  userColumns,
  branchClause,
  json,
} from "./helpers.js";

type ClinicSettingsRow = {
  logoDataUrl?: string | null;
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  pixKey: string | null;
  pixMessageTemplate: string | null;
  timezone: string;
  updatedAt: Date;
};

const clinicSettingsColumns = `id, name, legal_name AS "legalName", tax_id AS "taxId", phone,
  logo_data_url AS "logoDataUrl",email, address, pix_key AS "pixKey",
  pix_message_template AS "pixMessageTemplate", timezone, updated_at AS "updatedAt"`;

type AutoFinalizationRow = {
  enabled: boolean;
  delayMinutes: number;
  updatedAt: Date | null;
};

const autoFinalizationColumns = `auto_finalization_enabled AS enabled,
  auto_finalization_delay_minutes AS "delayMinutes",
  auto_finalization_updated_at AS "updatedAt"`;

type ProLaboreRow = {
  basisPoints: number;
  base: ProLaboreSettings["base"];
  updatedAt: Date | null;
};

const proLaboreColumns = `pro_labore_basis_points AS "basisPoints",
  pro_labore_base AS base, pro_labore_updated_at AS "updatedAt"`;

function mapProLabore(row: ProLaboreRow | undefined): ProLaboreSettings {
  if (!row) return { ...defaultProLaboreSettings };
  return {
    percentage: row.basisPoints / 100,
    base: row.base,
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {}),
  };
}

function mapAutoFinalization(
  row: AutoFinalizationRow | undefined,
): AutoFinalizationSettings {
  if (!row) return { ...defaultAutoFinalizationSettings };
  return {
    enabled: row.enabled,
    delayMinutes: row.delayMinutes,
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {}),
  };
}

type PaymentMethodRow = {
  methods: PaymentMethodInstallments[] | null;
  updatedAt: Date | null;
};

const paymentMethodColumns = `payment_method_settings AS methods,
  payment_method_settings_updated_at AS "updatedAt"`;

function mapPaymentMethods(row: PaymentMethodRow | undefined) {
  return resolvePaymentMethodSettings(
    row?.methods,
    row?.updatedAt?.toISOString(),
  );
}

function mapClinicSettings(row: ClinicSettingsRow): ClinicSettings {
  return {
    ...(row.logoDataUrl !== undefined && row.logoDataUrl !== null
      ? { logoDataUrl: row.logoDataUrl }
      : {}),
    id: row.id,
    name: row.name,
    legalName: row.legalName ?? "",
    taxId: row.taxId ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    pixKey: row.pixKey ?? "",
    pixMessageTemplate: row.pixMessageTemplate ?? "",
    timezone: row.timezone,
    updatedAt: row.updatedAt.toISOString(),
  };
}

type OwnProfileRow = {
  id: string;
  fullName: string;
  email: string;
  role: OwnProfile["role"];
  jobTitle: string | null;
  avatarDataUrl: string | null;
  professionalId: string | null;
  professionalName: string | null;
  professionalColor: string | null;
};

async function selectOwnProfile(
  client: Pool | PoolClient,
  clinicId: string,
  userId: string,
): Promise<OwnProfile | null> {
  const result = await client.query<OwnProfileRow>(
    `SELECT u.id, u.full_name AS "fullName", u.email, u.role, u.job_title AS "jobTitle",
       u.avatar_data_url AS "avatarDataUrl", p.id AS "professionalId",
       p.full_name AS "professionalName", p.color AS "professionalColor"
     FROM users u
     LEFT JOIN professionals p ON p.clinic_id = u.clinic_id AND p.user_id = u.id
     WHERE u.clinic_id = $1 AND u.id = $2`,
    [clinicId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
    avatarDataUrl: row.avatarDataUrl ?? "",
    professional: row.professionalId
      ? {
          id: row.professionalId,
          fullName: row.professionalName!,
          color: row.professionalColor!,
        }
      : null,
  };
}

export function createAdministrationRepository(
  repositoryContext: MysqlRepositoryContext,
) {
  const commissions = createMysqlCommissionRecalculation(repositoryContext);
  return {
    async revokeUserSessions(
      clinicId: string,
      actorUserId: string,
      userId: string,
    ) {
      await repositoryContext.inTransaction(async (client) => {
        const result = await client.query(
          "UPDATE users SET session_version=session_version+1 WHERE clinic_id=$1 AND id=$2",
          [clinicId, userId],
        );
        if (!result.rowCount)
          throw new DomainError(
            "USER_NOT_FOUND",
            "Usuário não encontrado.",
            404,
          );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "user.sessions_revoked",
          "user",
          userId,
          {},
        );
      });
    },
    async findUserByEmail(email: string) {
      const result = await repositoryContext.pool.query<UserRow>(
        `
        SELECT ${userColumns}
        FROM users
        WHERE lower(email) = lower($1) AND active = true
        ORDER BY created_at
        LIMIT 1
      `,
        [email],
      );
      return result.rows[0] ? mapAuthenticatedUser(result.rows[0]) : null;
    },

    async findUserById(clinicId: string, userId: string) {
      const result = await repositoryContext.pool.query<UserRow>(
        `
        SELECT ${userColumns}
        FROM users
        WHERE clinic_id = $1 AND id = $2 AND active = true
      `,
        [clinicId, userId],
      );
      return result.rows[0] ? mapAuthenticatedUser(result.rows[0]) : null;
    },

    async listAdminUsers(clinicId: string) {
      const result = await repositoryContext.pool.query<AdminUserRow>(
        `${adminUserSelect} ORDER BY u."fullName"`,
        [clinicId],
      );
      return result.rows.map(mapAdminUserWithCommission);
    },

    async setAdminUserProfessional(
      clinicId: string,
      actorUserId: string,
      userId: string,
      professionalId: string | null,
    ) {
      try {
        return await repositoryContext.inTransaction(async (client) => {
          const user = await client.query(
            `SELECT id FROM users WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
            [clinicId, userId],
          );
          if (!user.rows[0]) return null;
          if (professionalId) {
            const professional = await client.query<{ userId: string | null }>(
              `SELECT user_id AS "userId" FROM professionals
             WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
              [clinicId, professionalId],
            );
            if (!professional.rows[0])
              throw new DomainError(
                "PROFESSIONAL_NOT_FOUND",
                "Profissional não encontrado.",
                404,
              );
            const linkedUserId = professional.rows[0].userId;
            if (linkedUserId && linkedUserId !== userId)
              throw new DomainError(
                "PROFESSIONAL_ALREADY_LINKED",
                "Este profissional já está ligado a outro usuário.",
                409,
              );
          }
          const previous = await client.query<{ id: string }>(
            `SELECT id FROM professionals WHERE clinic_id = $1 AND user_id = $2
           ORDER BY created_at, id FOR UPDATE`,
            [clinicId, userId],
          );
          const previousProfessionalId = previous.rows[0]?.id ?? null;
          if (previousProfessionalId !== professionalId) {
            // Um usuário tem no máximo um profissional: ligar outro desliga o anterior.
            await client.query(
              `UPDATE professionals SET user_id = NULL, updated_at = NOW(6)
             WHERE clinic_id = $1 AND user_id = $2`,
              [clinicId, userId],
            );
            if (professionalId)
              await client.query(
                `UPDATE professionals SET user_id = $3, updated_at = NOW(6)
               WHERE clinic_id = $1 AND id = $2`,
                [clinicId, professionalId, userId],
              );
            await repositoryContext.addAdminAudit(
              client,
              clinicId,
              actorUserId,
              "users.professional_updated",
              "user",
              userId,
              { professionalId, previousProfessionalId },
            );
            await syncUserPayroll(
              repositoryContext,
              client,
              clinicId,
              actorUserId,
              userId,
              undefined,
            );
          }
          return repositoryContext.findAdminUser(client, clinicId, userId);
        });
      } catch (error) {
        // Índice único parcial (clinic_id, user_id): corrida com outra ligação simultânea.
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "PROFESSIONAL_ALREADY_LINKED",
            "Este profissional já está ligado a outro usuário.",
            409,
          );
        throw error;
      }
    },

    async createAdminUser(
      clinicId: string,
      actorUserId: string,
      input: AdminUserInput,
      passwordHash: string,
      recalculation?: CommissionRecalculationRequest,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
          clinicId,
        ]);
        const permissions = resolvePermissionInput(input.role, input);
        const result = await writeAndRead<UserRow>(
          client,
          `INSERT INTO users (clinic_id, full_name, email, role, password_hash, job_title, modules,
           edit_modules, permissions, whatsapp, id, dashboard_access)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, $11, $12)`,
          [
            clinicId,
            input.fullName,
            input.email,
            input.role,
            passwordHash,
            input.jobTitle?.trim() || null,
            input.role === "admin" ? null : permissionModules(permissions),
            input.role === "admin" ? null : permissionEditModules(permissions),
            input.role === "admin" ? [] : permissions,
            input.whatsapp || null,
            randomUUID(),
            input.dashboardAccess ?? false,
          ],
          `SELECT ${userColumns} FROM users WHERE id = $11`,
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "user.created",
          "user",
          result.rows[0]!.id,
          { email: input.email, role: input.role },
        );
        const created = mapAdminUser(result.rows[0]!);
        if (created.dashboardAccess)
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "users.dashboard_access_updated",
            "user",
            created.id,
            { dashboardAccess: true, previousDashboardAccess: false },
          );
        if (created.customModules)
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "users.permissions_updated",
            "user",
            created.id,
            {
              modules: created.modules,
              editModules: created.editModules,
              custom: true,
              previousPermissions: [],
              permissions: created.permissions,
            },
          );
        if (input.commission)
          await repositoryContext.insertUserCommissionRule(
            client,
            clinicId,
            actorUserId,
            created.id,
            input.commission,
          );
        for (const item of input.serviceCommissions ?? [])
          await repositoryContext.insertUserCommissionRule(
            client,
            clinicId,
            actorUserId,
            created.id,
            item,
          );
        if (input.branchAccess)
          await repositoryContext.setUserBranchAccess(
            client,
            clinicId,
            actorUserId,
            created.id,
            input.branchAccess,
          );
        await saveUserAgenda(
          repositoryContext,
          client,
          clinicId,
          actorUserId,
          created.id,
          input,
        );
        await syncUserPayroll(
          repositoryContext,
          client,
          clinicId,
          actorUserId,
          created.id,
          input.salaryInCents ?? null,
        );
        // Usuário novo ligado a um profissional que já tem comissões: recalcula pelas regras novas.
        if (recalculation)
          await commissions.apply(
            client,
            clinicId,
            actorUserId,
            { userId: created.id },
            userCommissionDrafts(input),
            recalculation.expectedDigest,
          );
        const withCommission =
          input.commission ||
          input.serviceCommissions?.length ||
          input.branchAccess ||
          input.professional ||
          input.salaryInCents
            ? await repositoryContext.findAdminUser(
                client,
                clinicId,
                created.id,
              )
            : null;
        await client.query("COMMIT");
        return withCommission ?? created;
      } catch (error) {
        await client.query("ROLLBACK");
        userSaveError(error);
      } finally {
        client.release();
      }
    },

    async updateAdminUser(
      clinicId: string,
      actorUserId: string,
      userId: string,
      input: AdminUserUpdate,
      recalculation?: CommissionRecalculationRequest,
    ) {
      if (userId === actorUserId && !input.active)
        throw new DomainError(
          "CANNOT_DEACTIVATE_SELF",
          "Você não pode desativar o próprio acesso.",
          409,
        );
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
          clinicId,
        ]);
        const current = await client.query<UserRow>(
          `SELECT ${userColumns} FROM users WHERE clinic_id = $1 AND id = $2 FOR UPDATE`,
          [clinicId, userId],
        );
        if (!current.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        if (
          current.rows[0].role === "admin" &&
          current.rows[0].active &&
          (input.role !== "admin" || !input.active)
        ) {
          // Trava os demais admins ativos: duas trocas simultâneas não deixam a clínica sem admin.
          const otherAdmins = await client.query(
            `SELECT id FROM users
           WHERE clinic_id = $1 AND id <> $2 AND role = 'admin' AND active
           FOR UPDATE`,
            [clinicId, userId],
          );
          if (otherAdmins.rowCount === 0) throw lastAdminError();
        }
        const previousPermissions = rowPermissions(current.rows[0]);
        const nextPermissions = resolvePermissionInput(
          input.role,
          input,
          current.rows[0].role === "admin" ? [] : previousPermissions,
        );
        const nextModules =
          input.role === "admin" ? null : permissionModules(nextPermissions);
        const nextEditModules =
          input.role === "admin"
            ? null
            : permissionEditModules(nextPermissions);
        const jobTitle =
          input.jobTitle === undefined
            ? current.rows[0].jobTitle
            : input.jobTitle.trim() || null;
        const whatsapp =
          input.whatsapp === undefined
            ? current.rows[0].whatsapp
            : input.whatsapp || null;
        const previousDashboardAccess = Boolean(
          current.rows[0].dashboardAccess,
        );
        const dashboardAccess =
          input.dashboardAccess ?? previousDashboardAccess;
        const result = await writeAndRead<UserRow>(
          client,
          `UPDATE users SET full_name = $3, role = $4, active = $5, job_title = $6,
           modules = $7, edit_modules = $8, permissions = $9, whatsapp = $10,
           dashboard_access = $11, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            userId,
            input.fullName,
            input.role,
            input.active,
            jobTitle,
            nextModules,
            nextEditModules,
            input.role === "admin" ? [] : nextPermissions,
            whatsapp,
            dashboardAccess,
          ],
          `SELECT ${userColumns} FROM users WHERE clinic_id = $1 AND id = $2`,
        );
        if (!result.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const updated = mapAdminUser(result.rows[0]);
        if (dashboardAccess !== previousDashboardAccess)
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "users.dashboard_access_updated",
            "user",
            userId,
            { dashboardAccess, previousDashboardAccess },
          );
        if (
          JSON.stringify(previousPermissions) !==
          JSON.stringify(nextPermissions)
        )
          await repositoryContext.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "users.permissions_updated",
            "user",
            userId,
            {
              modules: updated.modules,
              editModules: updated.editModules,
              custom: updated.customModules,
              previousPermissions,
              permissions: updated.permissions,
            },
          );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "user.updated",
          "user",
          userId,
          { role: input.role, active: input.active },
        );
        if (input.branchAccess)
          await repositoryContext.setUserBranchAccess(
            client,
            clinicId,
            actorUserId,
            userId,
            input.branchAccess,
          );
        if (input.commission)
          await repositoryContext.insertUserCommissionRule(
            client,
            clinicId,
            actorUserId,
            userId,
            input.commission,
          );
        for (const item of input.serviceCommissions ?? [])
          await repositoryContext.insertUserCommissionRule(
            client,
            clinicId,
            actorUserId,
            userId,
            item,
          );
        await saveUserAgenda(
          repositoryContext,
          client,
          clinicId,
          actorUserId,
          userId,
          input,
        );
        await syncUserPayroll(
          repositoryContext,
          client,
          clinicId,
          actorUserId,
          userId,
          input.salaryInCents,
        );
        if (recalculation)
          await commissions.apply(
            client,
            clinicId,
            actorUserId,
            { userId },
            userCommissionDrafts(input),
            recalculation.expectedDigest,
          );
        const withCommission = await repositoryContext.findAdminUser(
          client,
          clinicId,
          userId,
        );
        await client.query("COMMIT");
        return withCommission ?? updated;
      } catch (error) {
        await client.query("ROLLBACK");
        userSaveError(error);
      } finally {
        client.release();
      }
    },

    async resetAdminUserPassword(
      clinicId: string,
      actorUserId: string,
      userId: string,
      passwordHash: string,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `UPDATE users SET password_hash = $3, session_version=session_version+1, updated_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
          [clinicId, userId, passwordHash],
        );
        if (!result.rowCount) {
          await client.query("COMMIT");
          return false;
        }
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "user.password_reset",
          "user",
          userId,
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getOwnProfile(clinicId: string, userId: string) {
      return selectOwnProfile(repositoryContext.pool, clinicId, userId);
    },

    async updateOwnProfile(
      clinicId: string,
      userId: string,
      input: OwnProfileUpdate,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE users SET full_name = $3,
             avatar_data_url = CASE WHEN $4 THEN NULLIF($5, '') ELSE avatar_data_url END,
             updated_at = NOW(6)
           WHERE clinic_id = $1 AND id = $2`,
          [
            clinicId,
            userId,
            input.fullName,
            input.avatarDataUrl !== undefined,
            input.avatarDataUrl ?? "",
          ],
        );
        if (!updated.rowCount) return null;
        const professional = await writeAndRead<{ fullName: string }>(
          client,
          `UPDATE professionals SET full_name = COALESCE($3, full_name),
             color = COALESCE($4, color), updated_at = NOW(6)
           WHERE clinic_id = $1 AND user_id = $2`,
          [
            clinicId,
            userId,
            input.agendaName ?? null,
            input.agendaColor ?? null,
          ],
          `SELECT full_name AS "fullName" FROM professionals WHERE clinic_id = $1 AND user_id = $2`,
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          userId,
          "user.profile_updated",
          "user",
          userId,
          {
            fullName: input.fullName,
            ...(professional.rows[0]
              ? { agendaName: professional.rows[0].fullName }
              : {}),
          },
        );
        return selectOwnProfile(client, clinicId, userId);
      });
    },

    async getClinicSettings(clinicId: string) {
      const result = await repositoryContext.pool.query<ClinicSettingsRow>(
        `SELECT ${clinicSettingsColumns}
       FROM clinics WHERE id = $1`,
        [clinicId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return mapClinicSettings(row);
    },

    async getAutoFinalizationSettings(
      clinicId: string,
    ): Promise<AutoFinalizationSettings> {
      const result = await repositoryContext.pool.query<AutoFinalizationRow>(
        `SELECT ${autoFinalizationColumns} FROM clinics WHERE id = $1`,
        [clinicId],
      );
      return mapAutoFinalization(result.rows[0]);
    },

    async getProLaboreSettings(clinicId: string): Promise<ProLaboreSettings> {
      const result = await repositoryContext.pool.query<ProLaboreRow>(
        `SELECT ${proLaboreColumns} FROM clinics WHERE id = $1`,
        [clinicId],
      );
      return mapProLabore(result.rows[0]);
    },

    async updateProLaboreSettings(
      clinicId: string,
      actorUserId: string,
      input: ProLaboreSettingsInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await writeAndRead<ProLaboreRow>(
          client,
          `UPDATE clinics SET pro_labore_basis_points = $2, pro_labore_base = $3,
             pro_labore_updated_at = NOW(6)
           WHERE id = $1`,
          [clinicId, Math.round(input.percentage * 100), input.base],
          `SELECT ${proLaboreColumns} FROM clinics WHERE id = $1`,
          [clinicId],
        );
        if (!result.rowCount)
          throw new DomainError(
            "CLINIC_NOT_FOUND",
            "Clínica não encontrada.",
            404,
          );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "clinic.pro_labore_updated",
          "clinic",
          clinicId,
          { percentage: input.percentage, base: input.base },
        );
        return mapProLabore(result.rows[0]);
      });
    },

    async updateAutoFinalizationSettings(
      clinicId: string,
      actorUserId: string,
      input: AutoFinalizationSettingsInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const result = await writeAndRead<AutoFinalizationRow>(
          client,
          `UPDATE clinics SET auto_finalization_enabled = $2,
             auto_finalization_delay_minutes = $3, auto_finalization_updated_at = NOW(6)
           WHERE id = $1`,
          [clinicId, input.enabled, input.delayMinutes],
          `SELECT ${autoFinalizationColumns} FROM clinics WHERE id = $1`,
        );
        if (!result.rowCount)
          throw new DomainError(
            "CLINIC_NOT_FOUND",
            "Clínica não encontrada.",
            404,
          );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "clinic.auto_finalization_updated",
          "clinic",
          clinicId,
          { enabled: input.enabled, delayMinutes: input.delayMinutes },
        );
        return mapAutoFinalization(result.rows[0]);
      });
    },

    async getPaymentMethodSettings(clinicId: string) {
      const result = await repositoryContext.pool.query<PaymentMethodRow>(
        `SELECT ${paymentMethodColumns} FROM clinics WHERE id = $1`,
        [clinicId],
      );
      return mapPaymentMethods(result.rows[0]);
    },

    async updatePaymentMethodSettings(
      clinicId: string,
      actorUserId: string,
      input: PaymentMethodSettingsInput,
    ) {
      return repositoryContext.inTransaction(async (client) => {
        const current = await client.query<PaymentMethodRow>(
          `SELECT ${paymentMethodColumns} FROM clinics WHERE id = $1 FOR UPDATE`,
          [clinicId],
        );
        if (!current.rowCount)
          throw new DomainError(
            "CLINIC_NOT_FOUND",
            "Clínica não encontrada.",
            404,
          );
        // Formas fora da requisição mantêm o que estava gravado.
        const { methods } = resolvePaymentMethodSettings([
          ...input.methods,
          ...(current.rows[0]!.methods ?? []).filter(
            (item) =>
              !input.methods.some((entry) => entry.method === item.method),
          ),
        ]);
        const result = await writeAndRead<PaymentMethodRow>(
          client,
          `UPDATE clinics SET payment_method_settings = $2,
             payment_method_settings_updated_at = NOW(6)
           WHERE id = $1`,
          [clinicId, JSON.stringify(methods)],
          `SELECT ${paymentMethodColumns} FROM clinics WHERE id = $1`,
          [clinicId],
        );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "clinic.payment_methods_updated",
          "clinic",
          clinicId,
          { methods },
        );
        return mapPaymentMethods(result.rows[0]);
      });
    },

    async updateClinicSettings(
      clinicId: string,
      actorUserId: string,
      input: ClinicSettingsInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await writeAndRead<ClinicSettingsRow>(
          client,
          `UPDATE clinics SET name = $2, legal_name = $3, tax_id = $4,
            phone = $5, email = $6, address = $7, timezone = $8,logo_data_url=CASE WHEN $9 THEN $10 ELSE logo_data_url END,
            pix_key = CASE WHEN $11 THEN $12 ELSE pix_key END,
            pix_message_template = CASE WHEN $13 THEN $14 ELSE pix_message_template END, updated_at = NOW(6)
         WHERE id = $1`,
          [
            clinicId,
            input.name,
            input.legalName || null,
            input.taxId || null,
            input.phone || null,
            input.email || null,
            input.address || null,
            input.timezone,
            input.logoDataUrl !== undefined,
            input.logoDataUrl ?? null,
            input.pixKey !== undefined,
            input.pixKey || null,
            input.pixMessageTemplate !== undefined,
            input.pixMessageTemplate || null,
          ],
          `SELECT ${clinicSettingsColumns} FROM clinics WHERE id = $1`,
        );
        if (!result.rowCount)
          throw new DomainError(
            "CLINIC_NOT_FOUND",
            "Clínica não encontrada.",
            404,
          );
        await repositoryContext.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          "clinic.updated",
          "clinic",
          clinicId,
        );
        const saved = mapClinicSettings(result.rows[0]!);
        await client.query("COMMIT");
        return saved;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async recordAdminAuditEvent(
      clinicId: string,
      actorUserId: string,
      action: string,
      entityType: string,
      metadata: Record<string, unknown> = {},
      entityId?: string,
    ) {
      await repositoryContext.addAdminAudit(
        repositoryContext.pool,
        clinicId,
        actorUserId,
        action,
        entityType,
        entityId,
        metadata,
      );
    },

    async listAdminAuditEvents(clinicId: string) {
      return repositoryContext.readAdminAuditEvents(clinicId, 200);
    },

    async listHistoryActors(clinicId: string): Promise<HistoryActor[]> {
      const result = await repositoryContext.pool.query<HistoryActor>(
        "SELECT id, full_name AS name FROM users WHERE clinic_id = $1 ORDER BY full_name, id",
        [clinicId],
      );
      return result.rows;
    },

    async listAdminAuditPage(
      clinicId: string,
      cursor?: string,
      filters: AuditHistoryFilters = {},
    ): Promise<AdminAuditPage> {
      if (cursor !== undefined) {
        const anchor = await repositoryContext.pool.query(
          `SELECT h.id FROM ${historyEventsTable("$1")} h WHERE h.id = $2`,
          [clinicId, cursor],
        );
        if (!anchor.rowCount)
          throw new DomainError(
            "INVALID_AUDIT_CURSOR",
            "Cursor de histórico inválido.",
            400,
          );
      }
      const events = await repositoryContext.readAdminAuditEvents(
        clinicId,
        51,
        cursor,
        filters,
      );
      const items = events.slice(0, 50);
      return {
        items,
        nextCursor: events.length > 50 ? items.at(-1)!.id : null,
      };
    },

    async listProfessionals(clinicId: string) {
      const result = await repositoryContext.pool.query<
        ProfessionalRow & { whatsapp: string | null }
      >(
        `
        SELECT p.id, p.clinic_id AS "clinicId", p.branch_id AS "branchId",
               p.full_name AS "fullName", p.crefito, p.specialty, p.color, p.active,
               u.whatsapp
        FROM professionals p
        LEFT JOIN users u ON u.clinic_id = p.clinic_id AND u.id = p.user_id
        WHERE p.clinic_id = $1 AND p.active = true
          AND ${branchClause("p.branch_id", 2)}
        ORDER BY p.full_name
      `,
        [clinicId, repositoryContext.branchReadIds()],
      );
      // WhatsApp do usuário ligado: só aparece quando informado.
      return result.rows.map(({ whatsapp, ...row }): Professional =>
        whatsapp ? { ...row, whatsapp } : row,
      );
    },

    async createProfessional(clinicId: string, input: ProfessionalInput) {
      try {
        const result = await writeAndRead<ProfessionalRow>(
          repositoryContext.pool,
          `
          INSERT INTO professionals (clinic_id, full_name, crefito, specialty, color, branch_id, id) VALUES ($1, $2, $3, $4, $5, ${branchOrDefault("$6", "$1")}, $7)`,
          [
            clinicId,
            input.fullName,
            input.crefito,
            input.specialty,
            input.color,
            repositoryContext.branchWriteId(),
            randomUUID(),
          ],
          `SELECT id, clinic_id AS "clinicId", branch_id AS "branchId", full_name AS "fullName",
                    crefito, specialty, color, active FROM professionals WHERE id = $7`,
        );
        return result.rows[0]!;
      } catch (error) {
        if (hasDatabaseCode(error, "23505")) {
          throw new DomainError(
            "PROFESSIONAL_DUPLICATE",
            "Já existe um profissional com este CREFITO.",
            409,
          );
        }
        throw error;
      }
    },

    async listRooms(clinicId: string) {
      const result = await repositoryContext.pool.query<RoomRow>(
        `SELECT id, clinic_id AS "clinicId", branch_id AS "branchId", name, capacity, active
       FROM rooms WHERE clinic_id = $1 AND active = true AND ${branchClause("branch_id", 2)}
       ORDER BY name`,
        [clinicId, repositoryContext.branchReadIds()],
      );
      return result.rows;
    },

    async createRoom(clinicId: string, input: RoomInput) {
      try {
        const result = await writeAndRead<RoomRow>(
          repositoryContext.pool,
          `INSERT INTO rooms (clinic_id, name, capacity, branch_id, id) VALUES ($1, $2, $3, ${branchOrDefault("$4", "$1")}, $5)`,
          [
            clinicId,
            input.name,
            input.capacity,
            repositoryContext.branchWriteId(),
            randomUUID(),
          ],
          `SELECT id, clinic_id AS "clinicId", branch_id AS "branchId", name, capacity, active FROM rooms WHERE id = $5`,
        );
        return result.rows[0]!;
      } catch (error) {
        if (hasDatabaseCode(error, "23505")) {
          throw new DomainError(
            "ROOM_DUPLICATE",
            "Já existe uma sala com este nome.",
            409,
          );
        }
        throw error;
      }
    },

    async listServices(clinicId: string) {
      const result = await repositoryContext.pool.query<ServiceRow>(
        `
        SELECT id, clinic_id AS "clinicId", name, duration_minutes AS "durationMinutes",
               price_in_cents AS "priceInCents", color, active,
               professional_ids AS "professionalIds", room_ids AS "roomIds"
        FROM services WHERE clinic_id = $1 AND active = true ORDER BY name
      `,
        [clinicId],
      );
      return result.rows;
    },

    async createService(clinicId: string, input: ServiceInput) {
      const result = await writeAndRead<ServiceRow>(
        repositoryContext.pool,
        `
        INSERT INTO services (clinic_id, name, duration_minutes, price_in_cents, color, professional_ids, room_ids, id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          clinicId,
          input.name,
          input.durationMinutes,
          input.priceInCents,
          input.color,
          input.professionalIds ?? [],
          input.roomIds ?? [],
          randomUUID(),
        ],
        `SELECT id, clinic_id AS "clinicId", name, duration_minutes AS "durationMinutes",
                  price_in_cents AS "priceInCents", color, active,
                  professional_ids AS "professionalIds", room_ids AS "roomIds" FROM services WHERE id = $8`,
      );
      return result.rows[0]!;
    },

    async listNavTabLabels(clinicId: string) {
      const result = await repositoryContext.pool.query<NavTabLabel>(
        "SELECT tab, label FROM nav_tab_labels WHERE clinic_id = $1",
        [clinicId],
      );
      return resolveNavTabLabels(result.rows);
    },

    async saveNavTabLabels(clinicId: string, input: NavTabLabelsInput) {
      await repositoryContext.inTransaction(async (client) => {
        for (const item of input.tabs)
          await client.query(
            `INSERT INTO nav_tab_labels (clinic_id, tab, label)
             VALUES ($1, $2, $3)
             ON DUPLICATE KEY UPDATE label = VALUES(label), updated_at = NOW(6)`,
            [clinicId, item.tab, item.label],
          );
      });
      return resolveNavTabLabels(input.tabs);
    },

    async getNotificationPreferences(clinicId: string, userId: string) {
      const result = await repositoryContext.pool.query<{
        preferences: unknown;
      }>(
        `SELECT preferences FROM user_notification_preferences
         WHERE clinic_id = $1 AND user_id = $2`,
        [clinicId, userId],
      );
      const row = result.rows[0];
      return resolveNotificationPreferences(
        row ? json<unknown>(row.preferences) : undefined,
      );
    },

    async saveNotificationPreferences(
      clinicId: string,
      userId: string,
      input: NotificationPreferences,
    ) {
      const preferences = resolveNotificationPreferences(input);
      await repositoryContext.pool.query(
        `INSERT INTO user_notification_preferences (clinic_id, user_id, preferences)
         VALUES ($1, $2, $3)
         ON DUPLICATE KEY UPDATE preferences = VALUES(preferences), updated_at = NOW(6)`,
        [clinicId, userId, JSON.stringify(preferences)],
      );
      return preferences;
    },

    async listIntegrationKeys(clinicId: string) {
      const result = await repositoryContext.pool.query<IntegrationKeyRow>(
        `${integrationKeySelect} WHERE k.clinic_id = $1
         ORDER BY (k.revoked_at IS NULL) DESC, k.created_at DESC`,
        [clinicId],
      );
      return result.rows.map(mapIntegrationKey);
    },

    async createIntegrationKey(
      clinicId: string,
      actorUserId: string,
      input: IntegrationKeyInput,
      secret: { prefix: string; tokenHash: string },
    ) {
      const id = randomUUID();
      await repositoryContext.pool.query(
        `INSERT INTO integration_api_keys
           (id, clinic_id, name, prefix, token_hash, scopes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          clinicId,
          input.name,
          secret.prefix,
          secret.tokenHash,
          JSON.stringify(input.scopes),
          actorUserId,
        ],
      );
      const result = await repositoryContext.pool.query<IntegrationKeyRow>(
        `${integrationKeySelect} WHERE k.clinic_id = $1 AND k.id = $2`,
        [clinicId, id],
      );
      return mapIntegrationKey(result.rows[0]!);
    },

    async revokeIntegrationKey(clinicId: string, id: string) {
      await repositoryContext.pool.query(
        `UPDATE integration_api_keys SET revoked_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2 AND revoked_at IS NULL`,
        [clinicId, id],
      );
      const result = await repositoryContext.pool.query<IntegrationKeyRow>(
        `${integrationKeySelect} WHERE k.clinic_id = $1 AND k.id = $2`,
        [clinicId, id],
      );
      const row = result.rows[0];
      return row ? mapIntegrationKey(row) : null;
    },

    async findIntegrationKeyByTokenHash(tokenHash: string) {
      const result = await repositoryContext.pool.query<
        IntegrationKeyRow & { clinicId: string }
      >(
        `${integrationKeySelect.replace("SELECT", "SELECT k.clinic_id AS clinicId,")}
         WHERE k.token_hash = $1 AND k.revoked_at IS NULL`,
        [tokenHash],
      );
      const row = result.rows[0];
      return row ? { clinicId: row.clinicId, key: mapIntegrationKey(row) } : null;
    },

    async touchIntegrationKey(clinicId: string, id: string) {
      await repositoryContext.pool.query(
        `UPDATE integration_api_keys SET last_used_at = NOW(6)
         WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id],
      );
    },
  };
}

interface IntegrationKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: unknown;
  createdByUserId: string;
  createdByName: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const integrationKeySelect = `SELECT k.id, k.name, k.prefix, k.scopes,
    k.created_by_user_id AS createdByUserId, u.full_name AS createdByName,
    k.created_at AS createdAt, k.last_used_at AS lastUsedAt, k.revoked_at AS revokedAt
  FROM integration_api_keys k
  LEFT JOIN users u ON u.clinic_id = k.clinic_id AND u.id = k.created_by_user_id`;

function mapIntegrationKey(row: IntegrationKeyRow): IntegrationKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: json<IntegrationScope[]>(row.scopes),
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName ?? "",
    createdAt: row.createdAt.toISOString(),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
  };
}
