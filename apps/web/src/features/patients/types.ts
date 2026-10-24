import type {
  GuidedPatientInput,
  GuidedPatientResult,
  GroupClass,
} from "@crm/contracts";
import { guidedPlanKinds } from "./model";

export type PatientRegistrationResult = GuidedPatientResult & {
  group?: GroupClass | undefined;
};

export interface GuidedDemonstrationForm {
  serviceId: string;
  professionalId: string;
  roomId: string;
  startsAt: string;
  notes: string;
}

export type GuidedPlanForm = GuidedSingleForm & {
  kind: (typeof guidedPlanKinds)[number];
};

export type GuidedSingleForm = Extract<
  GuidedPatientInput,
  { next: "single" }
>["plan"];

export type PatientRecordFilter =
  "all" | "with_email" | "without_email" | "birthday_month";

export type PatientSort = "name_asc" | "name_desc" | "newest" | "oldest";

export type PatientStatusFilter = "all" | "active" | "inactive";

export type TimelineFilter =
  | "all"
  | "appointments"
  | "plans"
  | "payments"
  | "contacts"
  | "messages"
  | "satisfaction";
