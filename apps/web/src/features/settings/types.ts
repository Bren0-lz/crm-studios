import type { PaymentMethod, RelationshipSettings } from "@crm/contracts";

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
  | "autoFinalization"
  | "paymentMethods"
  | "integrations";

/** Linha do formulário de formas de pagamento: o máximo é digitado como texto. */
export type PaymentMethodDraft = {
  method: PaymentMethod;
  acceptsInstallments: boolean;
  maxInstallments: string;
};

export type AutoFinalizationUnit = "minutes" | "hours" | "days";

/** Formulário da finalização automática: o tempo é digitado numa unidade escolhida. */
export type AutoFinalizationDraft = {
  enabled: boolean;
  amount: string;
  unit: AutoFinalizationUnit;
};
