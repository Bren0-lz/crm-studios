import {
  fillCampaignMessage,
  imageDataUrlInfo,
  MESSAGE_TEMPLATE_IMAGE_MAX_BYTES,
  type Appointment,
  type BroadcastSkippedPatient,
  type CommunicationPreference,
  type MessageTemplateImageInput,
  type Patient,
  type PatientPlan,
  type WhatsappCampaignAudience,
  type WhatsappCampaignRecipientDraft,
} from "@crm/contracts";
import { DomainError, type MessageTemplateWrite } from "../../repository.js";
import { filterPatientsForExport } from "../patients/patient-export.js";
import { destination } from "./broadcast.js";

export interface CampaignAudiencePlan {
  matched: number;
  drafts: WhatsappCampaignRecipientDraft[];
  skipped: BroadcastSkippedPatient[];
}

type CampaignSegment = Extract<
  WhatsappCampaignAudience,
  { mode: "segment" }
>["segment"];

/** Dados além do cadastro que os filtros da campanha consultam. */
export interface CampaignFilterData {
  plans: PatientPlan[];
  preferences: CommunicationPreference[];
  /** Atendimentos de clientes (passados e futuros) quando algum filtro usa a agenda. */
  appointments: Appointment[];
  overduePatientIds: ReadonlySet<string>;
  /** Quem recebeu campanha no período de `excludeContactedDays`. */
  contactedPatientIds: ReadonlySet<string>;
  now: Date;
}

/** Filtros de agenda que pedem a lista de atendimentos. */
export function segmentNeedsAppointments(segment: CampaignSegment) {
  return Boolean(
    segment.serviceIds.length ||
    segment.professionalIds.length ||
    segment.absentDays ||
    segment.visitedWithinDays ||
    segment.noUpcomingAppointment,
  );
}

const dayMs = 24 * 60 * 60 * 1000;

function addDays(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * dayMs)
    .toISOString()
    .slice(0, 10);
}

/** Idade completa em `today` (aaaa-mm-dd). */
export function ageOn(birthDate: string, today: string) {
  const age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return today.slice(5) < birthDate.slice(5) ? age - 1 : age;
}

/** Aplica os filtros da campanha (perfil, etiquetas, agenda, planos, financeiro). */
export function filterCampaignSegment(
  patients: Patient[],
  data: CampaignFilterData,
  segment: CampaignSegment,
  today: string,
): Patient[] {
  const base = filterPatientsForExport(
    patients,
    data.plans,
    { ...segment, tags: segment.tagMode === "any" ? segment.tags : [] },
    today,
  );
  const now = data.now.getTime();
  const byPatient = new Map<string, Appointment[]>();
  for (const appointment of data.appointments)
    if (appointment.patientId && appointment.status !== "cancelled")
      byPatient.set(appointment.patientId, [
        ...(byPatient.get(appointment.patientId) ?? []),
        appointment,
      ]);
  const activePlans = data.plans.filter((plan) => plan.status === "active");
  const planExpiringLimit = segment.planExpiringDays
    ? addDays(today, segment.planExpiringDays)
    : "";
  const newClientSince = segment.newClientDays
    ? addDays(today, -segment.newClientDays)
    : "";
  return base.filter((patient) => {
    if (
      segment.tagMode === "all" &&
      !segment.tags.every((tag) => patient.tags.includes(tag))
    )
      return false;
    if (segment.excludeTags.some((tag) => patient.tags.includes(tag)))
      return false;
    if (segment.ageMin !== undefined || segment.ageMax !== undefined) {
      if (!patient.birthDate) return false;
      const age = ageOn(patient.birthDate, today);
      if (segment.ageMin !== undefined && age < segment.ageMin) return false;
      if (segment.ageMax !== undefined && age > segment.ageMax) return false;
    }
    if (
      segment.birthMonth &&
      Number(patient.birthDate?.slice(5, 7)) !== segment.birthMonth
    )
      return false;
    if (newClientSince) {
      const since = patient.clientSince || patient.createdAt.slice(0, 10);
      if (since < newClientSince) return false;
    }
    if (segment.overdue && !data.overduePatientIds.has(patient.id))
      return false;
    if (data.contactedPatientIds.has(patient.id)) return false;
    if (
      segment.planExpiringDays ||
      segment.maxRemainingSessions !== undefined
    ) {
      const plans = activePlans.filter((plan) => plan.patientId === patient.id);
      if (!matchesPlanFilters(plans, today, planExpiringLimit, segment))
        return false;
    }
    if (!segmentNeedsAppointments(segment)) return true;
    const appointments = byPatient.get(patient.id) ?? [];
    if (
      segment.serviceIds.length &&
      !appointments.some((item) => segment.serviceIds.includes(item.serviceId))
    )
      return false;
    if (
      segment.professionalIds.length &&
      !appointments.some((item) =>
        segment.professionalIds.includes(item.professionalId),
      )
    )
      return false;
    const lastVisit = Math.max(
      0,
      ...appointments
        .filter(
          (item) =>
            item.status === "completed" && Date.parse(item.startsAt) <= now,
        )
        .map((item) => Date.parse(item.startsAt)),
    );
    if (segment.absentDays && lastVisit > now - segment.absentDays * dayMs)
      return false;
    if (
      segment.visitedWithinDays &&
      lastVisit < now - segment.visitedWithinDays * dayMs
    )
      return false;
    if (
      segment.noUpcomingAppointment &&
      appointments.some(
        (item) =>
          (item.status === "scheduled" || item.status === "confirmed") &&
          Date.parse(item.startsAt) > now,
      )
    )
      return false;
    return true;
  });
}

/** Algum plano ativo vence até `limit` e/ou tem até N sessões restantes. */
function matchesPlanFilters(
  plans: PatientPlan[],
  today: string,
  limit: string,
  segment: CampaignSegment,
) {
  return plans.some(
    (plan) =>
      (!limit ||
        (plan.validUntil !== undefined &&
          plan.validUntil >= today &&
          plan.validUntil <= limit)) &&
      (segment.maxRemainingSessions === undefined ||
        plan.remainingSessions <= segment.maxRemainingSessions),
  );
}

/**
 * Monta os destinatários da campanha: filtros ou clientes escolhidos; pula
 * quem bloqueou WhatsApp ou não tem número válido e personaliza a mensagem.
 */
export function buildCampaignAudience(
  patients: Patient[],
  data: CampaignFilterData,
  audience: WhatsappCampaignAudience,
  body: string,
  today: string,
): CampaignAudiencePlan {
  let chosen: Patient[];
  if (audience.mode === "segment")
    chosen = filterCampaignSegment(patients, data, audience.segment, today);
  else {
    const ids = [...new Set(audience.patientIds)];
    chosen = ids.map((id) => {
      const patient = patients.find((item) => item.id === id);
      if (!patient)
        throw new DomainError(
          "PATIENT_NOT_FOUND",
          "Cliente não encontrado.",
          404,
        );
      return patient;
    });
  }
  const optedOut = new Set(
    data.preferences
      .filter((item) => item.channel === "whatsapp" && !item.allowed)
      .map((item) => item.patientId),
  );
  const drafts: WhatsappCampaignRecipientDraft[] = [];
  const skipped: BroadcastSkippedPatient[] = [];
  for (const patient of chosen) {
    const skip = (reason: BroadcastSkippedPatient["reason"]) =>
      skipped.push({
        patientId: patient.id,
        patientName: patient.fullName,
        reason,
      });
    if (optedOut.has(patient.id)) {
      skip("opt_out");
      continue;
    }
    const phone = destination(patient, "whatsapp");
    if (!phone) {
      skip("no_destination");
      continue;
    }
    drafts.push({
      patientId: patient.id,
      patientName: patient.fullName,
      phone,
      message: fillCampaignMessage(body, patient.fullName),
    });
  }
  return { matched: chosen.length, drafts, skipped };
}

const imageSignatures: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) =>
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8,
  "image/webp": (bytes) =>
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP",
};

/** Confere tipo real e tamanho (até 2 MB) das imagens novas da mensagem padrão. */
export function inspectTemplateImages(
  images: MessageTemplateImageInput[],
): MessageTemplateWrite["images"] {
  return images.map((image) => {
    if ("id" in image) return image;
    const info = imageDataUrlInfo(image.dataUrl);
    const bytes = info ? Buffer.from(info.base64, "base64") : null;
    if (!info || !bytes || !imageSignatures[info.mimeType]!(bytes))
      throw new DomainError(
        "MESSAGE_IMAGE_INVALID",
        `O arquivo ${image.fileName} não é uma imagem PNG, JPEG ou WebP válida.`,
        400,
      );
    if (bytes.length > MESSAGE_TEMPLATE_IMAGE_MAX_BYTES)
      throw new DomainError(
        "MESSAGE_IMAGE_TOO_LARGE",
        `A imagem ${image.fileName} passa de 2 MB.`,
        413,
      );
    return {
      fileName: image.fileName,
      mimeType: info.mimeType,
      sizeBytes: bytes.length,
      dataUrl: image.dataUrl,
    };
  });
}
