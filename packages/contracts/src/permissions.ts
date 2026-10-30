import { z } from "zod";
import type { AppModule, UserRole } from "./index.js";

// This catalog is the authority for operations, their dependencies and legacy migration.
const additionalPermissions = new Set([
  "groups.rename",
  "agenda.view_all",
  "agenda.notes",
  "finance.commissions_reconcile",
  "crm.update",
  "crm.stages_manage",
  "finance.external_records_view",
  "finance.external_records_manage",
  "plans.purchase",
  "finance.dates_manage",
  "settings.registry_manage",
  "clinical.resources_manage",
  "finance.classify",
  "finance.receivables_create",
  "finance.suppliers_manage",
  "patients.products_update",
  "reports.dre",
  "reports.team_finance",
  "communications.templates",
  "communications.campaigns",
  "finance.payroll_view",
  "finance.payroll_manage",
]);
/** Exportação de planilha de cada relatório → consulta do relatório exportado. */
const reportSpreadsheetExports: Partial<Record<string, PermissionKey>> = {
  "reports.dre_export": "reports.dre",
  "reports.financial_export": "reports.dre",
  "reports.management_export": "reports.management",
  "reports.clients_export": "reports.clients",
  "reports.sales_export": "reports.sales",
};
const operations = {
  agenda: {
    view_all: "Ver agenda de todos os profissionais",
    notes: "Gerenciar notas da agenda",
    create: "Agendar atendimento",
    recurring: "Agendar atendimentos recorrentes",
    reschedule: "Reagendar atendimento",
    attendance: "Registrar presença e conclusão",
    cancel: "Cancelar atendimento",
    blocks_create: "Criar bloqueio de agenda",
    blocks_cancel: "Cancelar bloqueio",
    professionals_create: "Cadastrar profissional",
    rooms_create: "Cadastrar sala",
    services_create: "Cadastrar serviço",
    satisfaction_create: "Registrar pesquisa de satisfação",
  },
  groups: {
    create: "Criar turma",
    update: "Editar turma",
    rename: "Editar nome da turma",
    enroll: "Matricular cliente",
    cancel_enrollment: "Cancelar matrícula",
    attendance: "Registrar presença na turma",
    complete: "Concluir aula",
    replacement: "Agendar reposição",
  },
  patients: {
    create: "Cadastrar cliente",
    update: "Editar cliente",
    import: "Importar planilha de clientes",
    export: "Exportar planilha de clientes",
    timeline: "Consultar histórico do cliente",
    inventory_view: "Consultar estoque e comandas",
    products_update: "Editar produto",
    products_create: "Cadastrar produto",
    stock_move: "Ajustar estoque",
    tabs_create: "Abrir comanda",
    tabs_items: "Adicionar itens à comanda",
    tabs_close: "Fechar comanda",
    tabs_cancel: "Cancelar comanda",
  },
  plans: {
    purchase: "Contratar plano com agenda e contrato",
    create: "Contratar plano ou sessão",
    status: "Alterar situação do plano",
    cancel: "Cancelar plano",
    renew: "Renovar plano",
    auto_renew: "Configurar renovação automática",
  },
  crm: {
    update: "Editar cadastro do lead",
    create: "Cadastrar lead",
    stage: "Mudar etapa do lead no funil",
    convert: "Converter lead em cliente",
    contacts_create: "Registrar contato do lead",
    tasks_create: "Criar tarefa",
    appointments_create: "Agendar atendimento do lead",
    tasks_status: "Alterar situação da tarefa",
    stages_manage: "Editar etapas do funil",
  },
  relationship: { activities_create: "Registrar contato com cliente" },
  waitlist: { manage: "Gerenciar lista de espera" },
  communications: {
    preferences: "Editar preferências de comunicação",
    messages: "Enviar mensagem individual",
    broadcast: "Preparar e enviar mensagens em massa",
    reminders: "Gerar lembretes",
    templates: "Gerenciar mensagens padrão",
    campaigns: "Criar e enviar campanhas de WhatsApp",
  },
  contracts: {
    templates_create: "Criar modelo de contrato",
    templates_version: "Versionar modelo de contrato",
    issue: "Emitir contrato",
    status: "Alterar situação do contrato",
    cancel: "Cancelar contrato",
  },
  clinical: {
    resources_manage: "Gerenciar aparelhos, exercícios e treinos",
    export: "Exportar prontuário",
    access_events: "Consultar acessos ao prontuário",
    attachments_read: "Baixar anexo clínico",
    records_create: "Registrar relatório ou prescrição",
    records_update: "Editar relatório em rascunho e alertas clínicos",
    finalize: "Finalizar relatório ou prescrição",
    attachments_create: "Anexar documento clínico",
    addenda_create: "Registrar adendo",
    templates_create: "Criar modelo de avaliação",
    assessments_create: "Registrar avaliação",
    goals_create: "Criar objetivo terapêutico",
    goals_status: "Alterar objetivo terapêutico",
    measurements_create: "Registrar medida clínica",
    closures_create: "Registrar alta ou encerramento",
  },
  finance: {
    commissions_reconcile: "Conciliar comissão com a origem",
    external_records_view: "Consultar operações externas registradas",
    external_records_manage:
      "Registrar documentos fiscais e operações com parceiros",
    dates_manage: "Editar datas financeiras",
    suppliers_manage: "Gerenciar fornecedores",
    receivables_create: "Criar cobrança manual",
    classify: "Classificar lançamentos e categorias da DRE",
    receive: "Receber pagamento",
    adjust: "Ajustar recebível",
    recurring_create: "Criar conta recorrente",
    recurring_update: "Editar conta recorrente",
    recurring_delete: "Excluir conta recorrente",
    renegotiate: "Renegociar recebíveis",
    commission_rules: "Configurar regra de comissão",
    commissions_generate: "Gerar comissões",
    commissions_pay: "Pagar comissão",
    commissions_reverse: "Estornar comissão",
    payroll_view: "Consultar folha de pagamento",
    payroll_manage: "Gerenciar colaboradores e lançar a folha de pagamento",
    categories_create: "Cadastrar categoria financeira",
    cost_centers_create: "Cadastrar centro de custo",
    payables_create: "Cadastrar conta a pagar",
    payables_pay: "Pagar conta",
    payables_reverse: "Estornar conta paga",
    receivables_reverse: "Estornar recebimento",
  },
  reports: {
    dre: "Consultar DRE por competência",
    management: "Consultar relatório gerencial",
    team_finance: "Consultar desempenho financeiro da equipe",
    retention: "Consultar retenção",
    clients: "Consultar relatório de clientes",
    sales: "Consultar vendas",
    dre_export: "Exportar planilha da DRE",
    financial_export: "Exportar planilha do relatório financeiro",
    management_export: "Exportar planilha do relatório gerencial",
    clients_export: "Exportar planilha do relatório de clientes",
    sales_export: "Exportar planilha de vendas",
  },
  settings: {
    registry_manage: "Editar e desativar cadastros administrativos",
    plans_delete: "Excluir plano do catálogo antigo",
    plans_create: "Cadastrar plano do catálogo",
    plans_update: "Editar e ativar ou desativar plano do catálogo",
    tags_create: "Criar etiqueta",
    tags_update: "Editar etiqueta",
    tags_delete: "Excluir etiqueta",
  },
  history: {},
} as const;

type OperationKey = {
  [
    M in keyof typeof operations
  ]: `${M}.${keyof (typeof operations)[M] & string}`;
}[keyof typeof operations];
export type PermissionKey = `${AppModule}.view` | OperationKey;
export interface PermissionDefinition {
  key: PermissionKey;
  module: AppModule;
  name: string;
  description: string;
  dependencies: readonly PermissionKey[];
  /** Old modules required for this operation (not a runtime authorization rule). */
  legacyView: readonly AppModule[];
  legacyEdit: readonly AppModule[];
  legacyAdmin?: boolean;
  /** New operations that must not be inferred from the old module flags. */
  explicitGrantOnly?: boolean;
}

export const permissionCatalog: readonly PermissionDefinition[] =
  Object.entries(operations).flatMap(([name, actions]) => {
    const module = name as AppModule;
    return [
      {
        key: `${module}.view` as PermissionKey,
        module,
        name:
          module === "history" ? "Visualizar histórico" : "Visualizar módulo",
        description:
          module === "history"
            ? "Consultar o histórico administrativo da clínica."
            : "Abrir o módulo e consultar seus registros na clínica.",
        dependencies: [],
        legacyView: [module],
        legacyEdit: [],
      },
      ...Object.entries(actions).map(
        ([action, label]): PermissionDefinition => {
          const key = `${module}.${action}` as PermissionKey;
          const dependencies: PermissionKey[] = [`${module}.view`];
          const legacyView: AppModule[] = [module];
          const legacyEdit: AppModule[] = module === "reports" ? [] : [module];
          if (key === "finance.external_records_manage")
            dependencies.push("finance.external_records_view");
          if (key === "reports.team_finance")
            dependencies.push("reports.management");
          if (key === "finance.payroll_manage")
            dependencies.push("finance.payroll_view");
          // Cada planilha de relatório exige consultar o próprio relatório.
          const exportedReport = reportSpreadsheetExports[key];
          if (exportedReport) dependencies.push(exportedReport);
          if (key === "patients.timeline") {
            dependencies.push("crm.view");
            legacyView.push("crm");
            legacyEdit.length = 0;
          }
          if (
            key === "agenda.blocks_create" ||
            key === "agenda.blocks_cancel"
          ) {
            dependencies.push("patients.view");
            legacyView.push("patients");
            legacyEdit.push("patients");
          }
          if (
            key === "clinical.export" ||
            key === "clinical.access_events" ||
            key === "clinical.attachments_read"
          )
            legacyEdit.length = 0;
          if (additionalPermissions.has(key)) legacyEdit.length = 0;
          return {
            key,
            module,
            name: label,
            description: `${label} nos registros acessíveis da clínica.`,
            dependencies,
            legacyView,
            legacyEdit,
            ...(key === "patients.export" ? { legacyAdmin: true } : {}),
            ...(additionalPermissions.has(key) ||
            key === "settings.plans_create" ||
            key === "settings.plans_update" ||
            key === "settings.plans_delete"
              ? { explicitGrantOnly: true }
              : {}),
          };
        },
      ),
    ];
  });
export const permissionKeys = permissionCatalog.map((item) => item.key);
export const permissionKeySchema = z.enum(
  permissionKeys as [PermissionKey, ...PermissionKey[]],
);
export const userPermissionsSchema = z
  .array(permissionKeySchema)
  .max(permissionKeys.length * 2);

/** Canonical order; missing prerequisites deny an action instead of granting extra access. */
export function normalizePermissions(
  chosen: readonly PermissionKey[],
): PermissionKey[] {
  const allowed = new Set(chosen);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of permissionCatalog) {
      if (
        allowed.has(item.key) &&
        item.dependencies.some((key) => !allowed.has(key))
      ) {
        allowed.delete(item.key);
        changed = true;
      }
    }
  }
  return permissionKeys.filter((key) => allowed.has(key));
}
export function effectivePermissions(
  role: UserRole,
  chosen: readonly PermissionKey[] = [],
): PermissionKey[] {
  return role === "admin" ? [...permissionKeys] : normalizePermissions(chosen);
}
export function legacyPermissions(
  role: UserRole,
  modules: readonly AppModule[] = [],
  editModules: readonly AppModule[] = [],
): PermissionKey[] {
  if (role === "admin") return [...permissionKeys];
  return normalizePermissions(
    permissionCatalog
      .filter(
        (item) =>
          !item.legacyAdmin &&
          !item.explicitGrantOnly &&
          item.legacyView.every((module) => modules.includes(module)) &&
          item.legacyEdit.every(
            (module) =>
              modules.includes(module) && editModules.includes(module),
          ),
      )
      .map((item) => item.key),
  );
}
export function permissionModules(
  permissions: readonly PermissionKey[],
): AppModule[] {
  return permissionCatalog
    .filter(
      (item) => item.key.endsWith(".view") && permissions.includes(item.key),
    )
    .map((item) => item.module);
}
/** Compatibility: a module is editable only if ALL its legacy editing operations are allowed. */
export function permissionEditModules(
  permissions: readonly PermissionKey[],
): AppModule[] {
  return permissionModules(permissions).filter((module) => {
    const actions = permissionCatalog.filter(
      (item) =>
        item.module === module &&
        item.legacyEdit.includes(module) &&
        !item.legacyAdmin,
    );
    return (
      actions.length > 0 &&
      actions.every((item) => permissions.includes(item.key))
    );
  });
}
export function togglePermissions(
  current: readonly PermissionKey[],
  keys: readonly PermissionKey[],
  checked: boolean,
): PermissionKey[] {
  const selected = new Set(current);
  const add = (key: PermissionKey) => {
    if (selected.has(key)) return;
    permissionCatalog
      .find((item) => item.key === key)
      ?.dependencies.forEach(add);
    selected.add(key);
  };
  keys.forEach((key) => (checked ? add(key) : selected.delete(key)));
  return normalizePermissions([...selected]);
}
export interface PermissionInput {
  permissions?: PermissionKey[] | undefined;
  modules?: AppModule[] | null | undefined;
  editModules?: AppModule[] | null | undefined;
}
export function validatePermissionInput(
  input: PermissionInput,
  ctx: z.RefinementCtx,
) {
  if (
    input.permissions !== undefined &&
    (input.modules !== undefined || input.editModules !== undefined)
  )
    ctx.addIssue({
      code: "custom",
      path: ["permissions"],
      message: "Envie permissions ou modules/editModules, nunca ambos.",
    });
  if (
    input.permissions &&
    normalizePermissions(input.permissions).length !==
      new Set(input.permissions).size
  )
    ctx.addIssue({
      code: "custom",
      path: ["permissions"],
      message: "Inclua as permissões de visualização necessárias à operação.",
    });
}
export function resolvePermissionInput(
  role: UserRole,
  input: PermissionInput,
  previous: readonly PermissionKey[] = [],
): PermissionKey[] {
  if (role === "admin") return [...permissionKeys];
  if (input.permissions !== undefined)
    return normalizePermissions(input.permissions);
  if (input.modules !== undefined || input.editModules !== undefined)
    return legacyPermissions(
      role,
      input.modules === undefined
        ? permissionModules(previous)
        : (input.modules ?? []),
      input.editModules === undefined
        ? permissionEditModules(previous)
        : (input.editModules ?? []),
    );
  return normalizePermissions(previous);
}
