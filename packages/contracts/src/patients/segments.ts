import { z } from "zod";
import { addDaysToIsoDate, emptyQueryToUndefined } from "../common/model.js";
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
/** Filtros de atividade do cliente (serviços, turmas, profissionais e atendimentos), calculados
 * sobre o `PatientSegmentSummary`. Valem na lista e na exportação de clientes. */
export const patientActivityFilterSchema = z.object({
  service: z.preprocess(emptyQueryToUndefined, z.string().max(120).optional()),
  group: z.preprocess(emptyQueryToUndefined, z.string().max(120).optional()),
  professional: z.preprocess(
    emptyQueryToUndefined,
    z.string().max(120).optional(),
  ),
  lastVisit: z.preprocess(
    emptyQueryToUndefined,
    z.enum(["last_30", "over_30", "over_90", "never"]).optional(),
  ),
  nextAppointment: z.preprocess(
    emptyQueryToUndefined,
    z.enum(["scheduled", "none"]).optional(),
  ),
});
export type PatientActivityFilter = z.infer<typeof patientActivityFilterSchema>;
export const patientActivityFilterKeys = [
  "service",
  "group",
  "professional",
  "lastVisit",
  "nextAppointment",
] as const;
export const patientLastVisitLabels: Record<
  NonNullable<PatientActivityFilter["lastVisit"]>,
  string
> = {
  last_30: "Nos últimos 30 dias",
  over_30: "Há mais de 30 dias",
  over_90: "Há mais de 90 dias",
  never: "Sem atendimento no último ano",
};
export const patientNextAppointmentLabels: Record<
  NonNullable<PatientActivityFilter["nextAppointment"]>,
  string
> = {
  scheduled: "Com horário marcado",
  none: "Sem horário marcado",
};
export interface PatientSegmentSummary {
  patientId: string;
  activePlans: number;
  renewalDue: boolean;
  availableReplacements: number;
  waiting: number;
  pendingReceivables?: number;
  overdueReceivables?: number;
  /** Serviços dos planos vigentes, das turmas e dos atendimentos dos últimos 12 meses ou futuros. */
  services?: string[];
  /** Turmas com matrícula ativa. */
  groups?: string[];
  /** Profissionais dos atendimentos (12 meses ou futuros) e das turmas com matrícula ativa. */
  professionals?: string[];
  /** Data (aaaa-mm-dd, fuso da clínica) do último atendimento concluído ou presença em turma. */
  lastVisitOn?: string;
  /** Próximo atendimento agendado ou confirmado. */
  nextAppointmentAt?: string;
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
export function hasPatientActivityFilter(filter: PatientActivityFilter) {
  return patientActivityFilterKeys.some((key) => Boolean(filter[key]));
}
/** `today` em aaaa-mm-dd; "há mais de N dias" exige um atendimento registrado no último ano. */
export function matchesPatientActivity(
  summary: PatientSegmentSummary | undefined,
  filter: PatientActivityFilter,
  today: string,
) {
  if (!hasPatientActivityFilter(filter)) return true;
  if (!summary) return false;
  const last = summary.lastVisitOn;
  const visit =
    filter.lastVisit &&
    {
      last_30: Boolean(last && last >= addDaysToIsoDate(today, -30)),
      over_30: Boolean(last && last < addDaysToIsoDate(today, -30)),
      over_90: Boolean(last && last < addDaysToIsoDate(today, -90)),
      never: !last,
    }[filter.lastVisit];
  return (
    (!filter.service || Boolean(summary.services?.includes(filter.service))) &&
    (!filter.group || Boolean(summary.groups?.includes(filter.group))) &&
    (!filter.professional ||
      Boolean(summary.professionals?.includes(filter.professional))) &&
    (!filter.lastVisit || Boolean(visit)) &&
    (!filter.nextAppointment ||
      (filter.nextAppointment === "scheduled") ===
        Boolean(summary.nextAppointmentAt))
  );
}
