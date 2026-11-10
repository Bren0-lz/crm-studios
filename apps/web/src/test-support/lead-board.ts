import {
  buildLeadFilterOptions,
  buildLeadInsights,
  leadFilterSchema,
  defaultLeadStageKeys,
  leadStageSchema,
  matchesLead,
  parseLeadPageQuery,
  type Lead,
  type LeadStage,
} from "@crm/contracts";

/**
 * Resposta das rotas do funil paginado (`/leads/board`, `/leads/board/:stage`,
 * `/leads/insights`, `/leads/filter-options`) calculada a partir de uma lista de leads,
 * com os mesmos filtros da API. Devolve `undefined` para as demais URLs.
 */
export function leadBoardResponse(
  input: RequestInfo | URL,
  fixtures: readonly unknown[],
) {
  // Os testes montam leads parciais; os campos usados pelos filtros têm padrão aqui.
  const leads = fixtures.map((item) => ({
    tags: [],
    openTasks: 0,
    overdueTasks: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(item as Partial<Lead>),
  })) as Lead[];
  const url = new URL(String(input), "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  if (url.pathname.endsWith("/leads/filter-options"))
    return buildLeadFilterOptions(leads);
  if (url.pathname.endsWith("/leads/insights"))
    return buildLeadInsights(
      leads.filter((lead) => matchesLead(lead, leadFilterSchema.parse(query))),
    );
  const match = /\/leads\/board(?:\/([a-z_]+))?$/.exec(url.pathname);
  if (!match) return undefined;
  const { filter, page } = parseLeadPageQuery(query);
  const visible = leads
    .filter((lead) => matchesLead(lead, filter))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const column = (stage: LeadStage, offset: number) => {
    const inStage = visible.filter((lead) => lead.stage === stage);
    return {
      stage,
      total: inStage.length,
      overdue: inStage.filter((lead) => lead.overdueTasks > 0).length,
      leads: inStage.slice(offset, offset + page.limit),
    };
  };
  return match[1]
    ? column(leadStageSchema.parse(match[1]), page.offset)
    : { columns: defaultLeadStageKeys.map((stage) => column(stage, 0)) };
}

/** URL de uma das rotas do funil paginado (ver `leadBoardResponse`). */
export function isLeadBoardUrl(input: RequestInfo | URL) {
  return /\/leads\/(board|insights|filter-options)(\/|\?|$)/.test(
    String(input),
  );
}
