import { z } from "zod";

/** Abas do menu lateral; a chave é fixa e o nome pode ser trocado pelo admin. */
export const navTabSchema = z.enum([
  "dashboard",
  "agenda",
  "groups",
  "patients",
  "plans",
  "clinical",
  "crm",
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
