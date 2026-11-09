import {
  eventParticipantStatus,
  eventParticipantStatusLabels,
  formatExtraFields,
  type EventParticipant,
  type LeadStageConfig,
} from "@crm/contracts";
import {
  addTableSheet,
  createWorkbook,
  phoneColumns,
  sheetDate,
  sheetDateTime,
  workbookBuffer,
  type SheetColumn,
} from "../../infrastructure/spreadsheet.js";
import { clinicDateOf } from "../finance/daily-cash.js";

/** Interesse principal e os do perfil, sem repetir. */
function interestText(participant: EventParticipant) {
  return [
    ...new Set([participant.interest, ...(participant.interests ?? [])]),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Planilha dos participantes (já filtrados pela filial ativa na leitura). Telefones em DDD +
 * número, como na exportação de clientes (a importação de participantes lê esse formato);
 * datas e horas no fuso da clínica.
 */
export async function eventParticipantsToXlsx(
  participants: readonly EventParticipant[],
  stages: readonly LeadStageConfig[],
  timeZone: string,
): Promise<Buffer> {
  const stageLabel = new Map(stages.map((item) => [item.stage, item.label]));
  const columns: SheetColumn<EventParticipant>[] = [
    { header: "Nome", value: (item) => item.fullName },
    ...phoneColumns<EventParticipant>("Telefone", (item) => item.phone),
    ...phoneColumns<EventParticipant>("WhatsApp", (item) => item.whatsapp),
    { header: "E-mail", value: (item) => item.email },
    { header: "Interesse", value: interestText },
    {
      header: "Etapa",
      value: (item) => stageLabel.get(item.stage) ?? item.stage,
    },
    {
      header: "Status",
      value: (item) =>
        eventParticipantStatusLabels[eventParticipantStatus(item)],
    },
    {
      header: "Último contato",
      kind: "datetime",
      value: (item) => sheetDateTime(item.contactedAt, timeZone),
    },
    {
      header: "Avaliação marcada",
      kind: "datetime",
      value: (item) => sheetDateTime(item.evaluationAt, timeZone),
    },
    {
      header: "Virou cliente",
      value: (item) => (item.convertedPatientId ? "Sim" : "Não"),
    },
    {
      header: "Data da conversão",
      kind: "date",
      value: (item) =>
        item.convertedAt
          ? sheetDate(clinicDateOf(item.convertedAt, timeZone))
          : null,
    },
    { header: "Outros", value: (item) => formatExtraFields(item.extraFields) },
  ];
  const workbook = createWorkbook();
  addTableSheet(workbook, "Participantes", columns, participants);
  return workbookBuffer(workbook);
}
