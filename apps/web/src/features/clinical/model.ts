import {
  patientTagKey,
  type ClinicalMeasurement,
  type ClinicalWorkspace,
  type Patient,
  type PatientOption,
  type TherapeuticGoal,
} from "@crm/contracts";
import { api } from "../../api";

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

export const goalStatusLabels: Record<TherapeuticGoal["status"], string> = {
  active: "Ativo",
  achieved: "Alcançado",
  cancelled: "Cancelado",
};

/** Busca sem acento pelo nome; lista em ordem alfabética. */
export function filterClinicalPatients(
  patients: PatientOption[],
  query: string,
) {
  const term = patientTagKey(query);
  return patients
    .filter(
      (patient) => !term || patientTagKey(patient.fullName).includes(term),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

export type ClinicalTimelineKind =
  "assessment" | "measurement" | "attachment" | "closure";

export const clinicalTimelineKindLabels: Record<ClinicalTimelineKind, string> =
  {
    assessment: "Avaliações",
    measurement: "Medições",
    attachment: "Arquivos",
    closure: "Encerramentos",
  };

export interface ClinicalTimelineEvent {
  id: string;
  kind: ClinicalTimelineKind;
  label: string;
  date: string;
  title: string;
  author: string;
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
  ].sort((a, b) => b.date.localeCompare(a.date));
}

export interface MeasurementSeries {
  key: string;
  name: string;
  unit: string;
  /** Do mais antigo para o mais recente. */
  points: ClinicalMeasurement[];
}

/** Medições agrupadas por nome e unidade, para o gráfico das medições. */
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
