import type { RelationshipSettings } from "@crm/contracts";

export type RelationshipDeadlineKey = Exclude<
  keyof RelationshipSettings,
  "messages"
>;

export type SettingsTabKey =
  | "branches"
  | "catalogs"
  | "registry"
  | "clinic"
  | "menu"
  | "users"
  | "plans"
  | "holidays"
  | "tags"
  | "relationship"
  | "autoFinalization";

export type AutoFinalizationUnit = "minutes" | "hours" | "days";

/** Formulário da finalização automática: o tempo é digitado numa unidade escolhida. */
export type AutoFinalizationDraft = {
  enabled: boolean;
  amount: string;
  unit: AutoFinalizationUnit;
};
