import { z } from "zod";
import { emptyQueryToUndefined } from "../common/model.js";
export const patientProfileFilterSchema = z.object({
  city: z.preprocess(emptyQueryToUndefined, z.string().max(120).optional()),
  neighborhood: z.preprocess(
    emptyQueryToUndefined,
    z.string().max(120).optional(),
  ),
  occupation: z.preprocess(
    emptyQueryToUndefined,
    z.string().max(120).optional(),
  ),
  level: z.preprocess(emptyQueryToUndefined, z.string().max(80).optional()),
  source: z.preprocess(emptyQueryToUndefined, z.string().max(120).optional()),
  interest: z.preprocess(emptyQueryToUndefined, z.string().max(80).optional()),
  gender: z.preprocess(
    emptyQueryToUndefined,
    z.enum(["female", "male", "other", "undisclosed"]).optional(),
  ),
  segment: z.preprocess(
    emptyQueryToUndefined,
    z
      .enum([
        "active_plan",
        "no_plan",
        "renewal",
        "replacement",
        "waiting",
        "pending",
        "overdue",
      ])
      .optional(),
  ),
  record: z.preprocess(
    emptyQueryToUndefined,
    z.enum(["with_email", "without_email"]).optional(),
  ),
});
export type PatientProfileFilter = z.infer<typeof patientProfileFilterSchema>;
export interface PatientSegmentSummary {
  patientId: string;
  activePlans: number;
  renewalDue: boolean;
  availableReplacements: number;
  waiting: number;
  pendingReceivables?: number;
  overdueReceivables?: number;
}
export function matchesPatientProfile(
  patient: {
    city?: string | undefined;
    neighborhood?: string | undefined;
    occupation?: string | undefined;
    level?: string | undefined;
    source?: string | undefined;
    interests?: string[] | undefined;
    gender?: string | undefined;
    email?: string | undefined;
  },
  filter: PatientProfileFilter,
) {
  for (const key of [
    "city",
    "neighborhood",
    "occupation",
    "level",
    "source",
  ] as const)
    if (
      filter[key] &&
      !patient[key]
        ?.toLocaleLowerCase("pt-BR")
        .includes(filter[key]!.toLocaleLowerCase("pt-BR"))
    )
      return false;
  return (
    (!filter.interest || patient.interests?.includes(filter.interest)) &&
    (!filter.gender || filter.gender === patient.gender) &&
    (filter.record !== "with_email" || Boolean(patient.email)) &&
    (filter.record !== "without_email" || !patient.email)
  );
}
export function matchesPatientSegment(
  summary: PatientSegmentSummary | undefined,
  segment: PatientProfileFilter["segment"],
) {
  if (!segment) return true;
  if (!summary) return false;
  return {
    active_plan: summary.activePlans > 0,
    no_plan: summary.activePlans === 0,
    renewal: summary.renewalDue,
    replacement: summary.availableReplacements > 0,
    waiting: summary.waiting > 0,
    pending: (summary.pendingReceivables ?? 0) > 0,
    overdue: (summary.overdueReceivables ?? 0) > 0,
  }[segment];
}
