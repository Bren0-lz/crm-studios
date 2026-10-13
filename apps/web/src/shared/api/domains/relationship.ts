import type {
  BirthdayEntry,
  ContactActivity,
  ContactActivityInput,
  ContactSuggestion,
  RelationshipSettings,
  SatisfactionReport,
  SatisfactionSurvey,
  SatisfactionSurveyInput,
} from "@crm/contracts";
import { request } from "../transport";

export const relationshipApi = {
  relationshipSettings: () =>
    request<RelationshipSettings>("/relationship/settings"),
  updateRelationshipSettings: (input: RelationshipSettings) =>
    request<RelationshipSettings>("/relationship/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  contactSuggestions: () =>
    request<ContactSuggestion[]>("/relationship/suggestions"),
  birthdays: (month: string) =>
    request<BirthdayEntry[]>(
      `/relationship/birthdays?month=${encodeURIComponent(month)}`,
    ),
  createContactActivity: (input: ContactActivityInput) =>
    request<ContactActivity>("/relationship/activities", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  satisfaction: (from: string, to: string) =>
    request<SatisfactionReport>(
      `/satisfaction?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  createSatisfactionSurvey: (input: SatisfactionSurveyInput) =>
    request<SatisfactionSurvey>("/satisfaction", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
