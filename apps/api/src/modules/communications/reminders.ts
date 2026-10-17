import { clinicDateOf } from "../finance/daily-cash.js";
import {
  patientFirstName,
  type CommunicationKind,
  type ReminderGenerationOptions,
} from "@crm/contracts";

export interface ReminderPatient {
  id: string;
  fullName: string;
  phone: string;
  whatsapp?: string | undefined;
  birthDate?: string | undefined;
  status: string;
}
export interface ReminderEncounter {
  id: string;
  patientId?: string | undefined;
  startsAt: string;
  status: string;
}
export interface ReminderInvoice {
  id: string;
  patientId: string;
  dueDate: string;
  status: string;
}
export interface ReminderSurvey {
  patientId: string;
  createdAt: string;
}
export interface ReminderCandidate {
  patient: ReminderPatient;
  kind: CommunicationKind;
  key: string;
  legacyKey?: string;
  body: string;
  appointmentId?: string;
  receivableId?: string;
}

export function buildReminderCandidates(
  patients: ReminderPatient[],
  encounters: ReminderEncounter[],
  invoices: ReminderInvoice[],
  surveys: ReminderSurvey[],
  referenceDate: string,
  timezone: string,
  options: ReminderGenerationOptions = {},
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [],
    byId = new Map(patients.map((patient) => [patient.id, patient]));
  const dateLabel = (date: string) => date.split("-").reverse().join("/");
  for (const encounter of encounters) {
    const patient = encounter.patientId
      ? byId.get(encounter.patientId)
      : undefined;
    if (
      !patient ||
      clinicDateOf(new Date(encounter.startsAt), timezone) !== referenceDate
    )
      continue;
    if (
      options.appointments !== false &&
      ["scheduled", "confirmed"].includes(encounter.status)
    ) {
      const time = new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(encounter.startsAt));
      candidates.push({
        patient,
        kind: "appointment_reminder",
        key: `appointment:${encounter.id}:whatsapp`,
        legacyKey: `appointment_reminder:${encounter.id}:whatsapp`,
        appointmentId: encounter.id,
        body: `Olá, ${patientFirstName(patient.fullName)}. Lembramos do seu atendimento em ${dateLabel(referenceDate)} às ${time}.`,
      });
    }
    if (
      options.satisfaction &&
      encounter.status === "completed" &&
      patient.status === "active" &&
      !surveys.some(
        (survey) =>
          survey.patientId === patient.id &&
          survey.createdAt >= encounter.startsAt,
      )
    ) {
      const key = `satisfaction:${patient.id}:${referenceDate}:whatsapp`;
      if (!candidates.some((candidate) => candidate.key === key))
        candidates.push({
          patient,
          kind: "satisfaction_followup",
          key,
          body: `Olá, ${patientFirstName(patient.fullName)}. Como foi sua experiência com a clínica? De 0 a 10, qual a chance de nos recomendar? A equipe registrará sua resposta.`,
        });
    }
  }
  if (options.payments !== false)
    for (const invoice of invoices) {
      const patient = byId.get(invoice.patientId);
      if (
        !patient ||
        invoice.status !== "open" ||
        invoice.dueDate > referenceDate
      )
        continue;
      candidates.push({
        patient,
        kind: "payment_reminder",
        key: `receivable:${invoice.id}:whatsapp`,
        legacyKey: `payment_reminder:${invoice.id}:whatsapp`,
        receivableId: invoice.id,
        body: `Olá, ${patientFirstName(patient.fullName)}. Identificamos uma parcela com vencimento em ${dateLabel(invoice.dueDate)}. Fale com a clínica se precisar de ajuda.`,
      });
    }
  if (options.birthdays)
    for (const patient of patients)
      if (
        patient.status === "active" &&
        patient.birthDate?.slice(5) === referenceDate.slice(5)
      )
        candidates.push({
          patient,
          kind: "birthday_reminder",
          key: `birthday:${patient.id}:${referenceDate}:whatsapp`,
          body: `Olá, ${patientFirstName(patient.fullName)}. A equipe deseja um feliz aniversário e um novo ano com saúde e bem-estar!`,
        });
  return candidates;
}
