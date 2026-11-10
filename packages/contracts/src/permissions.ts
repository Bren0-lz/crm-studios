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
  "patients.tabs_refund",
  "patients.suppliers_manage",
  "reports.dre",
  "reports.team_finance",
  "reports.campaigns",
  "reports.campaigns_export",
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
  "reports.campaigns_export": "reports.campaigns",
};
/** Nome curto (frase de ação) e descrição em linguagem simples, exibidos na tela de permissões. */
type OperationText = { readonly name: string; readonly description: string };
const op = (name: string, description: string): OperationText => ({
  name,
  description,
});
const needs = (name: string) => ` Precisa também de "${name}".`;
const spreadsheet = (report: string) =>
  `Permite baixar este relatório em planilha do Excel.${needs(report)}`;

/** Permissão de entrada de cada área (`<módulo>.view`). */
const moduleAccess: Record<AppModule, OperationText> = {
  agenda: op(
    "Acessar a agenda",
    "Mostra a Agenda no menu e permite ver os horários marcados. Sem esta opção, as outras da Agenda não funcionam.",
  ),
  groups: op(
    "Acessar as turmas",
    "Mostra Turmas no menu e permite ver as turmas e quem está matriculado. Sem esta opção, as outras de Turmas não funcionam.",
  ),
  patients: op(
    "Acessar os clientes",
    "Mostra Clientes no menu e permite ver o cadastro de cada cliente. Sem esta opção, as outras de Clientes não funcionam.",
  ),
  plans: op(
    "Acessar planos e sessões",
    "Permite ver os planos e as sessões contratados pelos clientes. Sem esta opção, as outras de Planos e sessões não funcionam.",
  ),
  crm: op(
    "Acessar o CRM comercial",
    "Mostra o CRM no menu e permite ver as pessoas interessadas (leads) e o funil de vendas. Sem esta opção, as outras do CRM não funcionam.",
  ),
  events: op(
    "Acessar os eventos",
    "Permite ver os eventos (aulões, workshops) e seus participantes. Sem esta opção, as outras de Eventos não funcionam.",
  ),
  relationship: op(
    "Acessar contatos sugeridos",
    "Mostra a lista de clientes que o sistema sugere contatar (aniversário, sumidos, fim de plano).",
  ),
  waitlist: op(
    "Acessar a lista de espera",
    "Permite ver quem está esperando vaga em horários e turmas. Sem esta opção, as outras da Lista de espera não funcionam.",
  ),
  communications: op(
    "Acessar as comunicações",
    "Permite ver as mensagens enviadas aos clientes. Sem esta opção, as outras de Comunicações não funcionam.",
  ),
  contracts: op(
    "Acessar os contratos",
    "Permite ver os contratos dos clientes e os modelos de contrato. Sem esta opção, as outras de Contratos não funcionam.",
  ),
  clinical: op(
    "Acessar os prontuários",
    "Permite abrir o prontuário dos clientes, com dados de saúde. Sem esta opção, as outras de Prontuários não funcionam.",
  ),
  finance: op(
    "Acessar o financeiro",
    "Mostra o Financeiro no menu e permite ver cobranças, pagamentos e contas. Sem esta opção, as outras do Financeiro não funcionam.",
  ),
  reports: op(
    "Acessar os relatórios",
    "Mostra Relatórios no menu. Cada relatório ainda precisa ser liberado nas opções abaixo.",
  ),
  settings: op(
    "Acessar as configurações",
    "Mostra Configurações no menu e permite ver os cadastros do estúdio (profissionais, salas, serviços, planos e etiquetas).",
  ),
  history: op(
    "Acessar o histórico",
    "Permite ver quem fez cada alteração no sistema e quando.",
  ),
};

const operations = {
  agenda: {
    view_all: op(
      "Ver a agenda de todos",
      "Mostra os horários de todos os profissionais. Sem esta opção, a pessoa vê só a própria agenda.",
    ),
    notes: op(
      "Escrever recados na agenda",
      "Permite criar, editar e apagar recados nos dias da agenda.",
    ),
    create: op(
      "Agendar atendimento",
      "Permite marcar um horário de atendimento para um cliente.",
    ),
    recurring: op(
      "Agendar horários fixos",
      "Permite marcar o mesmo horário em várias semanas de uma vez.",
    ),
    reschedule: op(
      "Remarcar atendimento",
      "Permite mudar o dia ou o horário de um atendimento já marcado.",
    ),
    attendance: op(
      "Marcar presença",
      "Permite marcar se o cliente veio ou faltou e dar o atendimento como concluído.",
    ),
    cancel: op(
      "Cancelar atendimento",
      "Permite desmarcar um atendimento que estava agendado.",
    ),
    blocks_create: op(
      "Bloquear horários",
      "Permite fechar horários na agenda (folga, feriado, manutenção) para ninguém marcar neles.",
    ),
    blocks_cancel: op(
      "Liberar horários bloqueados",
      "Permite desfazer um bloqueio e deixar o horário livre de novo.",
    ),
    professionals_create: op(
      "Cadastrar profissional",
      "Permite adicionar um novo profissional que atende na agenda.",
    ),
    rooms_create: op(
      "Cadastrar sala",
      "Permite adicionar uma nova sala de atendimento.",
    ),
    services_create: op(
      "Cadastrar serviço",
      "Permite adicionar um novo tipo de atendimento (ex.: Pilates, depilação).",
    ),
    satisfaction_create: op(
      "Registrar pesquisa de satisfação",
      "Permite anotar a nota e o comentário do cliente sobre o atendimento.",
    ),
  },
  groups: {
    overview: op(
      "Ver resumo das turmas",
      "Mostra a lotação, as vagas livres e a frequência de todas as turmas.",
    ),
    create: op(
      "Criar turma",
      "Permite abrir uma nova turma com dias, horários e número de vagas.",
    ),
    update: op(
      "Editar turma",
      "Permite mudar dias, horários, vagas e profissional de uma turma.",
    ),
    rename: op(
      "Renomear turma",
      "Permite mudar só o nome da turma, sem mexer em horários e vagas.",
    ),
    enroll: op("Matricular cliente", "Permite colocar um cliente numa turma."),
    cancel_enrollment: op(
      "Tirar cliente da turma",
      "Permite cancelar a matrícula de um cliente numa turma.",
    ),
    attendance: op(
      "Fazer chamada",
      "Permite marcar quem veio e quem faltou na aula da turma.",
    ),
    complete: op("Encerrar aula", "Permite dar a aula do dia como concluída."),
    replacement: op(
      "Marcar reposição",
      "Permite agendar uma aula extra para o cliente que faltou.",
    ),
  },
  patients: {
    create: op("Cadastrar cliente", "Permite adicionar um novo cliente."),
    update: op(
      "Editar cliente",
      "Permite mudar os dados de cadastro de um cliente (contato, endereço, observações).",
    ),
    import: op(
      "Importar clientes de planilha",
      "Permite cadastrar vários clientes de uma vez a partir de um arquivo do Excel.",
    ),
    export: op(
      "Baixar lista de clientes",
      "Permite baixar a lista completa de clientes em planilha. Contém dados pessoais: libere com cuidado.",
    ),
    timeline: op(
      "Ver histórico do cliente",
      "Mostra tudo o que aconteceu com o cliente: atendimentos, compras, contatos e mensagens.",
    ),
    inventory_view: op(
      "Ver estoque e comandas",
      "Mostra os produtos em estoque e as comandas de venda de produtos.",
    ),
    products_update: op(
      "Editar produto",
      "Permite mudar nome, preço e outros dados de um produto.",
    ),
    products_create: op(
      "Cadastrar produto",
      "Permite adicionar um novo produto para vender.",
    ),
    stock_move: op(
      "Ajustar estoque",
      "Permite dar entrada ou saída de produtos no estoque.",
    ),
    suppliers_manage: op(
      "Cadastrar fornecedores de produtos",
      "Permite ver e adicionar fornecedores na tela de vendas de produtos.",
    ),
    tabs_create: op(
      "Abrir comanda",
      "Permite começar uma venda de produtos para um cliente.",
    ),
    tabs_items: op(
      "Adicionar produtos à comanda",
      "Permite incluir e tirar produtos de uma comanda aberta.",
    ),
    tabs_close: op(
      "Fechar comanda",
      "Permite finalizar a venda de produtos e registrar o pagamento.",
    ),
    tabs_cancel: op(
      "Cancelar comanda",
      "Permite cancelar uma venda de produtos.",
    ),
    tabs_refund: op(
      "Devolver dinheiro ao cancelar venda",
      `Ao cancelar uma venda já paga, permite devolver o valor ao cliente.${needs("Cancelar comanda")}`,
    ),
  },
  plans: {
    purchase: op(
      "Vender plano completo",
      "Permite vender um plano já marcando os horários na agenda e gerando o contrato.",
    ),
    create: op(
      "Vender plano ou sessão avulsa",
      "Permite vender um plano ou uma sessão avulsa para um cliente.",
    ),
    status: op(
      "Pausar ou reativar plano",
      "Permite pausar o plano de um cliente e depois reativá-lo.",
    ),
    cancel: op("Cancelar plano", "Permite cancelar o plano de um cliente."),
    renew: op(
      "Renovar plano",
      "Permite renovar o plano de um cliente por mais um período.",
    ),
    auto_renew: op(
      "Ligar renovação automática",
      "Permite ligar ou desligar a renovação automática do plano de um cliente.",
    ),
  },
  crm: {
    update: op(
      "Editar interessado",
      "Permite mudar os dados de uma pessoa interessada (lead).",
    ),
    create: op(
      "Cadastrar interessado",
      "Permite adicionar uma nova pessoa interessada (lead).",
    ),
    stage: op(
      "Mover interessado no funil",
      "Permite mudar em que etapa da negociação o interessado está.",
    ),
    convert: op(
      "Transformar interessado em cliente",
      "Permite cadastrar o interessado como cliente quando ele fecha.",
    ),
    contacts_create: op(
      "Registrar contato com interessado",
      "Permite anotar ligações, mensagens e conversas com o interessado.",
    ),
    tasks_create: op(
      "Criar tarefa",
      "Permite criar lembretes de tarefas (ex.: ligar para o interessado amanhã).",
    ),
    appointments_create: op(
      "Agendar visita do interessado",
      "Permite marcar um horário na agenda para o interessado.",
    ),
    tasks_status: op(
      "Concluir tarefa",
      "Permite marcar uma tarefa como feita ou voltar para pendente.",
    ),
    stages_manage: op(
      "Editar etapas do funil",
      "Permite criar, renomear e reordenar as etapas do funil de vendas.",
    ),
  },
  // Eventos do comercial: o participante é um lead do CRM ligado ao evento.
  events: {
    manage: op(
      "Criar e editar eventos",
      "Permite cadastrar eventos (aulões, workshops) e editar seus dados e participantes.",
    ),
  },
  relationship: {
    activities_create: op(
      "Registrar contato com cliente",
      "Permite anotar que o cliente foi contatado (ligação, mensagem, visita).",
    ),
  },
  waitlist: {
    manage: op(
      "Gerenciar lista de espera",
      "Permite incluir, chamar e tirar clientes da lista de espera.",
    ),
  },
  communications: {
    preferences: op(
      "Editar preferências de contato",
      "Permite mudar por quais canais o cliente aceita receber mensagens.",
    ),
    messages: op(
      "Enviar mensagem",
      "Permite mandar mensagem para um cliente de cada vez.",
    ),
    broadcast: op(
      "Enviar mensagem para vários",
      "Permite preparar e mandar a mesma mensagem para muitos clientes de uma vez.",
    ),
    reminders: op(
      "Gerar lembretes",
      "Permite criar lembretes de atendimento para enviar aos clientes.",
    ),
    templates: op(
      "Editar mensagens prontas",
      "Permite criar e editar os textos padrão usados nas mensagens.",
    ),
    campaigns: op(
      "Criar campanhas de WhatsApp",
      "Permite criar e disparar campanhas de mensagens pelo WhatsApp.",
    ),
  },
  contracts: {
    templates_create: op(
      "Criar modelo de contrato",
      "Permite escrever um novo modelo de contrato.",
    ),
    templates_version: op(
      "Atualizar modelo de contrato",
      "Permite salvar uma nova versão de um modelo. Contratos já gerados continuam com o texto antigo.",
    ),
    templates_delete: op(
      "Excluir modelo de contrato",
      "Permite apagar um modelo de contrato.",
    ),
    issue: op(
      "Gerar contrato",
      "Permite criar o contrato de um cliente a partir de um modelo.",
    ),
    status: op(
      "Emitir contrato",
      "Permite marcar o contrato em rascunho como emitido, pronto para o cliente assinar.",
    ),
    cancel: op(
      "Cancelar contrato",
      "Permite cancelar o contrato de um cliente.",
    ),
  },
  clinical: {
    resources_manage: op(
      "Cadastrar aparelhos, exercícios e treinos",
      "Permite manter a lista de aparelhos, exercícios e treinos usados nos atendimentos.",
    ),
    export: op(
      "Baixar prontuário",
      "Permite baixar o prontuário completo do cliente. Contém dados de saúde: libere com cuidado.",
    ),
    access_events: op(
      "Ver quem abriu o prontuário",
      "Mostra quem consultou o prontuário de cada cliente e quando.",
    ),
    attachments_read: op(
      "Baixar anexos do prontuário",
      "Permite abrir e baixar exames e documentos anexados ao prontuário.",
    ),
    records_create: op(
      "Escrever evolução ou prescrição",
      "Permite registrar o relato do atendimento ou uma prescrição.",
    ),
    records_update: op(
      "Editar rascunho e alertas",
      "Permite mudar registros ainda não finalizados e os alertas de saúde do cliente.",
    ),
    finalize: op(
      "Finalizar evolução ou prescrição",
      "Permite finalizar o registro. Depois de finalizado, ele não pode mais ser editado.",
    ),
    attachments_create: op(
      "Anexar documento ao prontuário",
      "Permite enviar exames, fotos e outros arquivos para o prontuário.",
    ),
    addenda_create: op(
      "Complementar registro finalizado",
      "Permite incluir uma correção ou complemento num registro já finalizado, sem apagar o original.",
    ),
    templates_create: op(
      "Criar modelo de avaliação",
      "Permite montar formulários de avaliação para usar com os clientes.",
    ),
    assessments_create: op(
      "Fazer avaliação",
      "Permite preencher uma avaliação do cliente.",
    ),
    goals_create: op(
      "Criar objetivo de tratamento",
      "Permite registrar o que se quer alcançar no tratamento do cliente.",
    ),
    goals_status: op(
      "Atualizar objetivo de tratamento",
      "Permite marcar um objetivo do tratamento como alcançado, pausado ou cancelado.",
    ),
    measurements_create: op(
      "Registrar medidas",
      "Permite anotar medidas do cliente (peso, dor, amplitude de movimento etc.).",
    ),
    closures_create: op(
      "Dar alta",
      "Permite registrar a alta ou o fim do tratamento do cliente.",
    ),
  },
  finance: {
    commissions_reconcile: op(
      "Conferir comissões",
      "Permite ligar cada comissão ao atendimento ou à venda que a gerou.",
    ),
    external_records_view: op(
      "Ver notas e operações externas",
      "Mostra notas fiscais e operações feitas com parceiros fora do sistema.",
    ),
    external_records_manage: op(
      "Lançar notas e operações externas",
      `Permite registrar notas fiscais e operações com parceiros.${needs("Ver notas e operações externas")}`,
    ),
    dates_manage: op(
      "Mudar datas de lançamentos",
      "Permite alterar vencimento e data de pagamento de lançamentos já feitos.",
    ),
    suppliers_manage: op(
      "Cadastrar fornecedores",
      "Permite adicionar e editar fornecedores no Financeiro.",
    ),
    receivables_create: op(
      "Criar cobrança avulsa",
      "Permite lançar uma cobrança para o cliente fora de plano ou venda.",
    ),
    classify: op(
      "Organizar categorias de gastos e receitas",
      "Permite escolher a categoria de cada lançamento e montar as categorias usadas no resultado do mês (DRE).",
    ),
    receive: op(
      "Registrar pagamento recebido",
      "Permite dar baixa numa cobrança quando o cliente paga.",
    ),
    adjust: op(
      "Corrigir valor a receber",
      "Permite mudar o valor de uma cobrança (desconto, acréscimo ou correção).",
    ),
    recurring_create: op(
      "Criar conta fixa",
      "Permite cadastrar contas que se repetem todo mês (aluguel, luz, internet).",
    ),
    recurring_update: op(
      "Editar conta fixa",
      "Permite mudar valor, vencimento e dados de uma conta que se repete todo mês.",
    ),
    recurring_delete: op(
      "Excluir conta fixa",
      "Permite apagar uma conta que se repete todo mês.",
    ),
    renegotiate: op(
      "Renegociar dívida",
      "Permite juntar cobranças em atraso do cliente e dividir em novas parcelas.",
    ),
    commission_rules: op(
      "Definir regras de comissão",
      "Permite configurar quanto cada profissional ganha por atendimento ou venda.",
    ),
    commissions_generate: op(
      "Calcular comissões",
      "Permite calcular as comissões do período a partir das regras.",
    ),
    commissions_pay: op(
      "Pagar comissão",
      "Permite registrar o pagamento da comissão ao profissional.",
    ),
    commissions_reverse: op(
      "Desfazer pagamento de comissão",
      "Permite cancelar um pagamento de comissão já registrado.",
    ),
    payroll_view: op(
      "Ver folha de pagamento",
      "Mostra salários e pagamentos da equipe.",
    ),
    payroll_manage: op(
      "Lançar folha de pagamento",
      `Permite cadastrar colaboradores e lançar salários.${needs("Ver folha de pagamento")}`,
    ),
    categories_create: op(
      "Criar categoria financeira",
      "Permite criar categorias para organizar receitas e despesas.",
    ),
    cost_centers_create: op(
      "Criar centro de custo",
      "Permite criar grupos para separar despesas por área (ex.: Pilates, recepção).",
    ),
    payables_create: op(
      "Lançar conta a pagar",
      "Permite registrar uma despesa que o estúdio precisa pagar.",
    ),
    payables_pay: op(
      "Pagar conta",
      "Permite dar baixa numa conta a pagar quando ela é paga.",
    ),
    payables_reverse: op(
      "Desfazer pagamento de conta",
      "Permite cancelar a baixa de uma conta que já tinha sido paga.",
    ),
    receivables_reverse: op(
      "Desfazer recebimento",
      "Permite cancelar a baixa de um pagamento recebido do cliente.",
    ),
  },
  reports: {
    dre: op(
      "Ver resultado do mês (DRE)",
      "Mostra receitas, despesas e lucro de cada mês.",
    ),
    management: op(
      "Ver relatório gerencial",
      "Mostra os principais números do estúdio, como faturamento e atendimentos.",
    ),
    team_finance: op(
      "Ver ganhos por profissional",
      `Mostra quanto cada profissional faturou e recebeu.${needs("Ver relatório gerencial")}`,
    ),
    retention: op(
      "Ver permanência de clientes",
      "Mostra quantos clientes continuam vindo e quantos deixaram de vir.",
    ),
    clients: op(
      "Ver relatório de clientes",
      "Mostra números sobre os clientes, como novos, ativos e inativos.",
    ),
    sales: op(
      "Ver relatório de vendas",
      "Mostra as vendas de planos, sessões e produtos.",
    ),
    campaigns: op(
      "Ver resultado das campanhas",
      "Mostra o resultado das campanhas e das mensagens enviadas aos clientes.",
    ),
    dre_export: op(
      "Baixar planilha da DRE",
      spreadsheet("Ver resultado do mês (DRE)"),
    ),
    financial_export: op(
      "Baixar planilha financeira",
      `Permite baixar receitas e despesas detalhadas em planilha do Excel.${needs("Ver resultado do mês (DRE)")}`,
    ),
    management_export: op(
      "Baixar planilha gerencial",
      spreadsheet("Ver relatório gerencial"),
    ),
    clients_export: op(
      "Baixar planilha de clientes",
      spreadsheet("Ver relatório de clientes"),
    ),
    sales_export: op(
      "Baixar planilha de vendas",
      spreadsheet("Ver relatório de vendas"),
    ),
    campaigns_export: op(
      "Baixar planilha das campanhas",
      spreadsheet("Ver resultado das campanhas"),
    ),
  },
  settings: {
    registry_manage: op(
      "Editar cadastros básicos",
      "Permite editar e desativar profissionais, salas e serviços já cadastrados.",
    ),
    plans_delete: op(
      "Excluir plano antigo",
      "Permite apagar planos do catálogo antigo que não são mais usados.",
    ),
    plans_create: op(
      "Criar plano para venda",
      "Permite criar um novo plano no catálogo de planos à venda.",
    ),
    plans_update: op(
      "Editar plano para venda",
      "Permite mudar preço e regras de um plano e tirá-lo ou colocá-lo à venda.",
    ),
    tags_create: op(
      "Criar etiqueta",
      "Permite criar etiquetas para marcar e filtrar clientes.",
    ),
    tags_update: op(
      "Editar etiqueta",
      "Permite mudar o nome e a cor de uma etiqueta.",
    ),
    tags_delete: op(
      "Excluir etiqueta",
      "Permite apagar uma etiqueta. Ela some de todos os clientes marcados.",
    ),
  },
  history: {},
} as const satisfies Record<AppModule, Record<string, OperationText>>;

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
        name: moduleAccess[module].name,
        description: moduleAccess[module].description,
        dependencies: [],
        legacyView: [module],
        legacyEdit: [],
      },
      ...Object.entries(actions).map(([action, text]): PermissionDefinition => {
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
        // Estorno pelo cancelamento da venda, sem acesso ao Financeiro.
        if (key === "patients.tabs_refund")
          dependencies.push("patients.tabs_cancel");
        // Cada planilha de relatório exige consultar o próprio relatório.
        const exportedReport = reportSpreadsheetExports[key];
        if (exportedReport) dependencies.push(exportedReport);
        if (key === "patients.timeline") {
          dependencies.push("crm.view");
          legacyView.push("crm");
          legacyEdit.length = 0;
        }
        if (key === "agenda.blocks_create" || key === "agenda.blocks_cancel") {
          dependencies.push("patients.view");
          legacyView.push("patients");
          legacyEdit.push("patients");
        }
        // Só consulta: quem já via Turmas continua vendo a visão geral.
        if (key === "groups.overview") legacyEdit.length = 0;
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
          name: text.name,
          description: text.description,
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
      }),
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
