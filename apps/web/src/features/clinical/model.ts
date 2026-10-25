import {
  isAppointmentStarted,
  patientTagKey,
  type ClinicalAppointmentOption,
  type ClinicalMeasurement,
  type ClinicalRecord,
  type ClinicalWorkspace,
  type Patient,
  type PatientOption,
  type TherapeuticGoal,
} from "@crm/contracts";
import { api } from "../../api";
import {
  clinicIsoDate,
  formatIsoDate,
  timeLabel,
} from "../../shared/lib/formatting";

export async function fetchAgendaPatients(
  canSeePatients: boolean,
): Promise<{ options: PatientOption[]; records: Patient[] }> {
  if (!canSeePatients)
    return { options: await api.patientOptions(), records: [] };
  const records = await api.patients();
  return { options: records, records };
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Janela padrão do seletor de atendimento da evolução. */
export const RECENT_APPOINTMENT_DAYS = 90;

export function clinicalAppointmentLabel(
  appointment: Pick<
    ClinicalAppointmentOption,
    "startsAt" | "patientName" | "professionalName"
  >,
) {
  const date = formatIsoDate(clinicIsoDate(appointment.startsAt));
  const time = timeLabel.format(new Date(appointment.startsAt));
  return `${date} ${time} · ${appointment.patientName} · ${appointment.professionalName}`;
}

/**
 * Atendimentos do mais recente para o mais antigo. Sem `includeOlder`, só os últimos 90 dias
 * (e os próximos, já carregados). A busca casa nome do cliente ou do profissional sem acento,
 * ou a data em DD/MM ou DD/MM/AAAA.
 */
export function filterClinicalAppointments(
  appointments: ClinicalAppointmentOption[],
  query: string,
  includeOlder: boolean,
  now = new Date(),
) {
  const limit = new Date(now);
  limit.setDate(limit.getDate() - RECENT_APPOINTMENT_DAYS);
  const term = patientTagKey(query);
  return appointments
    .filter(
      (appointment) => includeOlder || new Date(appointment.startsAt) >= limit,
    )
    .filter(
      (appointment) =>
        !term ||
        patientTagKey(clinicalAppointmentLabel(appointment)).includes(term),
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

const soapSteps = [
  ["subjective", "S — Subjetivo"],
  ["objective", "O — Objetivo"],
  ["assessment", "A — Avaliação"],
  ["plan", "P — Plano"],
] as const;

/** Etapas SOAP ainda vazias: o rascunho aceita, mas finalizar exige as quatro. */
export function missingSoapSteps(
  record: Pick<
    ClinicalRecord,
    "subjective" | "objective" | "assessment" | "plan"
  >,
) {
  return soapSteps
    .filter(([key]) => !record[key].trim())
    .map(([, label]) => label);
}

export const goalStatusLabels: Record<TherapeuticGoal["status"], string> = {
  active: "Ativo",
  achieved: "Alcançado",
  cancelled: "Cancelado",
};

/** Resumo de um cliente na coluna do prontuário. */
export interface ClinicalPatientSummary {
  patient: PatientOption;
  records: number;
  drafts: number;
  /** Sessões já iniciadas e sem evolução. */
  pending: ClinicalAppointmentOption[];
  /** Evolução ou sessão pendente mais recente. */
  lastActivityAt?: string;
}

export type ClinicalPatientFilter = "all" | "pending" | "drafts";

export function buildPatientSummaries(
  patients: PatientOption[],
  records: ClinicalRecord[],
  appointments: ClinicalAppointmentOption[],
): ClinicalPatientSummary[] {
  const evolved = new Set(records.map((record) => record.appointmentId));
  return patients.map((patient) => {
    const own = records.filter((record) => record.patientId === patient.id);
    const pending = appointments
      .filter(
        (appointment) =>
          appointment.patientId === patient.id && !evolved.has(appointment.id),
      )
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const lastActivityAt = [
      ...own.map((record) => record.appointmentStartsAt),
      ...pending.map((appointment) => appointment.startsAt),
    ].sort((a, b) => b.localeCompare(a))[0];
    return {
      patient,
      records: own.length,
      drafts: own.filter((record) => record.status === "draft").length,
      pending,
      ...(lastActivityAt ? { lastActivityAt } : {}),
    };
  });
}

/**
 * Busca sem acento pelo nome; quem tem atividade clínica aparece primeiro (a mais recente no
 * topo) e o restante em ordem alfabética.
 */
export function filterPatientSummaries(
  summaries: ClinicalPatientSummary[],
  query: string,
  filter: ClinicalPatientFilter,
) {
  const term = patientTagKey(query);
  return summaries
    .filter(
      (summary) =>
        (filter === "all" ||
          (filter === "pending"
            ? summary.pending.length > 0
            : summary.drafts > 0)) &&
        (!term || patientTagKey(summary.patient.fullName).includes(term)),
    )
    .sort(
      (a, b) =>
        (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
        a.patient.fullName.localeCompare(b.patient.fullName, "pt-BR"),
    );
}

export type ClinicalTimelineKind =
  | "record"
  | "assessment"
  | "measurement"
  | "attachment"
  | "addendum"
  | "closure";

export const clinicalTimelineKindLabels: Record<ClinicalTimelineKind, string> =
  {
    record: "Evoluções",
    assessment: "Avaliações",
    measurement: "Medições",
    attachment: "Arquivos",
    addendum: "Adendos",
    closure: "Encerramentos",
  };

export interface ClinicalTimelineEvent {
  id: string;
  kind: ClinicalTimelineKind;
  label: string;
  date: string;
  title: string;
  author: string;
  draft?: boolean;
}

export const closureKindLabels = {
  discharge: "Alta",
  referral: "Encaminhamento",
  abandonment: "Abandono",
} as const;

/** Tudo o que aconteceu no prontuário, do mais recente para o mais antigo. */
export function buildClinicalTimeline(
  workspace: ClinicalWorkspace,
): ClinicalTimelineEvent[] {
  return [
    ...workspace.records.map((item) => ({
      id: `record-${item.id}`,
      kind: "record" as const,
      label: "Evolução SOAP",
      date: item.appointmentStartsAt,
      title: item.assessment || item.subjective || "Evolução clínica",
      author: item.authorName,
      draft: item.status === "draft",
    })),
    ...workspace.assessments.map((item) => ({
      id: `assessment-${item.id}`,
      kind: "assessment" as const,
      label: "Avaliação",
      date: item.createdAt,
      title: item.templateName,
      author: item.authorName,
    })),
    ...workspace.measurements.map((item) => ({
      id: `measurement-${item.id}`,
      kind: "measurement" as const,
      label: "Medição",
      date: item.measuredAt,
      title: `${item.name}: ${item.value} ${item.unit}`,
      author: item.authorName,
    })),
    ...(workspace.attachments ?? []).map((item) => ({
      id: `attachment-${item.id}`,
      kind: "attachment" as const,
      label: "Arquivo",
      date: item.createdAt,
      title: item.notes ? `${item.fileName} — ${item.notes}` : item.fileName,
      author: item.authorName,
    })),
    ...workspace.closures.map((item) => ({
      id: `closure-${item.id}`,
      kind: "closure" as const,
      label: closureKindLabels[item.kind],
      date: item.occurredAt,
      title: item.summary,
      author: item.authorName,
    })),
    ...(workspace.addenda ?? []).map((item) => ({
      id: `addendum-${item.id}`,
      kind: "addendum" as const,
      label: "Adendo imutável",
      date: item.createdAt,
      title: `${item.reason}: ${item.content}`,
      author: item.authorName,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export interface MeasurementSeries {
  key: string;
  name: string;
  unit: string;
  /** Do mais antigo para o mais recente. */
  points: ClinicalMeasurement[];
}

/** Medições agrupadas por nome e unidade, para o gráfico de evolução. */
export function measurementSeries(
  measurements: ClinicalMeasurement[],
): MeasurementSeries[] {
  const series = new Map<string, MeasurementSeries>();
  for (const measurement of measurements) {
    const key = `${patientTagKey(measurement.name)}|${measurement.unit}`;
    const current = series.get(key) ?? {
      key,
      name: measurement.name,
      unit: measurement.unit,
      points: [],
    };
    current.points.push(measurement);
    series.set(key, current);
  }
  return [...series.values()].map((item) => ({
    ...item,
    points: [...item.points].sort((a, b) =>
      a.measuredAt.localeCompare(b.measuredAt),
    ),
  }));
}

/**
 * Quanto do caminho entre o valor inicial e a meta já foi percorrido (0–100). Funciona para
 * metas que sobem (amplitude) e que descem (dor). Sem os dois valores, não há progresso.
 */
export function goalProgress(
  goal: Pick<TherapeuticGoal, "baselineValue" | "targetValue">,
  latestValue: number | undefined,
) {
  if (
    goal.baselineValue === undefined ||
    goal.targetValue === undefined ||
    latestValue === undefined ||
    goal.baselineValue === goal.targetValue
  )
    return undefined;
  const ratio =
    (latestValue - goal.baselineValue) /
    (goal.targetValue - goal.baselineValue);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

export { patientAge } from "../../shared/lib/formatting";

/** Janela de sessões oferecidas para evoluir, igual à da página Prontuários. */
export function clinicalAppointmentRange(now = new Date()) {
  const from = new Date(now);
  from.setDate(from.getDate() - 180);
  const to = new Date(now);
  to.setDate(to.getDate() + 2);
  return [from.toISOString(), to.toISOString()] as const;
}

/** Evolução só para atendimento já iniciado (início − 15 min); a API também recusa. */
export function evolvableAppointments(options: ClinicalAppointmentOption[]) {
  return options.filter(
    (appointment) =>
      appointment.status !== "cancelled" && isAppointmentStarted(appointment),
  );
}
