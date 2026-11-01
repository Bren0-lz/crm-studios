import type {
  AppointmentStatus,
  CampaignReport,
  CampaignReportMessage,
  CampaignReportRow,
} from "@crm/contracts";
import ExcelJS from "exceljs";
import { dateFormat, heading } from "./sales-workbook.js";

const kindLabels = { manual: "Manual", automatic: "Automática" } as const;
const statusLabels = {
  pending: "Pendente",
  sent: "Enviada",
  skipped: "Não enviada",
} as const;
const appointmentLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Realizado",
  no_show: "Faltou",
  excused_absence: "Falta justificada",
  professional_absence: "Falta do profissional",
  cancelled: "Cancelado",
};
const dayFormat = "dd/mm/yyyy";

function situation(item: CampaignReportRow) {
  if (item.kind === "automatic") return item.active ? "Ligada" : "Desligada";
  return item.active ? "Em andamento" : "Concluída";
}

/** Situação da mensagem; a prevista na fila de hoje ainda não foi marcada por ninguém. */
function messageStatus(item: CampaignReportMessage) {
  if (item.upcoming && item.status === "pending")
    return "Prevista (fila de hoje)";
  return statusLabels[item.status];
}

function usedPromotion(item: CampaignReportMessage) {
  if (!item.promotion) return "";
  if (!item.promotion.redeemedOn) return "Não";
  return item.promotion.appointmentStatus === "cancelled"
    ? "Não (agendamento cancelado)"
    : "Sim";
}

/** Data aaaa-mm-dd como data do Excel (meio-dia em UTC para não mudar de dia). */
function day(value: string | undefined) {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

/**
 * Nome de aba válido no Excel: até 31 caracteres, sem `\ / ? * [ ] :`, sem aspas simples
 * nas pontas e sem repetir (o Excel não diferencia maiúsculas).
 */
function sheetName(name: string, used: Set<string>) {
  const base =
    name
      .replace(/[\\/?*[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^'+|'+$/g, "")
      .slice(0, 31)
      .trim() || "Campanha";
  let candidate = base;
  for (let index = 2; used.has(candidate.toLocaleLowerCase("pt-BR")); index++) {
    const suffix = ` (${index})`;
    candidate = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
  }
  used.add(candidate.toLocaleLowerCase("pt-BR"));
  return candidate;
}

/** Aba de uma campanha: cada contato previsto ou já tratado, com quem marcou e quando. */
function addCampaignSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  campaign: CampaignReportRow,
  messages: CampaignReportMessage[],
) {
  const sheet = workbook.addWorksheet(name);
  const automatic = campaign.kind === "automatic";
  sheet.columns = [
    { header: "Cliente", key: "patient", width: 28 },
    { header: "WhatsApp", key: "phone", width: 18 },
    { header: "Situação", key: "status", width: 22 },
    ...(automatic
      ? [
          { header: "Mensagem da campanha", key: "step", width: 22 },
          { header: "Data do evento", key: "eventDate", width: 15 },
          { header: "Motivo ou observação", key: "reason", width: 36 },
        ]
      : []),
    { header: "Marcada em", key: "handledAt", width: 20 },
    { header: "Marcada por", key: "handledBy", width: 24 },
    ...(campaign.promotional
      ? [
          { header: "Promoção válida até", key: "validUntil", width: 19 },
          { header: "Usou a promoção", key: "used", width: 26 },
          { header: "Agendou com a promoção em", key: "redeemedOn", width: 26 },
          { header: "Situação do agendamento", key: "appointment", width: 24 },
        ]
      : []),
    { header: "Texto enviado", key: "message", width: 60 },
  ];
  heading(sheet);
  for (const item of messages) {
    const row = sheet.addRow({
      patient: item.patientName,
      phone: item.phone,
      status: messageStatus(item),
      step: item.step ?? "",
      eventDate: day(item.eventDate),
      reason: item.reason ?? "",
      handledAt: item.handledAt ? new Date(item.handledAt) : null,
      handledBy: item.handledByName ?? "",
      validUntil: day(item.promotion?.validUntil),
      used: usedPromotion(item),
      redeemedOn: day(item.promotion?.redeemedOn),
      appointment: item.promotion?.appointmentStatus
        ? appointmentLabels[item.promotion.appointmentStatus]
        : "",
      message: item.message ?? "",
    });
    row.getCell("handledAt").numFmt = dateFormat;
    if (automatic) row.getCell("eventDate").numFmt = dayFormat;
    if (campaign.promotional) {
      row.getCell("validUntil").numFmt = dayFormat;
      row.getCell("redeemedOn").numFmt = dayFormat;
    }
  }
}

export async function campaignReportToXlsx(
  report: CampaignReport,
  messages: CampaignReportMessage[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studios Aryana";
  workbook.created = new Date(report.generatedAt);

  const used = new Set(["resumo", "campanhas", "mensagens", "history"]);
  const sheetNames = new Map(
    report.campaigns.map((item) => [
      item.campaignId,
      sheetName(item.name, used),
    ]),
  );

  const summary = workbook.addWorksheet("Resumo");
  summary.columns = [
    { header: "Indicador", width: 42 },
    { header: "Período selecionado", width: 30 },
  ];
  heading(summary);
  summary.addRows([
    ["Período", report.from + " a " + report.to],
    ["Campanhas manuais", report.summary.manualCampaigns],
    ["Campanhas automáticas", report.summary.automaticCampaigns],
    ["Mensagens enviadas", report.summary.sent],
    ["Mensagens não enviadas", report.summary.skipped],
    ["Mensagens pendentes", report.summary.pending],
    ["Promoções usadas", report.summary.redemptions],
  ]);

  const campaigns = workbook.addWorksheet("Campanhas");
  campaigns.columns = [
    { header: "Tipo", key: "kind", width: 14 },
    { header: "Campanha", key: "name", width: 32 },
    { header: "Modelo ou evento", key: "origin", width: 30 },
    { header: "Situação", key: "status", width: 16 },
    { header: "Criada em", key: "createdAt", width: 20 },
    { header: "Criada por", key: "createdBy", width: 24 },
    { header: "Mensagens", key: "total", width: 13 },
    { header: "Enviadas", key: "sent", width: 12 },
    { header: "Não enviadas", key: "skipped", width: 15 },
    { header: "Pendentes", key: "pending", width: 13 },
    { header: "Taxa de envio", key: "rate", width: 15 },
    { header: "Promoções usadas", key: "redemptions", width: 18 },
    { header: "Aba com os contatos", key: "sheet", width: 32 },
  ];
  heading(campaigns);
  for (const item of report.campaigns) {
    const target = sheetNames.get(item.campaignId)!;
    const row = campaigns.addRow({
      kind: kindLabels[item.kind],
      name: item.name,
      origin: item.origin,
      status: situation(item),
      createdAt: new Date(item.createdAt),
      createdBy: item.createdByName,
      total: item.total,
      sent: item.sent,
      skipped: item.skipped,
      pending:
        item.kind === "manual" || report.queueDate ? item.pending : null,
      rate: item.total ? item.sent / item.total : null,
      redemptions:
        item.kind === "automatic" && item.promotional
          ? item.redemptions
          : null,
      sheet: {
        text: target,
        hyperlink: `#'${target.replace(/'/g, "''")}'!A1`,
      },
    });
    row.getCell("createdAt").numFmt = dateFormat;
    row.getCell("rate").numFmt = "0.0%";
  }

  const sheet = workbook.addWorksheet("Mensagens");
  sheet.columns = [
    { header: "Tipo", key: "kind", width: 14 },
    { header: "Campanha", key: "campaign", width: 32 },
    { header: "Cliente", key: "patient", width: 28 },
    { header: "WhatsApp", key: "phone", width: 18 },
    { header: "Situação", key: "status", width: 22 },
    { header: "Detalhe", key: "detail", width: 40 },
    { header: "Marcada em", key: "handledAt", width: 20 },
    { header: "Marcada por", key: "handledBy", width: 24 },
    { header: "Usou a promoção", key: "used", width: 26 },
  ];
  heading(sheet);
  for (const item of messages) {
    const row = sheet.addRow({
      kind: kindLabels[item.kind],
      campaign: item.campaignName,
      patient: item.patientName,
      phone: item.phone,
      status: messageStatus(item),
      detail: item.detail,
      handledAt: item.handledAt ? new Date(item.handledAt) : null,
      handledBy: item.handledByName ?? "",
      used: usedPromotion(item),
    });
    row.getCell("handledAt").numFmt = dateFormat;
  }

  for (const item of report.campaigns)
    addCampaignSheet(
      workbook,
      sheetNames.get(item.campaignId)!,
      item,
      messages.filter((message) => message.campaignId === item.campaignId),
    );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
