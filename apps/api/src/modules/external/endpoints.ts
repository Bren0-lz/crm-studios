import type { ExternalEndpoint } from "@crm/contracts";

/**
 * Rota da API externa que repassa a chamada à rota interna `target` (mesma validação, regra,
 * permissões e histórico). `:param` do caminho externo é substituído no `target`; a query
 * original segue junto.
 */
export interface ProxiedEndpoint extends ExternalEndpoint {
  target: string;
}

/** Leituras próprias da API externa (formatos estáveis de `integrations/external.ts`). */
export const nativeEndpoints: ExternalEndpoint[] = [
  {
    method: "GET",
    path: "/external/v1",
    scope: "sales:read",
    description: "Índice: clínica, chave usada e rotas disponíveis.",
  },
  {
    method: "POST",
    path: "/external/v1/auth/login",
    scope: "sales:read",
    description:
      "Login do painel de vendas (email, password). Só entra quem tem o acesso ao painel marcado no cadastro (nem o admin, sem ele). Devolve o token para o cabeçalho X-CRM-User-Token: com ele, as chamadas agem como essa pessoa.",
  },
  {
    method: "GET",
    path: "/external/v1/groups",
    scope: "sales:read",
    description:
      "Tabela de turmas: capacidade, inscritos, vagas livres, lista de espera, nomes dos matriculados ativos na ordem de inscrição (memberNames; só o nome, sem a lista de espera, com ou sem acesso a Clientes), ocupação, faturamento mensal atual/potencial e linha do serviço no painel (businessLine: studio | aesthetics). Com acesso ao Financeiro, também os matriculados com parcela vencida e a soma delas (overdueMembers, overdueInCents; mesma regra de /external/v1/overdue). Query: includeInactive=true.",
  },
  {
    method: "GET",
    path: "/external/v1/groups/:id",
    scope: "sales:read",
    description:
      "Turma com as pessoas inscritas (valor mensal) e a lista de espera da turma, com os mesmos campos da tabela de turmas (businessLine; overdueMembers e overdueInCents com acesso ao Financeiro). Contato de cada pessoa (phone, whatsapp, email) só com acesso a Clientes; sem ele, só o nome. Com acesso ao Financeiro, cada inscrito ativo com parcela vencida traz overdue (amountInCents, installments, oldestDueDate, daysOverdue; mesma regra de /external/v1/overdue); sem atraso, o campo não vem.",
  },
  {
    method: "GET",
    path: "/external/v1/patients",
    scope: "sales:read",
    description:
      "Busca de clientes com planos ativos e turmas. Query: search, limit (até 100).",
  },
  {
    method: "GET",
    path: "/external/v1/overdue",
    scope: "sales:read",
    description:
      "Inadimplência por cliente: parcelas em aberto vencidas (valor, quantidade, vencimento mais antigo, dias e faixa de atraso) e turmas do cliente. Exige acesso ao Financeiro.",
  },
];

export const proxiedEndpoints: ProxiedEndpoint[] = [
  {
    method: "GET",
    path: "/external/v1/patients/:id/plans",
    target: "/plans?patientId=:id",
    scope: "sales:read",
    description: "Planos do cliente, com a situação das parcelas.",
  },
  {
    method: "GET",
    path: "/external/v1/services",
    target: "/services",
    scope: "sales:read",
    description:
      "Serviços (valor da sessão do plano avulso, duração, linha no painel: businessLine studio | aesthetics, ativos).",
  },
  {
    method: "GET",
    path: "/external/v1/professionals",
    target: "/professionals",
    scope: "sales:read",
    description: "Profissionais.",
  },
  {
    method: "GET",
    path: "/external/v1/plan-catalog",
    target: "/plan-catalog",
    scope: "sales:read",
    description: "Catálogo de planos e pacotes à venda.",
  },
  {
    method: "GET",
    path: "/external/v1/leads",
    target: "/leads",
    scope: "sales:read",
    description:
      "Leads filtrados. Query: search, source, interest, stage, responsibleUserId, from, to, tasks, contact.",
  },
  {
    method: "GET",
    path: "/external/v1/leads/board",
    target: "/leads/board",
    scope: "sales:read",
    description: "Funil: primeira página e total de cada etapa.",
  },
  {
    method: "GET",
    path: "/external/v1/leads/insights",
    target: "/leads/insights",
    scope: "sales:read",
    description:
      "Indicadores do funil: total, abertos, ganhos, perdidos, conversão, origens e motivos de perda.",
  },
  {
    method: "GET",
    path: "/external/v1/leads/stages",
    target: "/leads/stages",
    scope: "sales:read",
    description: "Etapas do funil da clínica.",
  },
  {
    method: "GET",
    path: "/external/v1/leads/filter-options",
    target: "/leads/filter-options",
    scope: "sales:read",
    description: "Valores disponíveis para os filtros de leads.",
  },
  {
    method: "GET",
    path: "/external/v1/leads/:id/activity",
    target: "/leads/:id/activity",
    scope: "sales:read",
    description: "Contatos, tarefas e histórico do lead.",
  },
  {
    method: "GET",
    path: "/external/v1/waitlist",
    target: "/waitlist",
    scope: "sales:read",
    description: "Lista de espera geral (serviço ou produto).",
  },
  {
    method: "GET",
    path: "/external/v1/sales",
    target: "/reports/sales",
    scope: "sales:read",
    description:
      "Relatório de vendas do mês, com comparação ao mês anterior. Query: month=AAAA-MM.",
  },
  {
    method: "GET",
    path: "/external/v1/sales/period",
    target: "/reports/sales/period",
    scope: "sales:read",
    description: "Vendas de um período. Query: from, to (AAAA-MM-DD).",
  },
  {
    method: "GET",
    path: "/external/v1/finance/summary",
    target: "/finance/summary",
    scope: "sales:read",
    description: "A receber: em aberto, vencido e recebido no mês.",
  },
  {
    method: "POST",
    path: "/external/v1/leads",
    target: "/leads",
    scope: "sales:write",
    description: "Cria um lead.",
  },
  {
    method: "PUT",
    path: "/external/v1/leads/:id",
    target: "/leads/:id",
    scope: "sales:write",
    description: "Atualiza o lead.",
  },
  {
    method: "PATCH",
    path: "/external/v1/leads/:id/stage",
    target: "/leads/:id/stage",
    scope: "sales:write",
    description: "Move o lead de etapa (lostReason ao perder).",
  },
  {
    method: "POST",
    path: "/external/v1/leads/:id/contacts",
    target: "/leads/:id/contacts",
    scope: "sales:write",
    description: "Registra um contato com o lead.",
  },
  {
    method: "POST",
    path: "/external/v1/leads/:id/tasks",
    target: "/leads/:id/tasks",
    scope: "sales:write",
    description: "Cria uma tarefa para o lead.",
  },
  {
    method: "PATCH",
    path: "/external/v1/lead-tasks/:id/status",
    target: "/lead-tasks/:id/status",
    scope: "sales:write",
    description: "Conclui ou reabre a tarefa do lead.",
  },
  {
    method: "POST",
    path: "/external/v1/leads/:id/convert",
    target: "/leads/:id/convert",
    scope: "sales:write",
    description:
      "Converte o lead em cliente (reaproveita cadastro existente pelo CPF).",
  },
  {
    method: "POST",
    path: "/external/v1/patients",
    target: "/patients",
    scope: "sales:write",
    description: "Cadastra um cliente.",
  },
  {
    method: "POST",
    path: "/external/v1/group-enrollments",
    target: "/group-enrollments",
    scope: "sales:write",
    description:
      "Inscreve o cliente na turma; turma cheia → status waitlisted com queuePosition.",
  },
  {
    method: "POST",
    path: "/external/v1/group-enrollments/:id/cancel",
    target: "/group-enrollments/:id/cancel",
    scope: "sales:write",
    description: "Cancela a inscrição (promove o primeiro da lista de espera).",
  },
  {
    method: "POST",
    path: "/external/v1/plans/purchases",
    target: "/plans/purchases",
    scope: "sales:write",
    description:
      "Vende um plano (com idempotencyKey), opcionalmente inscrevendo na turma (groupId); gera as parcelas no Financeiro.",
  },
  {
    method: "POST",
    path: "/external/v1/waitlist",
    target: "/waitlist",
    scope: "sales:write",
    description: "Adiciona à lista de espera.",
  },
  {
    method: "PATCH",
    path: "/external/v1/waitlist/:id",
    target: "/waitlist/:id",
    scope: "sales:write",
    description: "Atualiza a entrada da lista de espera.",
  },
  {
    method: "DELETE",
    path: "/external/v1/waitlist/:id",
    target: "/waitlist/:id",
    scope: "sales:write",
    description: "Remove da lista de espera.",
  },
];

export const externalEndpoints: ExternalEndpoint[] = [
  ...nativeEndpoints,
  ...proxiedEndpoints.map(({ method, path, scope, description }) => ({
    method,
    path,
    scope,
    description,
  })),
];
