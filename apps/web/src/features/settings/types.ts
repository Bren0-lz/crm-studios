import type { RelationshipSettings } from "@crm/contracts";

export type RelationshipDeadlineKey = Exclude<
  keyof RelationshipSettings,
  "messages"
>;

export type SettingsTabKey =
  | "catalogs"
  | "clinic"
  | "users"
  | "plans"
  | "holidays"
  | "tags"
  | "relationship";
