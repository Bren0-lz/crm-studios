import { z } from "zod";
import type { AppModule } from "./types.js";

/** Abas do menu lateral; a chave é fixa e o nome pode ser trocado pelo admin. */
export const navTabSchema = z.enum([
  "dashboard",
  "agenda",
  "groups",
  "patients",
  "plans",
  "clinical",
  "crm",
  "events",
  "relationship",
  "waitlist",
  "communications",
  "contracts",
  "sales",
  "finance",
  "reports",
  "history",
  "settings",
  "profile",
]);
export type NavTab = z.infer<typeof navTabSchema>;

/** Nomes padrão das abas do menu, usados onde a clínica não renomeou. */
export const defaultNavTabLabels: Record<NavTab, string> = {
  dashboard: "Visão geral",
  agenda: "Agenda",
  groups: "Turmas",
  patients: "Clientes",
  plans: "Planos e sessões",
  clinical: "Prontuários",
  crm: "CRM comercial",
  events: "Eventos",
  relationship: "Contatos sugeridos",
  waitlist: "Lista de espera",
  communications: "Comunicações",
  contracts: "Contratos",
  sales: "Vendas de produtos",
  finance: "Financeiro",
  reports: "Relatórios",
  history: "Histórico",
  settings: "Configurações",
  profile: "Meu perfil",
};

/**
 * Estrutura do menu lateral (grupos, abas, endereços e módulo exigido). O web acrescenta os
 * ícones; a API usa a mesma lista para explicar o CRM ao agente do manual (MCP).
 */
export interface NavMenuItem {
  tab: NavTab;
  to: string;
  /** Módulo exigido; sem módulo (Visão geral, Meu perfil) o item aparece para todos. */
  module?: AppModule;
}
export const navMenu: ReadonlyArray<{
  label: string;
  items: readonly NavMenuItem[];
}> = [
  {
    label: "Rotina",
    items: [
      { tab: "dashboard", to: "/" },
      { tab: "agenda", to: "/agenda", module: "agenda" },
      { tab: "groups", to: "/turmas", module: "groups" },
      { tab: "patients", to: "/clientes", module: "patients" },
      { tab: "plans", to: "/planos", module: "plans" },
      { tab: "clinical", to: "/prontuarios", module: "clinical" },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { tab: "crm", to: "/comercial", module: "crm" },
      { tab: "events", to: "/eventos", module: "events" },
      { tab: "relationship", to: "/relacionamento", module: "relationship" },
      { tab: "waitlist", to: "/lista-de-espera", module: "waitlist" },
      { tab: "communications", to: "/comunicacoes", module: "communications" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { tab: "contracts", to: "/contratos", module: "contracts" },
      { tab: "sales", to: "/vendas", module: "patients" },
      { tab: "finance", to: "/financeiro", module: "finance" },
      { tab: "reports", to: "/relatorios", module: "reports" },
      { tab: "history", to: "/historico", module: "history" },
      { tab: "settings", to: "/configuracoes", module: "settings" },
      { tab: "profile", to: "/perfil" },
    ],
  },
];

export const NAV_TAB_LABEL_MAX = 30;

export interface NavTabLabel {
  tab: NavTab;
  label: string;
}

const labelSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da aba.")
  .max(
    NAV_TAB_LABEL_MAX,
    `O nome da aba deve ter até ${NAV_TAB_LABEL_MAX} caracteres.`,
  );

/** Todas as abas, cada uma uma vez, com nomes distintos (sem diferenciar maiúsculas). */
export const navTabLabelsInputSchema = z
  .object({
    tabs: z
      .array(z.object({ tab: navTabSchema, label: labelSchema }))
      .length(navTabSchema.options.length),
  })
  .superRefine((value, ctx) => {
    const tabs = new Set(value.tabs.map((item) => item.tab));
    if (tabs.size !== navTabSchema.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["tabs"],
        message: "Envie o nome de cada aba uma única vez.",
      });
    const seen = new Set<string>();
    value.tabs.forEach((item, index) => {
      const key = item.label.toLocaleLowerCase("pt-BR");
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["tabs", index, "label"],
          message: "Duas abas não podem ter o mesmo nome.",
        });
      seen.add(key);
    });
  });
export type NavTabLabelsInput = z.infer<typeof navTabLabelsInputSchema>;

/** Nomes de todas as abas na ordem do menu, usando o padrão onde a clínica não renomeou. */
export function resolveNavTabLabels(
  saved: Iterable<NavTabLabel>,
): NavTabLabel[] {
  const custom = new Map(
    [...saved].map((item) => [item.tab, item.label] as const),
  );
  return navTabSchema.options.map((tab) => ({
    tab,
    label: custom.get(tab) ?? defaultNavTabLabels[tab],
  }));
}
