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
  | "users"
  | "plans"
  | "holidays"
  | "tags"
  | "relationship";
