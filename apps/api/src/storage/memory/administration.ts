import { prepareUserAgenda } from "./user-agenda.js";
import { syncUserPayroll } from "./user-payroll.js";
import {
  defaultAutoFinalizationSettings,
  resolveNavTabLabels,
  resolveNotificationPreferences,
  resolvePaymentMethodSettings,
  type PaymentMethodSettingsInput,
  type AutoFinalizationSettings,
  defaultProLaboreSettings,
  type ProLaboreSettings,
  type ProLaboreSettingsInput,
  type AutoFinalizationSettingsInput,
  resolvePermissionInput,
  saoPauloToday,
  type AdminAuditPage,
  type AdminUserInput,
  type AdminUserUpdate,
  type AuditHistoryFilters,
  type ClinicSettingsInput,
  type HistoryActor,
  type IntegrationKey,
  type IntegrationKeyInput,
  type NavTabLabelsInput,
  type NotificationPreferences,
  type OwnProfile,
  type OwnProfileUpdate,
  type Professional,
  type ProfessionalInput,
  type Room,
  type RoomInput,
  type Service,
  type ServiceInput,
} from "@crm/contracts";
import {
  DomainError,
  lastAdminError,
  type AuthenticatedUser,
  type CommissionRecalculationRequest,
} from "../../repository.js";
import { userCommissionDrafts } from "../../modules/finance/commission-recalculation.js";
import type { MemoryRepositoryContext } from "./context.js";
import { createMemoryCommissionRecalculation } from "./commission-recalculation.js";
import { CLINIC_ID, now, uuid } from "./helpers.js";

export function createAdministrationRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  const commissions = createMemoryCommissionRecalculation(repositoryContext);
  function ownProfileOf(user: AuthenticatedUser): OwnProfile {
    const professional = repositoryContext.linkedProfessional(
      user.clinicId,
      user.id,
    );
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
      avatarDataUrl: repositoryContext.userAvatars.get(user.id) ?? "",
      professional: professional
        ? {
            id: professional.id,
            fullName: professional.fullName,
            color: professional.color,
          }
        : null,
    };
  }

  return {
    async revokeUserSessions(
      clinicId: string,
      actorUserId: string,
      userId: string,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user)
        throw new DomainError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      repositoryContext.recordAudit(
        clinicId,
        actorUserId,
        "user.sessions_revoked",
        "user",
        {},
        userId,
      );
    },
    async findUserByEmail(email: string) {
      return (
        repositoryContext.users.find(
          (user) => user.email === email.toLowerCase() && user.active,
        ) ?? null
      );
    },

    async findUserById(clinicId: string, userId: string) {
      return (
        repositoryContext.users.find(
          (user) =>
            user.clinicId === clinicId && user.id === userId && user.active,
        ) ?? null
      );
    },

    async listAdminUsers(clinicId: string) {
      return repositoryContext.users
        .filter((user) => user.clinicId === clinicId)
        .map((user) => repositoryContext.toAdminUser(user))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    },

    async setAdminUserProfessional(
      clinicId: string,
      actorUserId: string,
      userId: string,
      professionalId: string | null,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return null;
      if (professionalId) {
        const professional = repositoryContext.professionals.find(
          (item) => item.clinicId === clinicId && item.id === professionalId,
        );
        if (!professional)
          throw new DomainError(
            "PROFESSIONAL_NOT_FOUND",
            "Profissional não encontrado.",
            404,
          );
        const owner = repositoryContext.professionalUsers.get(professionalId);
        if (owner && owner !== userId)
          throw new DomainError(
            "PROFESSIONAL_ALREADY_LINKED",
            "Este profissional já está ligado a outro usuário.",
            409,
          );
      }
      const previousProfessionalId =
        repositoryContext.linkedProfessional(clinicId, userId)?.id ?? null;
      if (previousProfessionalId !== professionalId) {
        for (const [id, linkedUserId] of [
          ...repositoryContext.professionalUsers,
        ])
          if (linkedUserId === userId)
            repositoryContext.professionalUsers.delete(id);
        if (professionalId)
          repositoryContext.professionalUsers.set(professionalId, userId);
        repositoryContext.addAdminAudit(
          actorUserId,
          "users.professional_updated",
          "user",
          userId,
          { professionalId, previousProfessionalId },
          clinicId,
        );
        syncUserPayroll(repositoryContext, actorUserId, user, undefined);
      }
      return repositoryContext.toAdminUser(user);
    },

    async createAdminUser(
      clinicId: string,
      actorUserId: string,
      input: AdminUserInput,
      passwordHash: string,
      recalculation?: CommissionRecalculationRequest,
    ) {
      if (
        repositoryContext.users.some(
          (user) =>
            user.clinicId === clinicId &&
            user.email === input.email.toLowerCase(),
        )
      )
        throw new DomainError(
          "USER_EMAIL_DUPLICATE",
          "Este e-mail já está em uso.",
          409,
        );
      const timestamp = now();
      const jobTitle = input.jobTitle?.trim();
      const user: AuthenticatedUser = {
        id: uuid(),
        clinicId,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        role: input.role,
        ...(jobTitle ? { jobTitle } : {}),
        permissions: [],
        modules: [],
        editModules: [],
        customModules: false,
        passwordHash,
        active: true,
        dashboardAccess: input.dashboardAccess ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (input.branchAccess)
        repositoryContext.validateUserBranchAccess(user, input.branchAccess);
      if (input.commission)
        repositoryContext.validateUserCommissionRule(
          clinicId,
          user.id,
          input.commission,
        );
      const saveAgenda = prepareUserAgenda(
        repositoryContext,
        user,
        input,
        actorUserId,
      );
      repositoryContext.setUserPermissions(
        user,
        resolvePermissionInput(input.role, input),
      );
      if (input.branchAccess)
        repositoryContext.setUserBranchAccess(
          user,
          input.branchAccess,
          actorUserId,
        );
      repositoryContext.users.push(user);
      if (input.whatsapp)
        repositoryContext.userWhatsapps.set(user.id, input.whatsapp);
      repositoryContext.addAdminAudit(
        actorUserId,
        "user.created",
        "user",
        user.id,
        {
          role: user.role,
          email: user.email,
        },
        clinicId,
      );
      if (user.dashboardAccess)
        repositoryContext.addAdminAudit(
          actorUserId,
          "users.dashboard_access_updated",
          "user",
          user.id,
          { dashboardAccess: true, previousDashboardAccess: false },
          clinicId,
        );
      if (user.customModules)
        repositoryContext.addAdminAudit(
          actorUserId,
          "users.permissions_updated",
          "user",
          user.id,
          {
            modules: user.modules,
            editModules: user.editModules,
            custom: true,
            previousPermissions: [],
            permissions: user.permissions,
          },
          clinicId,
        );
      if (input.commission)
        repositoryContext.addUserCommissionRule(
          clinicId,
          actorUserId,
          user.id,
          input.commission,
        );
      saveAgenda();
      syncUserPayroll(
        repositoryContext,
        actorUserId,
        user,
        input.salaryInCents ?? null,
      );
      // Usuário novo ligado a um profissional que já tem comissões: recalcula pelas regras novas.
      if (recalculation)
        commissions.apply(
          clinicId,
          actorUserId,
          { userId: user.id },
          userCommissionDrafts(input),
        );
      return repositoryContext.toAdminUser(user);
    },

    async updateAdminUser(
      clinicId: string,
      actorUserId: string,
      userId: string,
      input: AdminUserUpdate,
      recalculation?: CommissionRecalculationRequest,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return null;
      if (userId === actorUserId && !input.active)
        throw new DomainError(
          "CANNOT_DEACTIVATE_SELF",
          "Você não pode desativar o próprio acesso.",
          409,
        );
      const losesAdmin =
        user.role === "admin" &&
        user.active &&
        (input.role !== "admin" || !input.active);
      if (
        losesAdmin &&
        !repositoryContext.users.some(
          (item) =>
            item.clinicId === clinicId &&
            item.id !== user.id &&
            item.role === "admin" &&
            item.active,
        )
      )
        throw lastAdminError();
      if (input.branchAccess)
        repositoryContext.validateUserBranchAccess(user, input.branchAccess);
      if (input.commission)
        repositoryContext.validateUserCommissionRule(
          clinicId,
          userId,
          input.commission,
        );
      if (recalculation)
        commissions.check(
          clinicId,
          { userId },
          userCommissionDrafts(input),
          recalculation.expectedDigest,
        );
      const saveAgenda = prepareUserAgenda(
        repositoryContext,
        user,
        input,
        actorUserId,
      );
      const previousPermissions = [...user.permissions];
      const previousRole = user.role;
      if (input.branchAccess)
        repositoryContext.setUserBranchAccess(
          user,
          input.branchAccess,
          actorUserId,
        );
      const previousDashboardAccess = user.dashboardAccess ?? false;
      user.dashboardAccess = input.dashboardAccess ?? previousDashboardAccess;
      user.fullName = input.fullName;
      user.role = input.role;
      user.active = input.active;
      if (input.jobTitle !== undefined) {
        const jobTitle = input.jobTitle.trim();
        if (jobTitle) user.jobTitle = jobTitle;
        else delete user.jobTitle;
      }
      if (input.whatsapp !== undefined) {
        if (input.whatsapp)
          repositoryContext.userWhatsapps.set(user.id, input.whatsapp);
        else repositoryContext.userWhatsapps.delete(user.id);
      }
      repositoryContext.setUserPermissions(
        user,
        resolvePermissionInput(
          input.role,
          input,
          previousRole === "admin" ? [] : previousPermissions,
        ),
      );
      user.updatedAt = now();
      repositoryContext.addAdminAudit(
        actorUserId,
        "user.updated",
        "user",
        user.id,
        {
          role: user.role,
          active: user.active,
        },
        clinicId,
      );
      if (user.dashboardAccess !== previousDashboardAccess)
        repositoryContext.addAdminAudit(
          actorUserId,
          "users.dashboard_access_updated",
          "user",
          user.id,
          {
            dashboardAccess: user.dashboardAccess,
            previousDashboardAccess,
          },
          clinicId,
        );
      if (
        JSON.stringify(previousPermissions) !== JSON.stringify(user.permissions)
      )
        repositoryContext.addAdminAudit(
          actorUserId,
          "users.permissions_updated",
          "user",
          user.id,
          {
            modules: user.modules,
            editModules: user.editModules,
            custom: user.customModules,
            previousPermissions,
            permissions: user.permissions,
          },
          clinicId,
        );
      if (input.commission)
        repositoryContext.addUserCommissionRule(
          clinicId,
          actorUserId,
          userId,
          input.commission,
        );
      saveAgenda();
      syncUserPayroll(
        repositoryContext,
        actorUserId,
        user,
        input.salaryInCents,
      );
      if (recalculation)
        commissions.apply(
          clinicId,
          actorUserId,
          { userId },
          userCommissionDrafts(input),
        );
      return repositoryContext.toAdminUser(user);
    },

    async resetAdminUserPassword(
      clinicId: string,
      actorUserId: string,
      userId: string,
      passwordHash: string,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return false;
      user.passwordHash = passwordHash;
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      user.updatedAt = now();
      repositoryContext.addAdminAudit(
        actorUserId,
        "user.password_reset",
        "user",
        user.id,
        {},
        clinicId,
      );
      return true;
    },

    async getOwnProfile(clinicId: string, userId: string) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return null;
      return ownProfileOf(user);
    },

    async updateOwnProfile(
      clinicId: string,
      userId: string,
      input: OwnProfileUpdate,
    ) {
      const user = repositoryContext.users.find(
        (item) => item.clinicId === clinicId && item.id === userId,
      );
      if (!user) return null;
      const professional = repositoryContext.linkedProfessional(
        clinicId,
        userId,
      );
      user.fullName = input.fullName;
      user.updatedAt = now();
      if (input.avatarDataUrl !== undefined) {
        if (input.avatarDataUrl)
          repositoryContext.userAvatars.set(user.id, input.avatarDataUrl);
        else repositoryContext.userAvatars.delete(user.id);
      }
      if (professional) {
        if (input.agendaName) professional.fullName = input.agendaName;
        if (input.agendaColor) professional.color = input.agendaColor;
      }
      repositoryContext.addAdminAudit(
        userId,
        "user.profile_updated",
        "user",
        user.id,
        {
          fullName: user.fullName,
          ...(professional ? { agendaName: professional.fullName } : {}),
        },
        clinicId,
      );
      return ownProfileOf(user);
    },

    async getClinicSettings(clinicId: string) {
      return clinicId === repositoryContext.clinicSettings.id
        ? repositoryContext.clinicSettings
        : null;
    },

    async updateClinicSettings(
      clinicId: string,
      actorUserId: string,
      input: ClinicSettingsInput,
    ) {
      if (clinicId !== repositoryContext.clinicSettings.id)
        throw new DomainError(
          "CLINIC_NOT_FOUND",
          "Clínica não encontrada.",
          404,
        );
      Object.assign(repositoryContext.clinicSettings, input, {
        updatedAt: now(),
      });
      repositoryContext.addAdminAudit(
        actorUserId,
        "clinic.updated",
        "clinic",
        clinicId,
        {},
        clinicId,
      );
      return repositoryContext.clinicSettings;
    },

    async getAutoFinalizationSettings(
      clinicId: string,
    ): Promise<AutoFinalizationSettings> {
      return (
        repositoryContext.autoFinalizationSettings.get(clinicId) ?? {
          ...defaultAutoFinalizationSettings,
        }
      );
    },

    async getProLaboreSettings(clinicId: string): Promise<ProLaboreSettings> {
      return {
        ...(repositoryContext.proLaboreSettings.get(clinicId) ??
          defaultProLaboreSettings),
      };
    },

    async updateProLaboreSettings(
      clinicId: string,
      actorUserId: string,
      input: ProLaboreSettingsInput,
    ) {
      const saved: ProLaboreSettings = {
        percentage: Math.round(input.percentage * 100) / 100,
        base: input.base,
        updatedAt: now(),
      };
      repositoryContext.proLaboreSettings.set(clinicId, saved);
      repositoryContext.addAdminAudit(
        actorUserId,
        "clinic.pro_labore_updated",
        "clinic",
        clinicId,
        { percentage: saved.percentage, base: saved.base },
        clinicId,
      );
      return { ...saved };
    },

    async updateAutoFinalizationSettings(
      clinicId: string,
      actorUserId: string,
      input: AutoFinalizationSettingsInput,
    ) {
      const saved: AutoFinalizationSettings = {
        enabled: input.enabled,
        delayMinutes: input.delayMinutes,
        updatedAt: now(),
      };
      repositoryContext.autoFinalizationSettings.set(clinicId, saved);
      repositoryContext.addAdminAudit(
        actorUserId,
        "clinic.auto_finalization_updated",
        "clinic",
        clinicId,
        { enabled: input.enabled, delayMinutes: input.delayMinutes },
        clinicId,
      );
      return { ...saved };
    },

    async getPaymentMethodSettings(clinicId: string) {
      const saved = repositoryContext.paymentMethodSettings.get(clinicId);
      return resolvePaymentMethodSettings(saved?.methods, saved?.updatedAt);
    },

    async updatePaymentMethodSettings(
      clinicId: string,
      actorUserId: string,
      input: PaymentMethodSettingsInput,
    ) {
      const current = repositoryContext.paymentMethodSettings.get(clinicId);
      const saved = resolvePaymentMethodSettings(
        [
          ...input.methods,
          ...(current?.methods ?? []).filter(
            (item) =>
              !input.methods.some((entry) => entry.method === item.method),
          ),
        ],
        now(),
      );
      repositoryContext.paymentMethodSettings.set(clinicId, saved);
      repositoryContext.addAdminAudit(
        actorUserId,
        "clinic.payment_methods_updated",
        "clinic",
        clinicId,
        { methods: saved.methods },
        clinicId,
      );
      return saved;
    },

    async listAdminAuditEvents(clinicId: string) {
      return repositoryContext.adminAuditEvents
        .filter((event) => event.clinicId === clinicId)
        .reverse();
    },

    async listHistoryActors(clinicId: string): Promise<HistoryActor[]> {
      return repositoryContext.users
        .filter((user) => user.clinicId === clinicId)
        .map((user) => ({ id: user.id, name: user.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async listAdminAuditPage(
      clinicId: string,
      cursor?: string,
      filters: AuditHistoryFilters = {},
    ): Promise<AdminAuditPage> {
      const allEvents = [
        ...repositoryContext.adminAuditEvents.filter(
          (event) => event.clinicId === clinicId,
        ),
        ...repositoryContext.systemHistoryEvents(clinicId),
      ];
      const anchor = cursor
        ? allEvents.find((event) => event.id === cursor)
        : undefined;
      if (cursor && !anchor)
        throw new DomainError(
          "INVALID_AUDIT_CURSOR",
          "Cursor de histórico inválido.",
          400,
        );
      const words =
        filters.search
          ?.normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean) ?? [];
      // Datas em formatos diferentes (Z e -03:00): compara pelo instante, não pelo texto.
      const time = (event: { createdAt: string }) =>
        Date.parse(event.createdAt);
      // Evento com data futura (dado inconsistente) não entra no histórico.
      const latest = Date.now() + 60_000;
      const events = allEvents
        .filter((event) => {
          if (time(event) > latest) return false;
          if (
            anchor &&
            !(
              time(event) < time(anchor) ||
              (time(event) === time(anchor) && event.id < anchor.id)
            )
          )
            return false;
          if (filters.module && event.module !== filters.module) return false;
          if (filters.action && event.action !== filters.action) return false;
          if (filters.actorUserId && event.actorUserId !== filters.actorUserId)
            return false;
          const day = saoPauloToday(new Date(event.createdAt));
          if (
            (filters.from && day < filters.from) ||
            (filters.to && day > filters.to)
          )
            return false;
          const text =
            `${event.action} ${event.description ?? ""} ${event.module === "clinical" ? "" : JSON.stringify(event.metadata)}`
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();
          return words.every((word) => text.includes(word));
        })
        .sort(
          (a, b) =>
            time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        );
      const items = events.slice(0, 50);
      return {
        items,
        nextCursor: events.length > 50 ? items.at(-1)!.id : null,
      };
    },

    async recordAdminAuditEvent(
      clinicId: string,
      actorUserId: string,
      action: string,
      entityType: string,
      metadata: Record<string, unknown> = {},
      entityId?: string,
    ) {
      if (clinicId !== CLINIC_ID) return;
      repositoryContext.addAdminAudit(
        actorUserId,
        action,
        entityType,
        entityId,
        metadata,
        clinicId,
      );
    },

    async listProfessionals(clinicId: string) {
      return repositoryContext.professionals
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.active &&
            repositoryContext.inBranchScope(item),
        )
        .map((item): Professional => {
          // WhatsApp do usuário ligado: só aparece quando informado.
          const userId = repositoryContext.professionalUsers.get(item.id);
          const whatsapp = userId
            ? repositoryContext.userWhatsapps.get(userId)
            : undefined;
          return whatsapp ? { ...item, whatsapp } : item;
        });
    },

    async createProfessional(clinicId: string, input: ProfessionalInput) {
      const professional: Professional = {
        ...input,
        branchId: repositoryContext.writeBranchId(clinicId),
        id: uuid(),
        clinicId,
        active: true,
      };
      repositoryContext.professionals.push(professional);
      return professional;
    },

    async listRooms(clinicId: string) {
      return repositoryContext.rooms.filter(
        (item) =>
          item.clinicId === clinicId &&
          item.active &&
          repositoryContext.inBranchScope(item),
      );
    },

    async createRoom(clinicId: string, input: RoomInput) {
      const room: Room = {
        ...input,
        branchId: repositoryContext.writeBranchId(clinicId),
        id: uuid(),
        clinicId,
        active: true,
      };
      repositoryContext.rooms.push(room);
      return room;
    },

    async listServices(clinicId: string) {
      return repositoryContext.services.filter(
        (item) => item.clinicId === clinicId && item.active,
      );
    },

    async createService(clinicId: string, input: ServiceInput) {
      const service: Service = {
        professionalIds: [],
        roomIds: [],
        ...input,
        id: uuid(),
        clinicId,
        active: true,
      };
      repositoryContext.services.push(service);
      return service;
    },

    async listNavTabLabels(clinicId: string) {
      return resolveNavTabLabels(
        repositoryContext.navTabLabels.get(clinicId) ?? [],
      );
    },

    async saveNavTabLabels(clinicId: string, input: NavTabLabelsInput) {
      repositoryContext.navTabLabels.set(
        clinicId,
        input.tabs.map((item) => ({ ...item })),
      );
      return resolveNavTabLabels(input.tabs);
    },

    async getNotificationPreferences(clinicId: string, userId: string) {
      return resolveNotificationPreferences(
        repositoryContext.notificationPreferences.get(`${clinicId}:${userId}`),
      );
    },

    async saveNotificationPreferences(
      clinicId: string,
      userId: string,
      input: NotificationPreferences,
    ) {
      const preferences = resolveNotificationPreferences(input);
      repositoryContext.notificationPreferences.set(
        `${clinicId}:${userId}`,
        preferences,
      );
      return preferences;
    },

    async listIntegrationKeys(clinicId: string) {
      return repositoryContext.integrationKeys
        .filter((item) => item.clinicId === clinicId)
        .sort(
          (left, right) =>
            Number(Boolean(left.revokedAt)) - Number(Boolean(right.revokedAt)) ||
            right.createdAt.localeCompare(left.createdAt),
        )
        .map(publicIntegrationKey);
    },

    async createIntegrationKey(
      clinicId: string,
      actorUserId: string,
      input: IntegrationKeyInput,
      secret: { prefix: string; tokenHash: string },
    ) {
      const actor = repositoryContext.users.find(
        (user) => user.clinicId === clinicId && user.id === actorUserId,
      );
      const key = {
        id: uuid(),
        clinicId,
        tokenHash: secret.tokenHash,
        name: input.name,
        prefix: secret.prefix,
        scopes: [...input.scopes],
        createdByUserId: actorUserId,
        createdByName: actor?.fullName ?? "",
        createdAt: now(),
      };
      repositoryContext.integrationKeys.push(key);
      return publicIntegrationKey(key);
    },

    async revokeIntegrationKey(clinicId: string, id: string) {
      const key = repositoryContext.integrationKeys.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!key) return null;
      key.revokedAt ??= now();
      return publicIntegrationKey(key);
    },

    async findIntegrationKeyByTokenHash(tokenHash: string) {
      const key = repositoryContext.integrationKeys.find(
        (item) => item.tokenHash === tokenHash && !item.revokedAt,
      );
      return key
        ? { clinicId: key.clinicId, key: publicIntegrationKey(key) }
        : null;
    },

    async touchIntegrationKey(clinicId: string, id: string) {
      const key = repositoryContext.integrationKeys.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (key) key.lastUsedAt = now();
    },
  };
}

/** Chave sem o hash do token nem a clínica (formato público da API). */
function publicIntegrationKey(
  key: IntegrationKey & { clinicId: string; tokenHash: string },
): IntegrationKey {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: [...key.scopes],
    createdByUserId: key.createdByUserId,
    createdByName: key.createdByName,
    createdAt: key.createdAt,
    ...(key.lastUsedAt ? { lastUsedAt: key.lastUsedAt } : {}),
    ...(key.revokedAt ? { revokedAt: key.revokedAt } : {}),
  };
}
