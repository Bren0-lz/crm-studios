import type { CampaignReport, CampaignReportMessage } from "@crm/contracts";
import ExcelJS from "exceljs";
import { dateFormat, heading } from "./sales-workbook.js";

const kindLabels = { manual: "Manual", automatic: "Automática" } as const;
const statusLabels = {
  pending: "Pendente",
  sent: "Enviada",
  skipped: "Não enviada",
} as const;

export async function campaignReportToXlsx(
  report: CampaignReport,
  messages: CampaignReportMessage[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Studios Aryana";
  workbook.created = new Date(report.generatedAt);

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
    ["Mensagens pendentes (manuais)", report.summary.pending],
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
  ];
  heading(campaigns);
  for (const item of report.campaigns) {
    const row = campaigns.addRow({
      kind: kindLabels[item.kind],
      name: item.name,
      origin: item.origin,
      status:
        item.kind === "automatic"
          ? item.active
            ? "Ligada"
            : "Desligada"
          : item.active
            ? "Em andamento"
            : "Concluída",
      createdAt: new Date(item.createdAt),
      createdBy: item.createdByName,
      total: item.total,
      sent: item.sent,
      skipped: item.skipped,
      pending: item.kind === "manual" ? item.pending : null,
      rate: item.total ? item.sent / item.total : null,
      redemptions: item.kind === "automatic" ? item.redemptions : null,
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
    { header: "Situação", key: "status", width: 14 },
    { header: "Detalhe", key: "detail", width: 40 },
    { header: "Marcada em", key: "handledAt", width: 20 },
    { header: "Marcada por", key: "handledBy", width: 24 },
  ];
  heading(sheet);
  for (const item of messages) {
    const row = sheet.addRow({
      kind: kindLabels[item.kind],
      campaign: item.campaignName,
      patient: item.patientName,
      phone: item.phone,
      status: statusLabels[item.status],
      detail: item.detail,
      handledAt: item.handledAt ? new Date(item.handledAt) : null,
      handledBy: item.handledByName ?? "",
    });
    row.getCell("handledAt").numFmt = dateFormat;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
