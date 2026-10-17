import {
  patientTagKey,
  type ClinicalAppointmentOption,
  type ClinicalRecord,
  type Patient,
  type PatientOption,
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
