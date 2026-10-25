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
  | "relationship";
