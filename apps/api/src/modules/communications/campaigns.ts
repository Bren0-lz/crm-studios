import {
  fillCampaignMessage,
  imageDataUrlInfo,
  MESSAGE_TEMPLATE_IMAGE_MAX_BYTES,
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

/**
 * Monta os destinatários da campanha: segmento (mesmo filtro do comunicado) ou
 * clientes escolhidos; pula quem bloqueou WhatsApp ou não tem número válido e
 * personaliza a mensagem de cada um.
 */
export function buildCampaignAudience(
  patients: Patient[],
  plans: PatientPlan[],
  preferences: CommunicationPreference[],
  audience: WhatsappCampaignAudience,
  body: string,
  today: string,
): CampaignAudiencePlan {
  let chosen: Patient[];
  if (audience.mode === "segment")
    chosen = filterPatientsForExport(patients, plans, audience.segment, today);
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
    preferences
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
