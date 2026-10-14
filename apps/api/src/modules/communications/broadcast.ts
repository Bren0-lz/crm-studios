import {
  fillMessageTemplate,
  phoneDigits,
  type BroadcastInput,
  type BroadcastMessageDraft,
  type BroadcastSkippedPatient,
  type CommunicationPreference,
  type Patient,
  type PatientPlan,
} from "@crm/contracts";
import { filterPatientsForExport } from "../patients/patient-export.js";

const maxBodyLength = 500;

export interface BroadcastPlan {
  matched: number;
  drafts: BroadcastMessageDraft[];
  skipped: BroadcastSkippedPatient[];
}

/** WhatsApp em branco cai no telefone de contato (mesma regra da mensagem manual). */
function destination(patient: Patient, channel: BroadcastInput["channel"]) {
  if (channel === "email") return patient.email?.trim() ?? "";
  const phone = patient.whatsapp?.trim() || patient.phone?.trim() || "";
  return phoneDigits(phone).length >= 10 ? phone : "";
}

/**
 * Monta o comunicado: aplica o segmento (mesmo filtro da exportação de
 * clientes), respeita o opt-out do canal, pula quem não tem destino e preenche
 * `{{nome}}` com o primeiro nome. `today` é a data da clínica (aaaa-mm-dd).
 */
export function buildBroadcast(
  patients: Patient[],
  plans: PatientPlan[],
  preferences: CommunicationPreference[],
  input: BroadcastInput,
  today: string,
): BroadcastPlan {
  const segment = filterPatientsForExport(
    patients,
    plans,
    input.segment,
    today,
  );
  const optedOut = new Set(
    preferences
      .filter((item) => item.channel === input.channel && !item.allowed)
      .map((item) => item.patientId),
  );
  const drafts: BroadcastMessageDraft[] = [];
  const skipped: BroadcastSkippedPatient[] = [];
  for (const patient of segment) {
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
    const recipient = destination(patient, input.channel);
    if (!recipient) {
      skip("no_destination");
      continue;
    }
    const firstName =
      patient.fullName.trim().split(/\s+/)[0] ?? patient.fullName;
    const body = fillMessageTemplate(input.body, { nome: firstName });
    if (body.length > maxBodyLength) {
      skip("message_too_long");
      continue;
    }
    drafts.push({
      patientId: patient.id,
      channel: input.channel,
      recipient,
      body,
    });
  }
  return { matched: segment.length, drafts, skipped };
}
