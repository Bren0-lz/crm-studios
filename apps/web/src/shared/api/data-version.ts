/**
 * Versão dos dados por domínio (QC6). Toda mutação bem-sucedida feita pelo cliente HTTP
 * incrementa os domínios que ela afeta; as telas assinam (`useDataVersion`) e recarregam
 * em silêncio quando a versão muda, sem precisar remontar.
 */
export type DataDomain =
  | "agenda"
  | "finance"
  | "inventory"
  | "plans"
  | "patients"
  | "history"
  | "clinical"
  | "contracts"
  | "relationship"
  | "waitlist"
  | "crm"
  | "communications";

/** Mapa mutação → domínios afetados. A primeira regra que casar com o caminho vale. */
const mutationRules: [RegExp, DataDomain[]][] = [
  // Consultas feitas por POST (prévias) e sessão não alteram dados.
  [/\/preview(?:$|[/?])|^\/auth\//, []],
  // Fechar/cancelar comanda (ou registrar venda de produtos) gera cobrança, baixa estoque,
  // cria crédito de sessão e vincula atendimentos.
  [
    /^\/(?:patient-tabs|product-sales)(?:\/|$)/,
    ["inventory", "finance", "plans", "agenda", "history"],
  ],
  [/^\/inventory\//, ["inventory"]],
  [/^\/waitlist(?:\/|$)/, ["waitlist", "history"]],
  [/^\/plans(?:\/|$|\?)/, ["plans", "finance", "history"]],
  [/^\/plan-(?:catalog|templates)(?:\/|$)/, ["plans"]],
  [/^\/finance\//, ["finance", "history"]],
  [/^\/admin\/users(?:\/[^/]+)?$/, ["agenda", "finance", "history"]],
  [
    /^\/admin\/users\/[^/]+\/(?:commission|professional)$/,
    ["agenda", "finance", "history"],
  ],
  // Nome e cor do profissional ligado aparecem na agenda.
  [/^\/me\/profile$/, ["agenda"]],
  [/^\/agenda-notes(?:\/|$|\?)/, ["agenda", "history"]],
  // Status do atendimento consome sessão do plano e entra no dashboard e na ficha.
  [
    /^\/(?:appointments|group-sessions|group-replacements|group-enrollments|groups|schedule-blocks|holidays)(?:\/|$)/,
    ["agenda", "plans", "finance", "history"],
  ],
  [/^\/leads\/[^/]+\/appointments$/, ["agenda", "history", "crm"]],
  // Tarefas e etapas dos leads alimentam o sino (tarefas comerciais vencidas).
  [/^\/(?:leads|lead-tasks)(?:\/|$|\?)/, ["crm"]],
  [/^\/patients(?:\/|$)|^\/patient-tags(?:\/|$)/, ["patients", "history"]],
  [
    /^\/(?:clinical-[a-z-]+|therapeutic-goals|treatment-closures|assessment-templates)(?:\/|$)/,
    ["clinical", "history"],
  ],
  [/^\/(?:documents|document-templates)(?:\/|$)/, ["contracts", "history"]],
  // Contato registrado (ex.: parabéns enviados) tira o aniversariante do sino (QM13).
  [/^\/relationship\/activities(?:\/|$)/, ["relationship"]],
  // Campanhas automáticas e envios registrados mudam a fila e o sino.
  [/^\/communications\/auto-campaigns(?:\/|$)/, ["communications"]],
];

export function domainsForMutation(method: string, path: string): DataDomain[] {
  if (method.toUpperCase() === "GET") return [];
  for (const [pattern, domains] of mutationRules)
    if (pattern.test(path)) return domains;
  return [];
}

const versions = new Map<DataDomain, number>();
const listeners = new Set<() => void>();

export function getDataVersion(domains: readonly DataDomain[]) {
  // Soma de contadores que só crescem: muda sempre que algum domínio muda.
  return domains.reduce(
    (total, domain) => total + (versions.get(domain) ?? 0),
    0,
  );
}

export function bumpDataVersion(domains: readonly DataDomain[]) {
  if (!domains.length) return;
  for (const domain of domains)
    versions.set(domain, (versions.get(domain) ?? 0) + 1);
  for (const listener of [...listeners]) listener();
}

export function subscribeDataVersion(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
