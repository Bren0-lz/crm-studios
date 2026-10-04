import type { AppModule } from "@crm/contracts";

/** Nível exigido num módulo: "view" para leituras, "edit" para gravações. */
export type AccessLevel = "view" | "edit";
export interface ModuleRequirement {
  module: AppModule;
  level: AccessLevel;
}
/**
 * - `public`: sem login (saúde e login).
 * - `login`: basta estar logado (usuário ativo).
 * - `owner`: Administração, sempre só da gestora (não é módulo configurável).
 * - lista de módulos: o usuário precisa de TODOS os níveis listados.
 * - `{ anyOf: [...] }`: basta UM dos níveis listados (leituras de apoio usadas por várias
 *   telas). O 403 usa o código do primeiro módulo e cita todos na mensagem.
 */
export type RouteAccess =
  | "public"
  | "login"
  | "owner"
  | ModuleRequirement[]
  | { anyOf: ModuleRequirement[] };

const view = (...modules: AppModule[]): ModuleRequirement[] =>
  modules.map((module) => ({ module, level: "view" }));
/** Ver qualquer um dos módulos. */
const viewAny = (...modules: AppModule[]) => ({ anyOf: view(...modules) });
const edit = (...modules: AppModule[]): ModuleRequirement[] =>
  modules.map((module) => ({ module, level: "edit" }));

/**
 * Mapa único rota → acesso exigido (chave `MÉTODO /caminho`, como registrado no Fastify).
 * Toda rota precisa estar aqui: `buildApp` recusa subir com rota sem entrada.
 *
 * Com os padrões de perfil (`roleDefaultModules`/`roleDefaultEditModules`) o acesso é o mesmo
 * de antes dos módulos por usuário, exceto a decisão do dono: gravar clientes
 * (`POST /patients`, `PUT /patients/:id`) passa a exigir edição de Clientes — a
 * fisioterapeuta deixa de gravar clientes.
 *
 * Escolhas que preservam o acesso de antes (pontos para o dono revisar):
 * - `/schedule-blocks` (gravações): antes só comercial (owner/recepção/financeiro); exige
 *   editar Agenda E Clientes.
 * - `/professionals`, `/rooms`, `/services` (gravações): antes bastava login; exigem editar
 *   Agenda (todos os perfis têm por padrão).
 * - `/patients/:id/timeline`: antes só comercial; exige ver Clientes E CRM (a fisioterapeuta
 *   vê Clientes, mas não CRM).
 * - `/inventory/*` e `/patient-tabs/*`: antes só comercial; ficam em Clientes. A leitura do
 *   workspace de estoque/comandas exige EDITAR Clientes (ver Clientes a liberaria para a
 *   fisioterapeuta).
 * - `/satisfaction`: antes os 4 perfis; fica em Agenda.
 * - `GET /relationship/settings`: antes só comercial; exige ver Contatos sugeridos OU
 *   Configurações (as duas telas e o cartão de aniversários da Visão geral leem os prazos).
 * - `GET /patients/options` (D11): lista mínima de clientes (id, nome e etiquetas) para as telas
 *   que só escolhem o cliente — exige ver Clientes, Agenda, Comunicações, Contratos OU Turmas.
 *   O cadastro completo (`GET /patients`) continua só com ver Clientes.
 */
export const ROUTE_ACCESS: Record<string, RouteAccess> = {
  "GET /health": "public",
  "POST /auth/login": "public",
  "GET /me": "login",

  // Administração (só a gestora).
  "GET /admin/users": "owner",
  "POST /admin/users": "owner",
  "PATCH /admin/users/:id": "owner",
  "POST /admin/users/:id/reset-password": "owner",
  "PUT /admin/users/:id/professional": "owner",
  "PUT /admin/users/:id/commission": "owner",
  "GET /admin/clinic-settings": "owner",
  "PUT /admin/clinic-settings": "owner",
  "PUT /relationship/settings": "owner",
  "POST /holidays": "owner",
  "DELETE /holidays/:id": "owner",
  "GET /admin/audit-events": "owner",
  "GET /admin/permission-matrix": "owner",
  "GET /patients/export": "owner",

  // Visão geral e leituras de apoio da agenda: só login.
  "GET /dashboard": "login",
  "GET /holidays": "login",
  "GET /professionals": "login",
  "GET /rooms": "login",
  "GET /services": "login",
  "GET /appointments": "login",
  "GET /appointments/:id/reschedules": "login",
  "GET /schedule-blocks": "login",
  "GET /group-sessions": "login",

  // Agenda.
  "POST /professionals": edit("agenda"),
  "POST /rooms": edit("agenda"),
  "POST /services": edit("agenda"),
  "POST /appointments": edit("agenda"),
  "POST /appointments/recurring": edit("agenda"),
  "PUT /appointments/:id/schedule": edit("agenda"),
  "PATCH /appointments/:id/status": edit("agenda"),
  "POST /schedule-blocks": edit("agenda", "patients"),
  "POST /schedule-blocks/:id/cancel": edit("agenda", "patients"),
  "GET /satisfaction": view("agenda"),
  "POST /satisfaction": edit("agenda"),

  // Turmas.
  "GET /groups/workspace": view("groups"),
  "POST /groups": edit("groups"),
  "PUT /groups/:id": edit("groups"),
  "POST /group-enrollments": edit("groups"),
  "POST /group-enrollments/:id/cancel": edit("groups"),
  "PUT /group-sessions/:sessionId/attendance/:patientId": edit("groups"),
  "POST /group-sessions/:id/complete": edit("groups"),
  "POST /group-replacements/book": edit("groups"),

  // Clientes (inclui estoque e comandas).
  "GET /patients": view("patients"),
  "GET /patients/options": viewAny("patients", "agenda", "communications", "contracts", "groups"),
  "POST /patients": edit("patients"),
  "PUT /patients/:id": edit("patients"),
  "POST /patients/import/preview": edit("patients"),
  "POST /patients/import": edit("patients"),
  "GET /patients/:id/timeline": view("patients", "crm"),
  "GET /inventory/workspace": edit("patients"),
  "POST /inventory/products": edit("patients"),
  "POST /inventory/movements": edit("patients"),
  "POST /patient-tabs": edit("patients"),
  "POST /patient-tabs/:id/items": edit("patients"),
  "POST /patient-tabs/:id/close": edit("patients"),
  "POST /patient-tabs/:id/cancel": edit("patients"),

  // Planos e sessões.
  "GET /plans": view("plans"),
  "GET /plans/:id/movements": view("plans"),
  "POST /plans": edit("plans"),
  "PATCH /plans/:id/status": edit("plans"),
  "POST /plans/:id/renew": edit("plans"),
  "PATCH /plans/:id/auto-renew": edit("plans"),

  // CRM comercial.
  "GET /leads": view("crm"),
  "GET /leads/:id/activity": view("crm"),
  "POST /leads": edit("crm"),
  "PATCH /leads/:id/stage": edit("crm"),
  "POST /leads/:id/convert": edit("crm"),
  "POST /leads/:id/contacts": edit("crm"),
  "POST /leads/:id/tasks": edit("crm"),
  "POST /leads/:id/appointments": edit("crm"),
  "PATCH /lead-tasks/:id/status": edit("crm"),

  // Contatos sugeridos (relacionamento).
  "GET /relationship/settings": viewAny("relationship", "settings"),
  "GET /relationship/suggestions": view("relationship"),
  "GET /relationship/birthdays": view("relationship"),
  "GET /relationship/activities": view("relationship"),
  "POST /relationship/activities": edit("relationship"),

  // Comunicações.
  "GET /communications": view("communications"),
  "PUT /communications/preferences": edit("communications"),
  "POST /communications/messages": edit("communications"),
  "POST /communications/broadcast/preview": edit("communications"),
  "POST /communications/broadcast": edit("communications"),
  "POST /communications/reminders/generate": edit("communications"),

  // Contratos.
  "GET /document-templates": view("contracts"),
  "POST /document-templates": edit("contracts"),
  "POST /document-templates/:id/versions": edit("contracts"),
  "GET /documents": view("contracts"),
  "POST /documents": edit("contracts"),
  "PATCH /documents/:id/status": edit("contracts"),

  // Prontuários.
  "GET /clinical-records": view("clinical"),
  "GET /clinical-records/:id/revisions": view("clinical"),
  "GET /clinical-workspace/:patientId": view("clinical"),
  "GET /clinical-workspace/:patientId/export": view("clinical"),
  "GET /clinical-workspace/:patientId/access-events": view("clinical"),
  "GET /clinical-attachments/:id/content": view("clinical"),
  "POST /clinical-records": edit("clinical"),
  "POST /clinical-records/:id/finalize": edit("clinical"),
  "POST /clinical-attachments": edit("clinical"),
  "POST /clinical-addenda": edit("clinical"),
  "POST /assessment-templates": edit("clinical"),
  "POST /clinical-assessments": edit("clinical"),
  "POST /therapeutic-goals": edit("clinical"),
  "PATCH /therapeutic-goals/:id/status": edit("clinical"),
  "POST /clinical-measurements": edit("clinical"),
  "POST /treatment-closures": edit("clinical"),

  // Financeiro.
  "GET /finance/summary": view("finance"),
  "GET /finance/receivables/:id/receipt": view("finance"),
  "GET /finance/workspace": view("finance"),
  "GET /finance/daily-cash": view("finance"),
  "GET /finance/forecast": view("finance"),
  "GET /finance/recurring-payables": view("finance"),
  "POST /finance/receivables/:id/pay": edit("finance"),
  "PATCH /finance/receivables/:id/adjust": edit("finance"),
  "POST /finance/recurring-payables": edit("finance"),
  "PUT /finance/recurring-payables/:id": edit("finance"),
  "DELETE /finance/recurring-payables/:id": edit("finance"),
  "POST /finance/renegotiations": edit("finance"),
  "POST /finance/commission-rules": edit("finance"),
  "POST /finance/commissions/generate": edit("finance"),
  "POST /finance/commissions/:id/pay": edit("finance"),
  "POST /finance/commissions/:id/reverse": edit("finance"),
  "POST /finance/categories": edit("finance"),
  "POST /finance/cost-centers": edit("finance"),
  "POST /finance/payables": edit("finance"),
  "POST /finance/payables/:id/pay": edit("finance"),
  "POST /finance/payables/:id/reverse": edit("finance"),
  "POST /finance/receivables/:id/reverse": edit("finance"),

  // Relatórios (só leitura).
  "GET /reports/management": view("reports"),
  "GET /reports/retention": view("reports"),
  "GET /reports/clients": view("reports"),
  "GET /reports/sales": view("reports"),
  "GET /reports/sales.xlsx": view("reports"),
  "GET /reports/management.csv": view("reports"),
};

/** Códigos de erro 403 por módulo (mantêm os códigos das guardas por perfil de antes). */
export const moduleDeniedCodes: Record<AppModule, string> = {
  agenda: "AGENDA_ACCESS_DENIED",
  groups: "GROUP_ACCESS_DENIED",
  patients: "COMMERCIAL_ACCESS_DENIED",
  plans: "COMMERCIAL_ACCESS_DENIED",
  crm: "COMMERCIAL_ACCESS_DENIED",
  relationship: "COMMERCIAL_ACCESS_DENIED",
  communications: "COMMERCIAL_ACCESS_DENIED",
  contracts: "COMMERCIAL_ACCESS_DENIED",
  settings: "COMMERCIAL_ACCESS_DENIED",
  clinical: "CLINICAL_ACCESS_DENIED",
  finance: "FINANCE_ACCESS_DENIED",
  reports: "MANAGEMENT_ACCESS_DENIED",
};
