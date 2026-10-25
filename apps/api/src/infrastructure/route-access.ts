import {
  permissionCatalog,
  type AppModule,
  type PermissionKey,
} from "@crm/contracts";

/** Nível exigido num módulo: "view" para leituras, "edit" para gravações. */
export type AccessLevel = "view" | "edit";
export interface ModuleRequirement {
  module: AppModule;
  level: AccessLevel;
  permission: PermissionKey;
}
/**
 * - `public`: sem login (saúde e login).
 * - `login`: basta estar logado (usuário ativo).
 * - `admin`: Administração, sempre só do usuário admin (não é módulo configurável).
 * - lista de módulos: o usuário precisa de TODOS os níveis listados.
 * - `{ anyOf: [...] }`: basta UM dos níveis listados (leituras de apoio usadas por várias
 *   telas). O 403 usa o código do primeiro módulo e cita todos na mensagem.
 */
export type RouteAccess =
  | "public"
  | "login"
  | "admin"
  | ModuleRequirement[]
  | { anyOf: ModuleRequirement[] };

const view = (...modules: AppModule[]): ModuleRequirement[] =>
  modules.map((module) => ({
    module,
    level: "view",
    permission: `${module}.view`,
  }));
/** Ver qualquer um dos módulos. */
const viewAny = (...modules: AppModule[]) => ({ anyOf: view(...modules) });
const operation = (...keys: PermissionKey[]): ModuleRequirement[] =>
  keys.map((permission) => {
    const item = permissionCatalog.find((item) => item.key === permission)!;
    return {
      module: item.module,
      level: permission.endsWith(".view") ? "view" : "edit",
      permission,
    };
  });

/** Explicit authorization policy for every registered route. Startup rejects unmapped routes.
 * View permissions authorize module reads; operation permissions authorize individual actions.
 * Supporting selections use anyOf and minimal DTOs instead of complete module records.
 */
export const ROUTE_ACCESS: Record<string, RouteAccess> = {
  "GET /admin/registry": view("settings"),
  "PUT /admin/registry/:id": operation("settings.registry_manage"),
  "GET /clinic-catalogs/:kind": viewAny(
    "patients",
    "settings",
    "crm",
    "clinical",
  ),
  "POST /clinic-catalogs/:kind": "admin",
  "PUT /clinic-catalogs/:kind/:id": "admin",
  "GET /health": "public",
  "POST /auth/login": "public",
  "POST /auth/logout-all": "login",
  "GET /me": "login",
  "GET /me/profile": "login",
  "PUT /me/profile": "login",
  "POST /me/password": "login",
  "GET /branches": "login",

  // Administração (só admin).
  "POST /admin/users/:id/revoke-sessions": "admin",
  "GET /admin/users": "admin",
  "POST /admin/users": "admin",
  "PATCH /admin/users/:id": "admin",
  "POST /admin/users/:id/reset-password": "admin",
  "PUT /admin/users/:id/professional": "admin",
  "PUT /admin/users/:id/commission": "admin",
  "GET /clinic/branding": "login",
  "GET /clinic/nav-tabs": "login",
  "PUT /admin/nav-tabs": "admin",
  "GET /admin/branches": "admin",
  "POST /admin/branches": "admin",
  "PUT /admin/branches/:id": "admin",
  "GET /clinic/auto-finalization": "login",
  "PUT /admin/auto-finalization": "admin",
  "GET /admin/clinic-settings": "admin",
  "PUT /admin/clinic-settings": "admin",
  "PUT /relationship/settings": "admin",
  "POST /holidays": "admin",
  "DELETE /holidays/:id": "admin",
  "GET /admin/audit-events": view("history"),
  "GET /history/audit-events": view("history"),
  "GET /history/actors": view("history"),
  "GET /admin/permission-matrix": "admin",
  "GET /patients/export": operation("patients.export"),

  // Visão geral e leituras de apoio da agenda: só login.
  "GET /dashboard": "login",
  // Sino do cabeçalho: cada contagem é filtrada pelos módulos dentro da rota.
  "GET /notifications": "login",
  "GET /holidays": viewAny("agenda", "groups", "crm", "clinical"),
  "GET /professionals": viewAny(
    "agenda",
    "groups",
    "clinical",
    "contracts",
    "finance",
    "crm",
  ),
  "GET /rooms": viewAny("agenda", "groups", "crm"),
  "GET /services": viewAny("agenda", "groups", "plans", "crm", "settings"),
  "GET /appointments/options": view("clinical"),
  "GET /appointments": viewAny("agenda"),
  "GET /appointments/:id/reschedules": viewAny("agenda"),
  "GET /appointments/pending-finalization": viewAny("agenda"),
  "GET /appointments/completed": viewAny("agenda"),
  "GET /waitlist": view("waitlist"),
  "GET /waitlist/options": view("waitlist"),
  "POST /waitlist": operation("waitlist.manage"),
  "PATCH /waitlist/:id": operation("waitlist.manage"),
  "DELETE /waitlist/:id": operation("waitlist.manage"),
  "GET /agenda-notes": view("agenda"),
  "POST /agenda-notes": operation("agenda.notes"),
  "PATCH /agenda-notes/:id": operation("agenda.notes"),
  "DELETE /agenda-notes/:id": operation("agenda.notes"),
  "GET /schedule-blocks": viewAny("agenda"),
  "GET /group-sessions": viewAny("groups", "agenda"),

  // Agenda.
  "POST /professionals": operation("agenda.professionals_create"),
  "POST /rooms": operation("agenda.rooms_create"),
  "POST /services": operation("agenda.services_create"),
  "POST /appointments": operation("agenda.create"),
  "POST /appointments/recurring": operation("agenda.recurring"),
  "POST /appointments/:id/successor": operation("agenda.reschedule"),
  "PUT /appointments/:id/schedule": operation("agenda.reschedule"),
  "PATCH /appointments/:id": operation("agenda.reschedule"),
  "PATCH /appointments/:id/status": {
    anyOf: operation("agenda.attendance", "agenda.cancel"),
  },
  "POST /schedule-blocks": operation("agenda.blocks_create"),
  "POST /schedule-blocks/:id/cancel": operation("agenda.blocks_cancel"),
  "GET /satisfaction": view("agenda"),
  "POST /satisfaction": operation("agenda.satisfaction_create"),

  // Turmas.
  "GET /groups/workspace": view("groups"),
  "POST /groups": operation("groups.create"),
  "PUT /groups/:id": operation("groups.update"),
  "PATCH /groups/:id/name": operation("groups.rename"),
  "POST /group-enrollments": operation("groups.enroll"),
  "POST /group-enrollments/:id/cancel": operation("groups.cancel_enrollment"),
  "PUT /group-sessions/:sessionId/attendance/:patientId":
    operation("groups.attendance"),
  "POST /group-sessions/:id/complete": operation("groups.complete"),
  "PUT /group-replacements/:id/attendance": operation("groups.attendance"),
  "PUT /group-sessions/:id/professional": operation("groups.update"),
  "POST /group-replacements/book": operation("groups.replacement"),

  // Clientes (inclui estoque e comandas).
  "GET /patients/:id/emergency-contact": viewAny(
    "patients",
    "agenda",
    "groups",
    "clinical",
  ),
  "GET /patients/:id": view("patients"),
  "PATCH /patients/:id/status": operation("patients.update"),
  "POST /patients/inactivation/preview": "admin",
  "POST /patients/inactivation": "admin",
  "POST /patients/merge/preview": "admin",
  "POST /patients/merge": "admin",
  "GET /patients/segments": view("patients"),
  "GET /patients": view("patients"),
  "GET /patients/options": viewAny(
    "patients",
    "agenda",
    "communications",
    "contracts",
    "groups",
    "plans",
    "clinical",
    "waitlist",
  ),
  "POST /patients": operation("patients.create"),
  // Cadastro guiado (T064): a rota exige também editar o módulo do passo (agenda/plans/groups).
  "POST /patients/guided": operation("patients.create"),
  "PUT /patients/:id": operation("patients.update"),
  "POST /patients/import/preview": operation("patients.import"),
  // Etiquetas configuradas (T062): leitura para quem vê clientes/etiquetas; gestão em Configurações.
  "GET /patient-tags": viewAny(
    "patients",
    "settings",
    "agenda",
    "communications",
    "contracts",
    "groups",
  ),
  "POST /patient-tags": operation("settings.tags_create"),
  "PATCH /patient-tags/:id": operation("settings.tags_update"),
  "DELETE /patient-tags/:id": operation("settings.tags_delete"),
  "POST /patients/import": operation("patients.import"),
  "GET /patients/:id/timeline": operation("patients.timeline"),
  "GET /finance/external-operations": operation(
    "finance.external_records_view",
  ),
  "GET /finance/external-operations/:id/content": operation(
    "finance.external_records_view",
  ),
  "POST /finance/external-operations": operation(
    "finance.external_records_manage",
  ),
  "GET /inventory/workspace": operation("patients.inventory_view"),
  "POST /inventory/products": operation("patients.products_create"),
  "POST /inventory/movements": operation("patients.stock_move"),
  "POST /patient-tabs": operation("patients.tabs_create"),
  "POST /patient-tabs/:id/items": operation("patients.tabs_items"),
  "POST /patient-tabs/:id/close": operation("patients.tabs_close"),
  "POST /patient-tabs/:id/cancel": operation("patients.tabs_cancel"),
  "POST /product-sales": operation(
    "patients.tabs_create",
    "patients.tabs_items",
    "patients.tabs_close",
  ),

  "GET /plan-templates": viewAny("settings", "plans"),
  "POST /plan-templates": operation("settings.plans_create"),
  "PATCH /plan-templates/:id": operation("settings.plans_update"),

  // Planos e sessões.
  "GET /plan-catalog": viewAny("plans", "settings"),
  "POST /plan-catalog": operation("settings.plans_create"),
  "PUT /plan-catalog/:id": operation("settings.plans_update"),
  "DELETE /plan-catalog/:id": operation("settings.plans_delete"),
  "GET /plans": view("plans"),
  "GET /plans/:id/movements": view("plans"),
  "POST /plans/purchases": operation("plans.create", "plans.purchase"),
  "POST /plans": operation("plans.create"),
  "PATCH /plans/:id/status": {
    anyOf: operation("plans.status", "plans.cancel"),
  },
  "POST /plans/:id/renew": operation("plans.renew"),
  "PATCH /plans/:id/auto-renew": operation("plans.auto_renew"),

  // CRM comercial.
  "GET /leads/insights": operation("crm.view"),
  // Duplicidade no cadastro/edição do lead: só id e nome de quem tem o mesmo contato.
  "GET /leads/duplicates": { anyOf: operation("crm.create", "crm.update") },
  "GET /leads": view("crm"),
  // Funil paginado (colunas com total) e valores dos filtros.
  "GET /leads/board": view("crm"),
  "GET /leads/board/:stage": view("crm"),
  "GET /leads/filter-options": view("crm"),
  "GET /leads/stages": view("crm"),
  "PUT /leads/stages": operation("crm.stages_manage"),
  "GET /leads/:id/activity": view("crm"),
  "PUT /leads/:id": operation("crm.update"),
  "POST /leads": operation("crm.create"),
  "PATCH /leads/:id/stage": operation("crm.stage"),
  "POST /leads/:id/convert": operation("crm.convert", "patients.create"),
  "POST /leads/:id/contacts": operation("crm.contacts_create"),
  "POST /leads/:id/tasks": operation("crm.tasks_create"),
  "POST /leads/:id/appointments": operation(
    "crm.appointments_create",
    "agenda.create",
  ),
  "PATCH /lead-tasks/:id/status": operation("crm.tasks_status"),

  // Contatos sugeridos (relacionamento).
  "GET /relationship/settings": viewAny("relationship", "settings"),
  "GET /relationship/suggestions": view("relationship"),
  "GET /relationship/birthdays": view("relationship"),
  "GET /relationship/activities": view("relationship"),
  "POST /relationship/activities": operation("relationship.activities_create"),

  // Comunicações.
  "POST /communications/messages/:id/complete": operation(
    "communications.messages",
  ),
  "GET /communications": view("communications"),
  "GET /communications/preferences": view("communications"),
  "PUT /communications/preferences": operation("communications.preferences"),
  "POST /communications/messages": operation("communications.messages"),
  "POST /communications/broadcast/preview": operation(
    "communications.broadcast",
  ),
  "POST /communications/broadcast": operation("communications.broadcast"),
  "POST /communications/reminders/generate": operation(
    "communications.reminders",
  ),
  "GET /communications/templates": view("communications"),
  "GET /communications/template-images/:id": view("communications"),
  "POST /communications/templates": operation("communications.templates"),
  "PUT /communications/templates/:id": operation("communications.templates"),
  "POST /communications/templates/:id/archive": operation(
    "communications.templates",
  ),
  "GET /communications/campaigns": view("communications"),
  "GET /communications/campaigns/filter-options": view("communications"),
  "GET /communications/campaigns/:id": view("communications"),
  "POST /communications/campaigns/preview": operation(
    "communications.campaigns",
  ),
  "POST /communications/campaigns": operation("communications.campaigns"),
  "POST /communications/campaigns/:id/recipients/:recipientId": operation(
    "communications.campaigns",
  ),

  // Contratos.
  "GET /document-templates": view("contracts"),
  "POST /document-templates": operation("contracts.templates_create"),
  "POST /document-templates/:id/versions": operation(
    "contracts.templates_version",
  ),
  "POST /documents/:id/signature": operation("contracts.status"),
  "GET /documents/:id/signature/content": view("contracts"),
  "GET /documents": view("contracts"),
  "POST /documents": operation("contracts.issue"),
  "POST /documents/preview": operation("contracts.issue"),
  "PATCH /documents/:id": operation("contracts.issue"),
  "PATCH /documents/:id/status": {
    anyOf: operation("contracts.status", "contracts.cancel"),
  },

  // Prontuários.
  "GET /clinical-sources": view("clinical"),
  "GET /clinical-resources/catalog": view("clinical"),
  "GET /clinical-resources": view("clinical"),
  "GET /clinical-resources/export": operation("clinical.export"),
  "POST /clinical-resources": {
    anyOf: operation(
      "clinical.records_create",
      "clinical.templates_create",
      "clinical.resources_manage",
    ),
  },
  "PUT /clinical-resources/:id": {
    anyOf: operation(
      "clinical.records_update",
      "clinical.templates_create",
      "clinical.resources_manage",
    ),
  },
  "POST /clinical-resources/:id/finalize": operation("clinical.finalize"),
  "GET /clinical-records": view("clinical"),
  "GET /clinical-records/:id/revisions": view("clinical"),
  "GET /clinical-workspace/:patientId": view("clinical"),
  "GET /clinical-workspace/:patientId/export": operation("clinical.export"),
  "GET /clinical-workspace/:patientId/access-events": operation(
    "clinical.access_events",
  ),
  "GET /clinical-attachments/:id/content": operation(
    "clinical.attachments_read",
  ),
  "POST /clinical-records": {
    anyOf: operation("clinical.records_create", "clinical.records_update"),
  },
  "POST /clinical-records/:id/finalize": operation("clinical.finalize"),
  "POST /clinical-attachments": operation("clinical.attachments_create"),
  "POST /clinical-addenda": operation("clinical.addenda_create"),
  "POST /clinical-alerts": operation("clinical.records_update"),
  "DELETE /clinical-alerts/:id": operation("clinical.records_update"),
  "POST /assessment-templates/drafts": operation("clinical.templates_create"),
  "PUT /assessment-templates/:id": operation("clinical.templates_create"),
  "POST /assessment-templates": operation("clinical.templates_create"),
  "POST /clinical-assessments": operation("clinical.assessments_create"),
  "POST /therapeutic-goals": operation("clinical.goals_create"),
  "PATCH /therapeutic-goals/:id/status": operation("clinical.goals_status"),
  "POST /clinical-measurements": operation("clinical.measurements_create"),
  "POST /treatment-closures": operation("clinical.closures_create"),

  // Financeiro.
  "PUT /inventory/products/:id": operation("patients.products_update"),
  "PUT /patient-tabs/:id/items/:itemId": operation("patients.tabs_items"),
  "DELETE /patient-tabs/:id/items/:itemId": operation("patients.tabs_items"),
  "GET /patient-tabs/:id/appointment-options": operation("patients.tabs_items"),
  "POST /patient-tabs/:id/services": operation("patients.tabs_items"),
  "DELETE /patient-tabs/:id/services/:itemId": operation("patients.tabs_items"),
  "POST /patient-tabs/:id/appointments": operation(
    "patients.tabs_items",
    "agenda.create",
  ),
  "GET /finance/suppliers": view("finance"),
  "POST /finance/suppliers": operation("finance.suppliers_manage"),
  "PUT /finance/suppliers/:id": operation("finance.suppliers_manage"),
  "POST /finance/receivables": operation("finance.receivables_create"),
  "PUT /finance/classifications/:kind/:id": operation("finance.classify"),
  "PUT /finance/categories/:id/dre": operation("finance.classify"),
  "PUT /finance/entries/:kind/:id/dates": operation("finance.dates_manage"),
  "GET /finance/dre": view("finance"),
  "GET /finance/summary": view("finance"),
  "GET /finance/receivables/:id/receipt": view("finance"),
  "GET /finance/receivables/:id/contact": view("finance"),
  "GET /finance/workspace": view("finance"),
  "GET /finance/daily-cash": view("finance"),
  "GET /finance/forecast": view("finance"),
  "GET /finance/recurring-payables": view("finance"),
  "POST /finance/receivables/:id/pay": operation("finance.receive"),
  "PATCH /finance/receivables/:id/adjust": operation("finance.adjust"),
  "POST /finance/recurring-payables": operation("finance.recurring_create"),
  "PUT /finance/recurring-payables/:id": operation("finance.recurring_update"),
  "DELETE /finance/recurring-payables/:id": operation(
    "finance.recurring_delete",
  ),
  "POST /finance/renegotiations": operation("finance.renegotiate"),
  "POST /finance/commission-rules": operation("finance.commission_rules"),
  "POST /finance/commissions/generate": operation(
    "finance.commissions_generate",
  ),
  "GET /finance/commissions/:id/reconciliation": view("finance"),
  "POST /finance/commissions/:id/reconciliation": operation(
    "finance.commissions_reconcile",
  ),
  "POST /finance/commissions/:id/accounts/:professionalId/pay": operation(
    "finance.commissions_pay",
  ),
  "POST /finance/commission-account-payments/:id/reverse": operation(
    "finance.commissions_reverse",
  ),
  "POST /finance/commissions/:id/pay": operation("finance.commissions_pay"),
  "POST /finance/commissions/:id/reverse": operation(
    "finance.commissions_reverse",
  ),
  "POST /finance/categories": operation("finance.categories_create"),
  "POST /finance/cost-centers": operation("finance.cost_centers_create"),
  "POST /finance/payables": operation("finance.payables_create"),
  "POST /finance/payables/:id/pay": operation("finance.payables_pay"),
  "POST /finance/payables/:id/reverse": operation("finance.payables_reverse"),
  "POST /finance/receivables/:id/reverse": operation(
    "finance.receivables_reverse",
  ),

  // Relatórios (só leitura). Cada planilha tem sua própria permissão de exportação.
  "GET /reports/dre": operation("reports.dre"),
  "GET /reports/dre/export": operation("reports.dre", "reports.dre_export"),
  "GET /reports/management": operation("reports.management"),
  "GET /reports/retention": operation("reports.retention"),
  "GET /reports/clients/details": operation("reports.clients"),
  "GET /reports/clients/details/export": operation(
    "reports.clients",
    "reports.clients_export",
  ),
  "GET /reports/clients": operation("reports.clients"),
  "GET /reports/sales/period": operation("reports.sales"),
  "GET /reports/sales/period.xlsx": operation(
    "reports.sales",
    "reports.sales_export",
  ),
  "GET /reports/sales": operation("reports.sales"),
  "GET /reports/sales/patients/:id": operation("reports.sales"),
  "GET /reports/sales.xlsx": operation("reports.sales", "reports.sales_export"),
  "GET /reports/management.csv": operation(
    "reports.management",
    "reports.management_export",
  ),
};

/** Códigos de erro 403 por módulo (mantêm os códigos das guardas por perfil de antes). */
export const moduleDeniedCodes: Record<AppModule, string> = {
  agenda: "AGENDA_ACCESS_DENIED",
  groups: "GROUP_ACCESS_DENIED",
  patients: "COMMERCIAL_ACCESS_DENIED",
  plans: "COMMERCIAL_ACCESS_DENIED",
  crm: "COMMERCIAL_ACCESS_DENIED",
  relationship: "COMMERCIAL_ACCESS_DENIED",
  waitlist: "COMMERCIAL_ACCESS_DENIED",
  communications: "COMMERCIAL_ACCESS_DENIED",
  contracts: "COMMERCIAL_ACCESS_DENIED",
  settings: "COMMERCIAL_ACCESS_DENIED",
  history: "HISTORY_ACCESS_DENIED",
  clinical: "CLINICAL_ACCESS_DENIED",
  finance: "FINANCE_ACCESS_DENIED",
  reports: "MANAGEMENT_ACCESS_DENIED",
};
