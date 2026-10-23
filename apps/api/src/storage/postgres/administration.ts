import {
  type AdminAuditPage,
  type AdminUserInput,
  type AdminUserUpdate,
  type AuditHistoryFilters,
  type ClinicSettings,
  type ClinicSettingsInput,
  type HistoryActor,
  type OwnProfile,
  type OwnProfileUpdate,
  type ProfessionalInput,
  type RoomInput,
  type ServiceInput,
  permissionEditModules,
  permissionModules,
  resolvePermissionInput,
} from "@crm/contracts";
import type { Pool, PoolClient } from "pg";
import { DomainError, lastAdminError } from "../../repository.js";
import type { PostgresRepositoryContext } from "./context.js";
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
  timezone: string;
  updatedAt: Date;
};

const clinicSettingsColumns = `id, name, legal_name AS "legalName", tax_id AS "taxId", phone,
  logo_data_url AS "logoDataUrl",email, address, timezone, updated_at AS "updatedAt"`;

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
  repositoryContext: PostgresRepositoryContext,
) {
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
              `UPDATE professionals SET user_id = NULL, updated_at = now()
             WHERE clinic_id = $1 AND user_id = $2`,
              [clinicId, userId],
            );
            if (professionalId)
              await client.query(
                `UPDATE professionals SET user_id = $3, updated_at = now()
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
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT id FROM clinics WHERE id=$1 FOR UPDATE", [
          clinicId,
        ]);
        const permissions = resolvePermissionInput(input.role, input);
        const result = await client.query<UserRow>(
          `INSERT INTO users (clinic_id, full_name, email, role, password_hash, job_title, modules,
           edit_modules, permissions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${userColumns}`,
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
          ],
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
        if (input.branchAccess)
          await repositoryContext.setUserBranchAccess(
            client,
            clinicId,
            actorUserId,
            created.id,
            input.branchAccess,
          );
        const withCommission =
          input.commission || input.branchAccess
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
        if (hasDatabaseCode(error, "23505"))
          throw new DomainError(
            "USER_EMAIL_DUPLICATE",
            "Este e-mail já está em uso.",
            409,
          );
        throw error;
      } finally {
        client.release();
      }
    },

    async updateAdminUser(
      clinicId: string,
      actorUserId: string,
      userId: string,
      input: AdminUserUpdate,
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
        const result = await client.query<UserRow>(
          `UPDATE users SET full_name = $3, role = $4, active = $5, job_title = $6,
           modules = $7, edit_modules = $8, permissions = $9, updated_at = now()
         WHERE clinic_id = $1 AND id = $2
         RETURNING ${userColumns}`,
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
          ],
        );
        if (!result.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const updated = mapAdminUser(result.rows[0]);
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
        const withCommission = await repositoryContext.findAdminUser(
          client,
          clinicId,
          userId,
        );
        await client.query("COMMIT");
        return withCommission ?? updated;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
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
          `UPDATE users SET password_hash = $3, session_version=session_version+1, updated_at = now()
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
             avatar_data_url = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE avatar_data_url END,
             updated_at = now()
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
        const professional = await client.query<{ fullName: string }>(
          `UPDATE professionals SET full_name = COALESCE($3, full_name),
             color = COALESCE($4, color), updated_at = now()
           WHERE clinic_id = $1 AND user_id = $2
           RETURNING full_name AS "fullName"`,
          [
            clinicId,
            userId,
            input.agendaName ?? null,
            input.agendaColor ?? null,
          ],
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

    async updateClinicSettings(
      clinicId: string,
      actorUserId: string,
      input: ClinicSettingsInput,
    ) {
      const client = await repositoryContext.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<ClinicSettingsRow>(
          `UPDATE clinics SET name = $2, legal_name = $3, tax_id = $4,
            phone = $5, email = $6, address = $7, timezone = $8,logo_data_url=CASE WHEN $9 THEN $10 ELSE logo_data_url END, updated_at = now()
         WHERE id = $1 RETURNING ${clinicSettingsColumns}`,
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
          ],
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
          "SELECT id FROM audit_events WHERE clinic_id = $1 AND id = $2",
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
      const result = await repositoryContext.pool.query<ProfessionalRow>(
        `
        SELECT id, clinic_id AS "clinicId", branch_id AS "branchId", full_name AS "fullName",
               crefito, specialty, color, active
        FROM professionals WHERE clinic_id = $1 AND active = true
          AND ${branchClause("branch_id", 2)}
        ORDER BY full_name
      `,
        [clinicId, repositoryContext.branchReadIds()],
      );
      return result.rows;
    },

    async createProfessional(clinicId: string, input: ProfessionalInput) {
      try {
        const result = await repositoryContext.pool.query<ProfessionalRow>(
          `
          INSERT INTO professionals (clinic_id, full_name, crefito, specialty, color, branch_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, clinic_id AS "clinicId", branch_id AS "branchId", full_name AS "fullName",
                    crefito, specialty, color, active
        `,
          [
            clinicId,
            input.fullName,
            input.crefito,
            input.specialty,
            input.color,
            repositoryContext.branchWriteId(),
          ],
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
        const result = await repositoryContext.pool.query<RoomRow>(
          `INSERT INTO rooms (clinic_id, name, capacity, branch_id) VALUES ($1, $2, $3, $4)
         RETURNING id, clinic_id AS "clinicId", branch_id AS "branchId", name, capacity, active`,
          [
            clinicId,
            input.name,
            input.capacity,
            repositoryContext.branchWriteId(),
          ],
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
               professional_ids::text[] AS "professionalIds", room_ids::text[] AS "roomIds"
        FROM services WHERE clinic_id = $1 AND active = true ORDER BY name
      `,
        [clinicId],
      );
      return result.rows;
    },

    async createService(clinicId: string, input: ServiceInput) {
      const result = await repositoryContext.pool.query<ServiceRow>(
        `
        INSERT INTO services (clinic_id, name, duration_minutes, price_in_cents, color, professional_ids, room_ids)
        VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7::uuid[])
        RETURNING id, clinic_id AS "clinicId", name, duration_minutes AS "durationMinutes",
                  price_in_cents AS "priceInCents", color, active,
                  professional_ids::text[] AS "professionalIds", room_ids::text[] AS "roomIds"
      `,
        [
          clinicId,
          input.name,
          input.durationMinutes,
          input.priceInCents,
          input.color,
          input.professionalIds ?? [],
          input.roomIds ?? [],
        ],
      );
      return result.rows[0]!;
    },
  };
}
