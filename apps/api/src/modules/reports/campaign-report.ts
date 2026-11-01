import {
  autoCampaignBlockedReasonLabels,
  autoCampaignSkipReasonLabels,
  autoCampaignStepLabel,
  autoCampaignTriggerLabels,
  type AutoCampaign,
  type AutoCampaignDelivery,
  type AutoCampaignItem,
  type AutoCampaignRedemption,
  type CampaignReport,
  type CampaignReportMessage,
  type CampaignReportRow,
  type Patient,
  type WhatsappCampaign,
  type WhatsappCampaignDetail,
} from "@crm/contracts";
import { clinicDateOf } from "../finance/daily-cash.js";
import { destination } from "../communications/broadcast.js";

export interface CampaignReportSources {
  manual: WhatsappCampaignDetail[];
  automatic: AutoCampaign[];
  deliveries: AutoCampaignDelivery[];
  redemptions: AutoCampaignRedemption[];
  patients: Patient[];
  /**
   * Fila de hoje das automáticas, quando hoje está no período: as mensagens ainda não
   * marcadas viram as pendentes de cada campanha e, na planilha, entram como previstas.
   */
  queue?: AutoCampaignItem[] | undefined;
  /** Dia da fila (aaaa-mm-dd), presente junto com `queue`. */
  queueDate?: string | undefined;
}

/** Uso da promoção pelo cliente nesta ocorrência; um uso ativo vale mais que um cancelado. */
function redemptionOf(
  redemptions: AutoCampaignRedemption[],
  campaignId: string,
  patientId: string,
  occurrenceKey: string,
) {
  const own = redemptions.filter(
    (item) =>
      item.campaignId === campaignId &&
      item.patientId === patientId &&
      item.occurrenceKey === occurrenceKey,
  );
  return (
    own.find((item) => item.appointmentStatus !== "cancelled") ?? own.at(-1)
  );
}

/** Campanhas manuais criadas entre as datas (dia da clínica). */
export function manualCampaignsInPeriod(
  campaigns: WhatsappCampaign[],
  from: string,
  to: string,
  timeZone: string,
) {
  return campaigns.filter((campaign) => {
    const day = clinicDateOf(campaign.createdAt, timeZone);
    return day >= from && day <= to;
  });
}

/**
 * Relatório de campanhas: as manuais mostram a situação atual de cada destinatário;
 * as automáticas contam as mensagens marcadas e as promoções usadas no período.
 */
export function buildCampaignReport(
  from: string,
  to: string,
  sources: CampaignReportSources,
  timeZone: string,
  generatedAt = new Date().toISOString(),
): { report: CampaignReport; messages: CampaignReportMessage[] } {
  const inPeriod = (iso: string) => {
    const day = clinicDateOf(iso, timeZone);
    return day >= from && day <= to;
  };
  const patients = new Map(
    sources.patients.map((patient) => [patient.id, patient]),
  );
  const rows: CampaignReportRow[] = [];
  const messages: CampaignReportMessage[] = [];

  for (const campaign of sources.manual) {
    const count = (status: string) =>
      campaign.recipients.filter((item) => item.status === status).length;
    rows.push({
      campaignId: campaign.id,
      kind: "manual",
      name: campaign.name,
      origin: campaign.templateTitle,
      createdAt: campaign.createdAt,
      createdByName: campaign.createdByName,
      active: !campaign.completedAt,
      total: campaign.recipients.length,
      sent: count("sent"),
      skipped: count("skipped"),
      pending: count("pending"),
      redemptions: 0,
    });
    for (const recipient of campaign.recipients)
      messages.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        kind: "manual",
        patientName: recipient.patientName,
        phone: recipient.phone,
        status: recipient.status,
        detail: "",
        handledAt: recipient.handledAt,
        handledByName: recipient.handledByName,
        message: recipient.message,
      });
  }

  for (const campaign of sources.automatic) {
    const deliveries = sources.deliveries.filter(
      (item) => item.campaignId === campaign.id && inPeriod(item.handledAt),
    );
    const redemptions = sources.redemptions.filter(
      (item) =>
        item.campaignId === campaign.id &&
        item.appointmentStatus !== "cancelled" &&
        item.redeemedOn >= from &&
        item.redeemedOn <= to,
    ).length;
    if (!campaign.active && !deliveries.length && !redemptions) continue;
    const sent = deliveries.filter((item) => item.status === "sent").length;
    const pending = (sources.queue ?? []).filter(
      (item) => item.campaignId === campaign.id && item.status === "pending",
    ).length;
    rows.push({
      campaignId: campaign.id,
      kind: "automatic",
      name: campaign.name,
      origin: autoCampaignTriggerLabels[campaign.trigger],
      createdAt: campaign.createdAt,
      createdByName: campaign.createdByName,
      active: campaign.active,
      total: deliveries.length,
      sent,
      skipped: deliveries.length - sent,
      pending,
      redemptions,
      promotional: Boolean(campaign.promotion),
    });
    const promotionOf = (
      patientId: string,
      occurrenceKey: string,
      validUntil: string | undefined,
    ) => {
      if (!campaign.promotion) return {};
      const used = redemptionOf(
        sources.redemptions,
        campaign.id,
        patientId,
        occurrenceKey,
      );
      return {
        promotion: {
          validUntil,
          redeemedOn: used?.redeemedOn,
          appointmentStatus: used?.appointmentStatus,
        },
      };
    };
    for (const delivery of deliveries) {
      const patient = patients.get(delivery.patientId);
      const step = campaign.steps.find((item) => item.id === delivery.stepId);
      const stepLabel = step
        ? autoCampaignStepLabel(campaign.trigger, step.offset)
        : "";
      const reason = [
        delivery.skipReason
          ? autoCampaignSkipReasonLabels[delivery.skipReason]
          : "",
        delivery.note ?? "",
      ]
        .filter(Boolean)
        .join(" · ");
      messages.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        kind: "automatic",
        patientName: patient?.fullName ?? "Cliente removido",
        phone: patient ? destination(patient, "whatsapp") : "",
        status: delivery.status,
        detail: [stepLabel, reason].filter(Boolean).join(" · "),
        handledAt: delivery.handledAt,
        handledByName: delivery.handledByName,
        step: stepLabel,
        reason,
        message: delivery.message,
        ...promotionOf(
          delivery.patientId,
          delivery.occurrenceKey,
          delivery.promotionValidUntil,
        ),
      });
    }
    // O que já foi marcado veio acima; da fila entram só as previstas e as bloqueadas.
    for (const item of sources.queue ?? []) {
      if (item.campaignId !== campaign.id || item.delivery) continue;
      const reason = item.blockedReason
        ? autoCampaignBlockedReasonLabels[item.blockedReason]
        : "";
      messages.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        kind: "automatic",
        patientName: item.patientName,
        phone: item.phone,
        status: item.status,
        detail: [item.stepLabel, item.detail, reason]
          .filter(Boolean)
          .join(" · "),
        step: item.stepLabel,
        eventDate: item.eventDate,
        reason,
        message: item.message,
        upcoming: true,
        ...promotionOf(item.patientId, item.occurrenceKey, undefined),
      });
    }
  }

  // Mais recentes primeiro; as mensagens seguem a ordem das campanhas.
  rows.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const order = new Map(rows.map((row, index) => [row.campaignId, index]));
  messages.sort(
    (a, b) =>
      (order.get(a.campaignId) ?? 0) - (order.get(b.campaignId) ?? 0) ||
      (b.handledAt ?? "").localeCompare(a.handledAt ?? "") ||
      a.patientName.localeCompare(b.patientName, "pt-BR"),
  );
  const sum = (key: "sent" | "skipped" | "pending" | "redemptions") =>
    rows.reduce((total, row) => total + row[key], 0);
  return {
    report: {
      from,
      to,
      generatedAt,
      ...(sources.queueDate ? { queueDate: sources.queueDate } : {}),
      summary: {
        manualCampaigns: rows.filter((row) => row.kind === "manual").length,
        automaticCampaigns: rows.filter((row) => row.kind === "automatic")
          .length,
        sent: sum("sent"),
        skipped: sum("skipped"),
        pending: sum("pending"),
        redemptions: sum("redemptions"),
      },
      campaigns: rows,
    },
    messages,
  };
}
