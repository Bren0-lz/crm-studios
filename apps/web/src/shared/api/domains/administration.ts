import type {
  AdminAuditEvent,
  AdminAuditPage,
  AdminUser,
  AdminUserInput,
  AdminUserUpdate,
  AuditHistoryFilters,
  ClinicSettings,
  ClinicSettingsInput,
  HistoryActor,
  Professional,
  Room,
  Service,
  UserSummary,
} from "@crm/contracts";
import { request } from "../transport";

export const administrationApi = {
  me: () => request<UserSummary>("/me"),
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  createAdminUser: (input: AdminUserInput) =>
    request<AdminUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAdminUser: (id: string, input: AdminUserUpdate) =>
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
  updateClinicSettings: (input: ClinicSettingsInput) =>
    request<ClinicSettings>("/admin/clinic-settings", {
      method: "PUT",
      body: JSON.stringify(input),
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
