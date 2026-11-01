import {
  AUTO_CAMPAIGN_LAST_STEP_WINDOW_DAYS,
  addMonthsToIsoDate,
  autoCampaignStepLabel,
  autoCampaignTriggerTiming,
  fillCampaignMessage,
  isOverdueReceivable,
  type AppModule,
  type Appointment,
  type AutoCampaign,
  type AutoCampaignDelivery,
  type AutoCampaignItem,
  type AutoCampaignPromotion,
  type AutoCampaignPromotionOffer,
  type AutoCampaignQueue,
  type AutoCampaignRedemption,
  type AutoCampaignStep,
  type AutoCampaignTrigger,
  type CommunicationPreference,
  type Patient,
  type PatientPlan,
  type PatientTab,
  type Receivable,
  type SatisfactionSurvey,
} from "@crm/contracts";
import type {
  AutoCampaignRedemptionWrite,
  ClinicRepository,
} from "../../repository.js";
import { DomainError } from "../../repository.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";
import { birthdayIn } from "../relationship/contact-suggestions.js";
import { destination } from "./broadcast.js";

/** Dados que as campanhas automáticas leem (mesmas fontes dos contatos sugeridos). */
export interface AutoCampaignSourceData {
  patients: Patient[];
  plans: PatientPlan[];
  appointments: Appointment[];
  receivables: Receivable[];
  /** Comandas; só as fechadas contam como compra. */
  tabs: PatientTab[];
  surveys: SatisfactionSurvey[];
  preferences: CommunicationPreference[];
}

/** Evento detectado para um cliente, com a medida usada para escolher a mensagem. */
export interface AutoCampaignEvent {
  patient: Patient;
  occurrenceKey: string;
  /** Dias até o evento (`before`), desde o evento (`after`) ou sessões restantes. */
  measure: number;
  eventDate?: string | undefined;
  detail: string;
  vars: Record<string, string>;
}

/** Quantos dias de histórico as campanhas "depois do evento" podem alcançar. */
export const AUTO_CAMPAIGN_HISTORY_DAYS =
  365 + AUTO_CAMPAIGN_LAST_STEP_WINDOW_DAYS;

function dayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function shortDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function daysUntilLabel(days: number, what: string, date: string) {
  return days === 0
    ? `${what} hoje`
    : `${what} em ${plural(days, "dia", "dias")} (${shortDate(date)})`;
}

/**
 * Eventos de um gatilho para os clientes ativos. A medida de cada evento escolhe qual
 * mensagem da campanha vale hoje (ver `activeStep`).
 */
export function detectAutoCampaignEvents(
  trigger: AutoCampaignTrigger,
  data: AutoCampaignSourceData,
  today: string,
  timezone: string,
): AutoCampaignEvent[] {
  const events: AutoCampaignEvent[] = [];
  const clinicDate = (value: string) => clinicDateOf(new Date(value), timezone);
  const active = data.patients.filter((patient) => patient.status === "active");
  const byPatient = <T extends { patientId?: string | undefined }>(
    items: T[],
    patientId: string,
  ) => items.filter((item) => item.patientId === patientId);

  for (const patient of active) {
    const add = (event: Omit<AutoCampaignEvent, "patient">) =>
      events.push({ patient, ...event });
    const plans = byPatient(data.plans, patient.id);
    const appointments = byPatient(data.appointments, patient.id).map(
      (appointment) => ({
        appointment,
        date: clinicDate(appointment.startsAt),
      }),
    );

    switch (trigger) {
      case "birthday": {
        const birthDate = patient.birthDate;
        if (!birthDate) break;
        const year = Number(today.slice(0, 4));
        const next = [year, year + 1]
          .map((item) => ({ year: item, date: birthdayIn(item, birthDate) }))
          .find((item) => daysBetween(today, item.date) >= 0);
        if (!next) break;
        const days = daysBetween(today, next.date);
        add({
          occurrenceKey: `${patient.id}:${next.year}`,
          measure: days,
          eventDate: next.date,
          detail: daysUntilLabel(days, "Aniversário", next.date),
          vars: {
            data: shortDate(next.date),
            idade: String(next.year - Number(birthDate.slice(0, 4))),
          },
        });
        break;
      }
      case "appointment_upcoming": {
        for (const { appointment, date } of appointments) {
          if (!["scheduled", "confirmed"].includes(appointment.status))
            continue;
          const days = daysBetween(today, date);
          if (days < 0) continue;
          const time = new Intl.DateTimeFormat("pt-BR", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(appointment.startsAt));
          add({
            occurrenceKey: appointment.id,
            measure: days,
            eventDate: date,
            detail: `${appointment.serviceName} ${
              days === 0 ? "hoje" : `em ${shortDate(date)}`
            } às ${time}`,
            vars: {
              data: shortDate(date),
              hora: time,
              servico: appointment.serviceName,
            },
          });
        }
        break;
      }
      case "plan_expiring": {
        for (const plan of plans) {
          if (
            plan.status !== "active" ||
            !plan.validUntil ||
            plan.autoRenew ||
            plan.renewedByPlanId
          )
            continue;
          const days = daysBetween(today, plan.validUntil);
          if (days < 0) continue;
          add({
            occurrenceKey: plan.id,
            measure: days,
            eventDate: plan.validUntil,
            detail:
              days === 0
                ? `${plan.name} termina hoje`
                : `${plan.name} termina em ${plural(days, "dia", "dias")} (${shortDate(plan.validUntil)})`,
            vars: { data: shortDate(plan.validUntil), plano: plan.name },
          });
        }
        break;
      }
      case "low_balance": {
        for (const plan of plans) {
          if (
            plan.status !== "active" ||
            plan.kind === "single" ||
            plan.renewedByPlanId
          )
            continue;
          for (const service of plan.services) {
            const name =
              plan.services.length === 1
                ? plan.name
                : `${plan.name} · ${service.serviceName}`;
            const remaining = service.remainingSessions;
            add({
              occurrenceKey:
                plan.services.length === 1
                  ? plan.id
                  : `${plan.id}:${service.serviceId}`,
              measure: remaining,
              eventDate: plan.validUntil,
              detail: `${name}: ${
                remaining === 0
                  ? "nenhuma sessão restante"
                  : plural(remaining, "sessão restante", "sessões restantes")
              }`,
              vars: { plano: name, sessoes: String(remaining) },
            });
          }
        }
        break;
      }
      case "overdue_payment": {
        const overdue = byPatient(data.receivables, patient.id)
          .filter((receivable) => isOverdueReceivable(receivable, today))
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const oldest = overdue[0];
        if (!oldest) break;
        add({
          occurrenceKey: oldest.id,
          measure: daysBetween(oldest.dueDate, today),
          eventDate: oldest.dueDate,
          detail: `${plural(overdue.length, "parcela em atraso", "parcelas em atraso")} desde ${shortDate(oldest.dueDate)}`,
          vars: {
            data: shortDate(oldest.dueDate),
            parcelas: String(overdue.length),
          },
        });
        break;
      }
      case "expired_with_balance": {
        for (const plan of plans) {
          if (
            plan.status !== "expired" ||
            plan.remainingSessions <= 0 ||
            plan.renewedByPlanId ||
            !plan.validUntil
          )
            continue;
          const days = daysBetween(plan.validUntil, today);
          if (days < 0) continue;
          add({
            occurrenceKey: plan.id,
            measure: days,
            eventDate: plan.validUntil,
            detail: `${plan.name} venceu em ${shortDate(plan.validUntil)} com ${plural(
              plan.remainingSessions,
              "sessão",
              "sessões",
            )}`,
            vars: {
              data: shortDate(plan.validUntil),
              plano: plan.name,
              sessoes: String(plan.remainingSessions),
            },
          });
        }
        break;
      }
      case "treatment_paused": {
        const last = appointments
          .filter(({ appointment }) => appointment.status === "completed")
          .sort((a, b) =>
            b.appointment.startsAt.localeCompare(a.appointment.startsAt),
          )[0];
        if (!last) break;
        const hasFuture = appointments.some(
          ({ appointment, date }) =>
            date >= today &&
            ["scheduled", "confirmed"].includes(appointment.status),
        );
        const days = daysBetween(last.date, today);
        if (hasFuture || days < 1) break;
        add({
          occurrenceKey: last.appointment.id,
          measure: days,
          eventDate: last.date,
          detail: `Último atendimento há ${plural(days, "dia", "dias")} (${shortDate(last.date)})`,
          vars: { data: shortDate(last.date) },
        });
        break;
      }
      case "single_no_return": {
        const last = [
          ...plans
            .filter(
              (plan) => plan.kind === "single" && plan.status !== "cancelled",
            )
            .map((plan) => ({ id: plan.id, date: clinicDate(plan.createdAt) })),
          ...byPatient(data.tabs, patient.id)
            .filter((tab) => tab.status === "closed" && tab.closedAt)
            .map((tab) => ({ id: tab.id, date: clinicDate(tab.closedAt!) })),
        ].sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!last) break;
        const returned =
          appointments.some(
            ({ appointment, date }) =>
              date > last.date &&
              ["scheduled", "confirmed", "completed"].includes(
                appointment.status,
              ),
          ) || plans.some((plan) => clinicDate(plan.createdAt) > last.date);
        const days = daysBetween(last.date, today);
        if (returned || days < 1) break;
        add({
          occurrenceKey: last.id,
          measure: days,
          eventDate: last.date,
          detail: `Última compra há ${plural(days, "dia", "dias")} (${shortDate(last.date)})`,
          vars: { data: shortDate(last.date) },
        });
        break;
      }
      case "former_client": {
        if (plans.some((plan) => plan.status === "active")) break;
        const former = plans
          .filter((plan) => plan.status === "cancelled" && plan.cancelledAt)
          .map((plan) => ({ plan, date: clinicDate(plan.cancelledAt!) }))
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!former) break;
        const days = daysBetween(former.date, today);
        if (days < 0) break;
        add({
          occurrenceKey: former.plan.id,
          measure: days,
          eventDate: former.date,
          detail: `${former.plan.name} cancelado há ${plural(days, "dia", "dias")} (${shortDate(former.date)})`,
          vars: { data: shortDate(former.date), plano: former.plan.name },
        });
        break;
      }
      case "nps_detractor": {
        const latest = byPatient(data.surveys, patient.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .find((survey) => survey.score <= 6);
        if (!latest) break;
        const date = clinicDate(latest.createdAt);
        const days = daysBetween(date, today);
        if (days < 0) break;
        add({
          occurrenceKey: latest.id,
          measure: days,
          eventDate: date,
          detail: `Avaliou com nota ${latest.score} em ${shortDate(date)}`,
          vars: { data: shortDate(date), nota: String(latest.score) },
        });
        break;
      }
    }
  }
  return events;
}

/**
 * Mensagem que vale hoje para a medida do evento, ou nenhuma.
 * - `before`/`sessions`: a de menor momento que ainda não passou (com 7, 2, 1 e 0 dias
 *   antes, faltando 5 dias vale a de 7; faltando 2, a de 2). Antes do maior momento, nada.
 * - `after`: a de maior momento já alcançado; a última fica na fila por
 *   `AUTO_CAMPAIGN_LAST_STEP_WINDOW_DAYS` dias.
 */
export function activeStep(
  trigger: AutoCampaignTrigger,
  steps: readonly AutoCampaignStep[],
  measure: number,
): AutoCampaignStep | undefined {
  if (measure < 0) return undefined;
  if (autoCampaignTriggerTiming[trigger] === "after") {
    const sorted = [...steps].sort((a, b) => a.offset - b.offset);
    const index = sorted.filter((step) => step.offset <= measure).length - 1;
    const step = sorted[index];
    if (!step) return undefined;
    const isLast = index === sorted.length - 1;
    return isLast && measure > step.offset + AUTO_CAMPAIGN_LAST_STEP_WINDOW_DAYS
      ? undefined
      : step;
  }
  return [...steps]
    .sort((a, b) => a.offset - b.offset)
    .find((step) => step.offset >= measure);
}

/** Gatilhos que dependem de um módulo além de Comunicações. */
export function autoCampaignTriggerAllowed(
  trigger: AutoCampaignTrigger,
  modules: readonly AppModule[],
) {
  return trigger !== "overdue_payment" || modules.includes("finance");
}

/**
 * Último dia da promoção para quem recebeu a mensagem. Com data final na campanha, é ela.
 * Senão, conta `validDays` a partir da data do evento (aniversário, consulta, vencimento…);
 * sem data do evento (sessões restantes), conta a partir de hoje, o dia do envio.
 */
export function promotionValidUntil(
  campaign: Pick<AutoCampaign, "trigger">,
  promotion: AutoCampaignPromotion,
  eventDate: string | undefined,
  today: string,
) {
  if (promotion.validUntil) return promotion.validUntil;
  const validDays = promotion.validDays ?? 0;
  const timing = autoCampaignTriggerTiming[campaign.trigger];
  if (!eventDate || timing === "sessions") return addDays(today, validDays);
  return addDays(eventDate, validDays);
}

/**
 * Prazo vigente da promoção de uma mensagem enviada, pela configuração atual da campanha:
 * data final da campanha; no aniversário, `validDays` depois do aniversário do cadastro do
 * cliente (ano do evento); nos demais, o prazo calculado no envio.
 */
export function deliveryPromotionValidUntil(
  campaign: Pick<AutoCampaign, "trigger" | "promotion">,
  delivery: Pick<AutoCampaignDelivery, "occurrenceKey" | "promotionValidUntil">,
  patient: Pick<Patient, "birthDate"> | null | undefined,
): string | undefined {
  const promotion = campaign.promotion;
  if (!promotion) return delivery.promotionValidUntil;
  if (promotion.validUntil) return promotion.validUntil;
  if (campaign.trigger === "birthday" && patient?.birthDate) {
    const year = Number(delivery.occurrenceKey.split(":").at(-1));
    if (Number.isInteger(year) && year > 0)
      return addDays(
        birthdayIn(year, patient.birthDate),
        promotion.validDays ?? 0,
      );
  }
  return delivery.promotionValidUntil;
}

/** Último dia em que quem usou a promoção fica fora da campanha. */
export function promotionBlockedUntil(
  redeemedOn: string,
  cooldown: NonNullable<AutoCampaignPromotion["cooldown"]>,
) {
  if (cooldown.unit === "months")
    return addMonthsToIsoDate(redeemedOn, cooldown.amount);
  return addDays(
    redeemedOn,
    cooldown.unit === "weeks" ? cooldown.amount * 7 : cooldown.amount,
  );
}

/** Usos que valem: cancelar o atendimento desfaz o uso da promoção. */
function activeRedemptions(redemptions: readonly AutoCampaignRedemption[]) {
  return redemptions.filter((item) => item.appointmentStatus !== "cancelled");
}

/**
 * Cliente fora da campanha: já usou a promoção neste evento ou está no bloqueio
 * depois de usar. Outras campanhas não são afetadas.
 */
function usedPromotion(
  redemptions: readonly AutoCampaignRedemption[],
  campaignId: string,
  patientId: string,
  occurrenceKey: string,
  today: string,
) {
  return redemptions.some(
    (item) =>
      item.campaignId === campaignId &&
      item.patientId === patientId &&
      (item.occurrenceKey === occurrenceKey ||
        (item.blockedUntil !== undefined && item.blockedUntil >= today)),
  );
}

/**
 * Promoções que o cliente pode usar ao agendar hoje: campanha promocional ativa, mensagem
 * marcada como enviada, prazo vigente e sem uso (ou bloqueio) nesta campanha.
 */
export function listPromotionOffers(
  campaigns: readonly AutoCampaign[],
  deliveries: readonly AutoCampaignDelivery[],
  redemptions: readonly AutoCampaignRedemption[],
  patientId: string,
  today: string,
  patient?: Pick<Patient, "birthDate"> | null,
): AutoCampaignPromotionOffer[] {
  const active = activeRedemptions(redemptions);
  const offers = new Map<string, AutoCampaignPromotionOffer>();
  for (const campaign of campaigns) {
    if (!campaign.active || !campaign.promotion) continue;
    for (const delivery of deliveries) {
      if (
        delivery.campaignId !== campaign.id ||
        delivery.patientId !== patientId ||
        delivery.status !== "sent"
      )
        continue;
      const validUntil = deliveryPromotionValidUntil(
        campaign,
        delivery,
        patient,
      );
      if (
        !validUntil ||
        validUntil < today ||
        usedPromotion(
          active,
          campaign.id,
          patientId,
          delivery.occurrenceKey,
          today,
        )
      )
        continue;
      const key = `${campaign.id}:${delivery.occurrenceKey}`;
      const current = offers.get(key);
      if (current && current.validUntil >= validUntil) continue;
      offers.set(key, {
        campaignId: campaign.id,
        campaignName: campaign.name,
        occurrenceKey: delivery.occurrenceKey,
        validUntil,
        ...(campaign.promotion.discount
          ? {
              discount: campaign.promotion.discount,
              planTemplateIds: campaign.promotion.planTemplateIds ?? [],
            }
          : {}),
      });
    }
  }
  return [...offers.values()].sort(
    (a, b) =>
      a.validUntil.localeCompare(b.validUntil) ||
      a.campaignName.localeCompare(b.campaignName, "pt-BR"),
  );
}

export async function clinicToday(
  repository: ClinicRepository,
  clinicId: string,
) {
  const settings = await repository.getClinicSettings(clinicId);
  return clinicDateOf(
    new Date(),
    settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
  );
}

/** Promoções vigentes hoje para o cliente (pergunta exibida ao agendar). */
export async function loadPromotionOffers(
  repository: ClinicRepository,
  clinicId: string,
  patientId: string,
) {
  const today = await clinicToday(repository, clinicId);
  const campaigns = await repository.listAutoCampaigns(clinicId);
  if (!campaigns.some((campaign) => campaign.active && campaign.promotion))
    return { today, campaigns, offers: [] };
  const [deliveries, redemptions, patient] = await Promise.all([
    repository.listAutoCampaignDeliveries(clinicId),
    repository.listAutoCampaignRedemptions(clinicId),
    repository.getPatient(clinicId, patientId),
  ]);
  return {
    today,
    campaigns,
    offers: listPromotionOffers(
      campaigns,
      deliveries,
      redemptions,
      patientId,
      today,
      patient,
    ),
  };
}

/**
 * Confere que a promoção escolhida ao agendar ainda vale para o cliente hoje (a data do
 * atendimento não importa) e monta o uso, com o bloqueio da campanha se houver.
 */
export async function resolvePromotionRedemption(
  repository: ClinicRepository,
  clinicId: string,
  patientId: string,
  promotion: { campaignId: string; occurrenceKey: string },
): Promise<AutoCampaignRedemptionWrite> {
  const { today, campaigns, offers } = await loadPromotionOffers(
    repository,
    clinicId,
    patientId,
  );
  const offer = offers.find(
    (item) =>
      item.campaignId === promotion.campaignId &&
      item.occurrenceKey === promotion.occurrenceKey,
  );
  const cooldown = campaigns.find((item) => item.id === promotion.campaignId)
    ?.promotion?.cooldown;
  if (!offer)
    throw new DomainError(
      "AUTO_CAMPAIGN_PROMOTION_UNAVAILABLE",
      "Essa promoção não está mais disponível para o cliente.",
      409,
    );
  return {
    campaignId: offer.campaignId,
    occurrenceKey: offer.occurrenceKey,
    redeemedOn: today,
    ...(cooldown
      ? { blockedUntil: promotionBlockedUntil(today, cooldown) }
      : {}),
  };
}

const statusRank = { pending: 0, skipped: 1, sent: 2 } as const;

/**
 * Fila do dia: para cada campanha ativa, os clientes cujo evento está no momento de
 * alguma mensagem, com o que já foi enviado ou pulado. Quem não autoriza WhatsApp ou não
 * tem número entra como não enviada, com o motivo apontado pelo sistema.
 */
export function buildAutoCampaignQueue(
  campaigns: readonly AutoCampaign[],
  data: AutoCampaignSourceData,
  deliveries: readonly AutoCampaignDelivery[],
  today: string,
  timezone: string,
  redemptions: readonly AutoCampaignRedemption[] = [],
): AutoCampaignQueue {
  const used = activeRedemptions(redemptions);
  const optedOut = new Set(
    data.preferences
      .filter((item) => item.channel === "whatsapp" && !item.allowed)
      .map((item) => item.patientId),
  );
  const recorded = new Map(
    deliveries.map((delivery) => [
      `${delivery.campaignId}:${delivery.stepId}:${delivery.occurrenceKey}`,
      delivery,
    ]),
  );
  const items: AutoCampaignItem[] = [];
  const eventsByTrigger = new Map<AutoCampaignTrigger, AutoCampaignEvent[]>();
  for (const campaign of campaigns) {
    if (!campaign.active) continue;
    let events = eventsByTrigger.get(campaign.trigger);
    if (!events) {
      events = detectAutoCampaignEvents(
        campaign.trigger,
        data,
        today,
        timezone,
      );
      eventsByTrigger.set(campaign.trigger, events);
    }
    for (const event of events) {
      const step = activeStep(campaign.trigger, campaign.steps, event.measure);
      if (!step) continue;
      const key = `${campaign.id}:${step.id}:${event.occurrenceKey}`;
      const delivery = recorded.get(key);
      // Quem já usou a promoção (ou está bloqueado) sai da fila; o que foi registrado fica.
      if (
        !delivery &&
        campaign.promotion &&
        usedPromotion(
          used,
          campaign.id,
          event.patient.id,
          event.occurrenceKey,
          today,
        )
      )
        continue;
      const phone = destination(event.patient, "whatsapp");
      const blockedReason = delivery
        ? undefined
        : optedOut.has(event.patient.id)
          ? ("opt_out" as const)
          : !phone
            ? ("no_destination" as const)
            : undefined;
      items.push({
        key,
        campaignId: campaign.id,
        campaignName: campaign.name,
        trigger: campaign.trigger,
        stepId: step.id,
        stepLabel: autoCampaignStepLabel(campaign.trigger, step.offset),
        patientId: event.patient.id,
        patientName: event.patient.fullName,
        phone,
        occurrenceKey: event.occurrenceKey,
        eventDate: event.eventDate,
        detail: event.detail,
        message: fillCampaignMessage(
          step.message,
          event.patient.fullName,
        ).replace(
          /\{\{\s*([a-z_]+)\s*\}\}/g,
          (match, name: string) => event.vars[name] ?? match,
        ),
        status: delivery
          ? delivery.status
          : blockedReason
            ? "skipped"
            : "pending",
        ...(delivery ? { delivery } : {}),
        ...(blockedReason ? { blockedReason } : {}),
      });
    }
  }
  items.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      (a.eventDate ?? "").localeCompare(b.eventDate ?? "") ||
      a.patientName.localeCompare(b.patientName, "pt-BR"),
  );
  return {
    date: today,
    items,
    campaigns: campaigns.map((campaign) => {
      const own = items.filter((item) => item.campaignId === campaign.id);
      return {
        campaignId: campaign.id,
        name: campaign.name,
        trigger: campaign.trigger,
        active: campaign.active,
        pending: own.filter((item) => item.status === "pending").length,
        sent: own.filter((item) => item.status === "sent").length,
        skipped: own.filter((item) => item.status === "skipped").length,
      };
    }),
  };
}

/** Fila de hoje com os dados atuais (cada consulta recalcula: a fila se atualiza sozinha). */
export async function loadAutoCampaignQueue(
  repository: ClinicRepository,
  clinicId: string,
  modules: readonly AppModule[],
): Promise<AutoCampaignQueue> {
  const settings = await repository.getClinicSettings(clinicId);
  const timezone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
  const today = clinicDateOf(new Date(), timezone);
  const campaigns = (await repository.listAutoCampaigns(clinicId)).filter(
    (campaign) => autoCampaignTriggerAllowed(campaign.trigger, modules),
  );
  if (!campaigns.some((campaign) => campaign.active))
    return buildAutoCampaignQueue(
      campaigns,
      emptySourceData,
      [],
      today,
      timezone,
    );
  const [data, center, deliveries, redemptions] = await Promise.all([
    repository.getAutoCampaignSourceData(
      clinicId,
      addDays(today, -AUTO_CAMPAIGN_HISTORY_DAYS),
    ),
    repository.getCommunicationCenter(clinicId),
    repository.listAutoCampaignDeliveries(clinicId),
    campaigns.some((campaign) => campaign.promotion)
      ? repository.listAutoCampaignRedemptions(clinicId)
      : [],
  ]);
  return buildAutoCampaignQueue(
    campaigns,
    { ...data, preferences: center.preferences },
    deliveries,
    today,
    timezone,
    redemptions,
  );
}

const emptySourceData: AutoCampaignSourceData = {
  patients: [],
  plans: [],
  appointments: [],
  receivables: [],
  tabs: [],
  surveys: [],
  preferences: [],
};
