import type {
  ProfessionalInput,
  RoomInput,
  ServiceInput,
} from "@crm/contracts";
import type {
  AdministrativeRegistryInput,
  AdministrativeRegistryWorkspace,
  Professional as RegistryProfessional,
  Room as RegistryRoom,
  Service as RegistryService,
} from "@crm/contracts";
import type {
  AdminAuditEvent,
  AdminAuditPage,
  AdminUser,
  AdminUserInput,
  AdminUserUpdate,
  AuditHistoryFilters,
  ClinicBranding,
  ClinicSettings,
  ClinicSettingsInput,
  PaymentMethodSettings,
  PaymentMethodSettingsInput,
  HistoryActor,
  NavTabLabel,
  OwnPasswordChange,
  OwnProfile,
  OwnProfileUpdate,
  Professional,
  Room,
  Service,
  UserSummary,
} from "@crm/contracts";
import type { Branch, BranchInput } from "@crm/contracts";
import type {
  IntegrationKey,
  IntegrationKeyCreated,
  IntegrationKeyInput,
} from "@crm/contracts";
import { TOKEN_KEY, storeUser, type Session } from "../session";
import { request } from "../transport";

export const administrationApi = {
  /** Perfil do usuário logado (página "Meu perfil"). */
  ownProfile: () => request<OwnProfile>("/me/profile"),
  updateOwnProfile: (input: OwnProfileUpdate) =>
    request<OwnProfile>("/me/profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Troca a própria senha; a API encerra as outras sessões e devolve um token novo. */
  changeOwnPassword: async (input: OwnPasswordChange) => {
    const session = await request<Session>("/me/password", {
      method: "POST",
      body: JSON.stringify(input),
    });
    localStorage.setItem(TOKEN_KEY, session.token);
    storeUser(session.user);
    return session;
  },
  /** Filiais ativas que o usuário logado acessa (seletor do cabeçalho). */
  branches: () => request<Branch[]>("/branches"),
  adminBranches: () => request<Branch[]>("/admin/branches"),
  createBranch: (input: BranchInput) =>
    request<Branch>("/admin/branches", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateBranch: (id: string, input: BranchInput) =>
    request<Branch>(`/admin/branches/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createProfessional: (input: ProfessionalInput) =>
    request<Professional>("/professionals", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createRoom: (input: RoomInput) =>
    request<Room>("/rooms", { method: "POST", body: JSON.stringify(input) }),
  createService: (input: ServiceInput) =>
    request<Service>("/services", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeAdminUserSessions: (id: string) =>
    request<void>(`/admin/users/${id}/revoke-sessions`, { method: "POST" }),
  clinicBranding: () => request<ClinicBranding>("/clinic/branding"),
  /** Nomes das abas do menu (padrão onde o admin não renomeou). */
  navTabLabels: () => request<NavTabLabel[]>("/clinic/nav-tabs"),
  saveNavTabLabels: (tabs: NavTabLabel[]) =>
    request<NavTabLabel[]>("/admin/nav-tabs", {
      method: "PUT",
      body: JSON.stringify({ tabs }),
    }),
  administrativeRegistry: () =>
    request<AdministrativeRegistryWorkspace>("/admin/registry"),
  updateAdministrativeRegistry: (
    id: string,
    input: AdministrativeRegistryInput,
  ) =>
    request<RegistryProfessional | RegistryRoom | RegistryService>(
      `/admin/registry/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
    ),
  revokeSessions: () => request<void>("/auth/logout-all", { method: "POST" }),
  clinicCatalog: (kind: ClinicCatalogKind) =>
    request<ClinicCatalogEntry[]>(`/clinic-catalogs/${kind}`),
  saveClinicCatalog: (
    kind: ClinicCatalogKind,
    input: ClinicCatalogInput,
    id?: string,
  ) =>
    request<ClinicCatalogEntry>(
      `/clinic-catalogs/${kind}${id ? `/${id}` : ""}`,
      { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
    ),
  me: () => request<UserSummary>("/me"),
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  createAdminUser: (input: AdminUserInput) =>
    request<AdminUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** `recalculationDigest`: prévia confirmada do recálculo das comissões já lançadas. */
  updateAdminUser: (
    id: string,
    input: AdminUserUpdate & { recalculationDigest?: string },
  ) =>
    request<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  setUserProfessional: (id: string, professionalId: string | null) =>
    request<AdminUser>(`/admin/users/${id}/professional`, {
      method: "PUT",
      body: JSON.stringify({ professionalId }),
    }),
  resetAdminPassword: (id: string, password: string) =>
    request<{ updated: boolean }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  clinicSettings: () => request<ClinicSettings>("/admin/clinic-settings"),
  /** Parcelamento aceito por forma de pagamento (todos leem; só o admin altera). */
  paymentMethodSettings: () =>
    request<PaymentMethodSettings>("/clinic/payment-methods"),
  savePaymentMethodSettings: (input: PaymentMethodSettingsInput) =>
    request<PaymentMethodSettings>("/admin/payment-methods", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  updateClinicSettings: (input: ClinicSettingsInput) =>
    request<ClinicSettings>("/admin/clinic-settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Chaves da API externa (dashboard de vendas); o token só vem na criação. */
  integrationKeys: () => request<IntegrationKey[]>("/integration-keys"),
  createIntegrationKey: (input: IntegrationKeyInput) =>
    request<IntegrationKeyCreated>("/integration-keys", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeIntegrationKey: (id: string) =>
    request<IntegrationKey>(`/integration-keys/${id}/revoke`, {
      method: "POST",
    }),
  adminAuditEvents: () => request<AdminAuditEvent[]>("/admin/audit-events"),
  auditHistory: (cursor?: string, filters: AuditHistoryFilters = {}) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    for (const [key, value] of Object.entries(filters))
      if (value) query.set(key, value);
    return request<AdminAuditPage>(
      `/history/audit-events${query.size ? `?${query}` : ""}`,
    );
  },
  historyActors: () => request<HistoryActor[]>("/history/actors"),
  professionals: () => request<Professional[]>("/professionals"),
  rooms: () => request<Room[]>("/rooms"),
  services: () => request<Service[]>("/services"),
};
import type {
  ClinicCatalogEntry,
  ClinicCatalogInput,
  ClinicCatalogKind,
} from "@crm/contracts";
