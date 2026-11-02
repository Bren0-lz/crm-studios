import { isOverdueReceivable, planHasSessionBalance } from "@crm/contracts";
import type {
  AppModule,
  Appointment,
  BirthdayEntry,
  ContactActivity,
  ContactReason,
  ContactSuggestion,
  Patient,
  PatientPlan,
  PatientTab,
  Receivable,
  RelationshipSettings,
  SatisfactionSurvey,
} from "@crm/contracts";

export interface ContactSuggestionData {
  patients: Patient[];
  plans: PatientPlan[];
  appointments: Appointment[];
  receivables: Receivable[];
  /** Comandas; só as fechadas contam como compra. */
  tabs: PatientTab[];
  activities: ContactActivity[];
  /** Pesquisas de satisfação (regra `nps_detractor`); basta a janela de 30 dias. */
  surveys?: SatisfactionSurvey[] | undefined;
}

/** Ordem geral das situações; menor = mais urgente. */
const reasonRank: Record<ContactReason, number> = {
  overdue_payment: 0,
  birthday: 2,
  single_no_return: 3,
  plan_expiring: 4,
  low_balance: 5,
  expired_with_balance: 6,
  treatment_paused: 7,
  repeated_no_show: 8,
  former_client: 9,
  nps_detractor: 10,
};
const birthdayTodayRank = 1;

/** Janela fixa da regra `nps_detractor`, em dias. */
export const npsDetractorWindowDays = 30;
const npsDetractorMaxScore = 6;

/** Primeira data (aaaa-mm-dd) que ainda entra na janela `nps_detractor`. */
export function npsDetractorWindowStart(today: string) {
  return new Date((dayNumber(today) - npsDetractorWindowDays) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function clinicDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function dayNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / 86_400_000;
}

function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Aniversário no ano dado; 29/02 vira 28/02 em ano não bissexto. */
export function birthdayIn(year: number, birthDate: string) {
  const month = birthDate.slice(5, 7);
  let day = birthDate.slice(8, 10);
  if (month === "02" && day === "29" && !isLeapYear(year)) day = "28";
  return `${year}-${month}-${day}`;
}

function shortDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface Candidate {
  suggestion: ContactSuggestion;
  sortKey: number;
}

export function buildContactSuggestions(
  data: ContactSuggestionData,
  settings: RelationshipSettings,
  today: string,
  /** Módulos que o usuário vê: parcela vencida só aparece para quem vê o Financeiro. */
  modules: readonly AppModule[],
): ContactSuggestion[] {
  const candidates: Candidate[] = [];
  const activePatients = data.patients.filter(
    (patient) => patient.status === "active",
  );

  for (const patient of activePatients) {
    const add = (
      reason: ContactReason,
      referenceKey: string,
      detail: string,
      sortKey: number,
      dueDate?: string,
      priority = reasonRank[reason],
    ) => {
      candidates.push({
        sortKey,
        suggestion: {
          patientId: patient.id,
          patientName: patient.fullName,
          phone: patient.phone,
          whatsapp: patient.whatsapp ? patient.whatsapp : undefined,
          reason,
          referenceKey,
          detail,
          dueDate,
          priority,
        },
      });
    };

    const plans = data.plans.filter((plan) => plan.patientId === patient.id);
    const appointments = data.appointments
      .filter((appointment) => appointment.patientId === patient.id)
      .map((appointment) => ({
        appointment,
        date: clinicDate(appointment.startsAt),
      }));

    // birthday
    if (patient.birthDate) {
      const year = Number(today.slice(0, 4));
      const occurrences = [year, year + 1].map((item) => ({
        year: item,
        date: birthdayIn(item, patient.birthDate!),
      }));
      const next = occurrences.find(
        (item) =>
          daysBetween(today, item.date) >= 0 &&
          daysBetween(today, item.date) <= settings.birthdayDaysAhead,
      );
      if (next) {
        const days = daysBetween(today, next.date);
        add(
          "birthday",
          `${patient.id}:${next.year}`,
          days === 0
            ? "Aniversário hoje"
            : `Aniversário em ${plural(days, "dia", "dias")} (${shortDate(next.date)})`,
          days,
          next.date,
          days === 0 ? birthdayTodayRank : reasonRank.birthday,
        );
      }
    }

    // single_no_return
    const purchases = [
      ...plans
        .filter((plan) => plan.kind === "single" && plan.status !== "cancelled")
        .map((plan) => ({ id: plan.id, date: clinicDate(plan.createdAt) })),
      ...data.tabs
        .filter(
          (tab) =>
            tab.patientId === patient.id &&
            tab.status === "closed" &&
            tab.closedAt,
        )
        .map((tab) => ({ id: tab.id, date: clinicDate(tab.closedAt!) })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const lastPurchase = purchases[0];
    if (lastPurchase) {
      const days = daysBetween(lastPurchase.date, today);
      const laterAppointment = appointments.some(
        ({ appointment, date }) =>
          date > lastPurchase.date &&
          ["scheduled", "confirmed", "completed"].includes(appointment.status),
      );
      const laterPlan = plans.some(
        (plan) => clinicDate(plan.createdAt) > lastPurchase.date,
      );
      if (
        days > settings.singleNoReturnDays &&
        !laterAppointment &&
        !laterPlan
      ) {
        add(
          "single_no_return",
          lastPurchase.id,
          `Última compra há ${plural(days, "dia", "dias")} (${shortDate(lastPurchase.date)})`,
          dayNumber(lastPurchase.date),
          lastPurchase.date,
        );
      }
    }

    // plan_expiring
    const expiring = plans
      .filter(
        (plan) =>
          plan.status === "active" &&
          plan.validUntil &&
          !plan.autoRenew &&
          !plan.renewedByPlanId &&
          daysBetween(today, plan.validUntil) <= settings.planExpiringDays,
      )
      .sort((a, b) => a.validUntil!.localeCompare(b.validUntil!))[0];
    if (expiring) {
      const days = daysBetween(today, expiring.validUntil!);
      add(
        "plan_expiring",
        expiring.id,
        days < 0
          ? `${expiring.name} venceu em ${shortDate(expiring.validUntil!)}`
          : days === 0
            ? `${expiring.name} termina hoje`
            : `${expiring.name} termina em ${plural(days, "dia", "dias")} (${shortDate(expiring.validUntil!)})`,
        dayNumber(expiring.validUntil!),
        expiring.validUntil!,
      );
    }

    // low_balance (serviço avulso fica de fora: sempre tem saldo baixo; o recorrente
    // não tem saldo que acaba, renova pela frequência semanal)
    const lowBalances = plans
      .flatMap((plan) =>
        plan.services.map((service) => ({
          ...plan,
          referenceKey:
            plan.services.length === 1
              ? plan.id
              : `${plan.id}:${service.serviceId}`,
          remainingSessions: service.remainingSessions,
          name: `${plan.name} · ${service.serviceName}`,
        })),
      )
      .filter(
        (plan) =>
          plan.status === "active" &&
          plan.kind !== "single" &&
          planHasSessionBalance(plan) &&
          !plan.renewedByPlanId &&
          plan.remainingSessions <= settings.lowBalanceSessions,
      )
      .sort((a, b) => a.remainingSessions - b.remainingSessions);
    for (const lowBalance of lowBalances) {
      add(
        "low_balance",
        lowBalance.referenceKey,
        `${lowBalance.name}: ${
          lowBalance.remainingSessions === 0
            ? "nenhuma sessão restante"
            : plural(
                lowBalance.remainingSessions,
                "sessão restante",
                "sessões restantes",
              )
        }`,
        lowBalance.remainingSessions,
        lowBalance.validUntil ? lowBalance.validUntil : undefined,
      );
    }

    // expired_with_balance
    const expired = plans
      .filter(
        (plan) =>
          plan.status === "expired" &&
          planHasSessionBalance(plan) &&
          plan.remainingSessions > 0 &&
          !plan.renewedByPlanId &&
          plan.validUntil &&
          daysBetween(plan.validUntil, today) >= 0 &&
          daysBetween(plan.validUntil, today) <=
            settings.expiredWithBalanceDays,
      )
      .sort((a, b) => a.validUntil!.localeCompare(b.validUntil!))[0];
    if (expired) {
      add(
        "expired_with_balance",
        expired.id,
        `${expired.name} venceu em ${shortDate(expired.validUntil!)} com ${plural(
          expired.remainingSessions,
          "sessão",
          "sessões",
        )}`,
        dayNumber(expired.validUntil!),
        expired.validUntil!,
      );
    }

    // treatment_paused
    const lastCompleted = appointments
      .filter(({ appointment }) => appointment.status === "completed")
      .sort((a, b) =>
        b.appointment.startsAt.localeCompare(a.appointment.startsAt),
      )[0];
    if (lastCompleted) {
      const days = daysBetween(lastCompleted.date, today);
      const hasFuture = appointments.some(
        ({ appointment, date }) =>
          date >= today &&
          (appointment.status === "scheduled" ||
            appointment.status === "confirmed"),
      );
      if (days > settings.treatmentPausedDays && !hasFuture) {
        add(
          "treatment_paused",
          lastCompleted.appointment.id,
          `Último atendimento há ${plural(days, "dia", "dias")} (${shortDate(lastCompleted.date)})`,
          dayNumber(lastCompleted.date),
          lastCompleted.date,
        );
      }
    }

    // repeated_no_show
    const noShows = appointments
      .filter(
        ({ appointment, date }) =>
          appointment.status === "no_show" &&
          daysBetween(date, today) >= 0 &&
          daysBetween(date, today) <= settings.repeatedNoShowWindowDays,
      )
      .sort((a, b) =>
        b.appointment.startsAt.localeCompare(a.appointment.startsAt),
      );
    const latestNoShow = noShows[0];
    if (latestNoShow && noShows.length >= settings.repeatedNoShowCount) {
      add(
        "repeated_no_show",
        latestNoShow.appointment.id,
        `${noShows.length} faltas nos últimos ${settings.repeatedNoShowWindowDays} dias`,
        -noShows.length,
        latestNoShow.date,
      );
    }

    // former_client
    if (!plans.some((plan) => plan.status === "active")) {
      const former = plans
        .filter((plan) => plan.status === "cancelled" && plan.cancelledAt)
        .map((plan) => ({ plan, date: clinicDate(plan.cancelledAt!) }))
        .filter(({ date }) => {
          const days = daysBetween(date, today);
          return (
            days >= settings.formerClientMinDays &&
            days <= settings.formerClientMaxDays
          );
        })
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (former) {
        add(
          "former_client",
          former.plan.id,
          `${former.plan.name} cancelado há ${plural(
            daysBetween(former.date, today),
            "dia",
            "dias",
          )} (${shortDate(former.date)})`,
          dayNumber(former.date),
          former.date,
        );
      }
    }

    // nps_detractor: uma entrada por cliente, referente à pesquisa
    // detratora mais recente da janela.
    const detractor = (data.surveys ?? [])
      .filter(
        (survey) =>
          survey.patientId === patient.id &&
          survey.score <= npsDetractorMaxScore,
      )
      .map((survey) => ({ survey, date: clinicDate(survey.createdAt) }))
      .filter(({ date }) => {
        const days = daysBetween(date, today);
        return days >= 0 && days <= npsDetractorWindowDays;
      })
      .sort((a, b) => b.survey.createdAt.localeCompare(a.survey.createdAt))[0];
    if (detractor) {
      add(
        "nps_detractor",
        detractor.survey.id,
        `Avaliou com nota ${detractor.survey.score} em ${shortDate(detractor.date)}`,
        detractor.survey.score,
        detractor.date,
      );
    }

    // overdue_payment — mesma regra da etiqueta automática "Pagamento atrasado".
    if (modules.includes("finance")) {
      const overdue = data.receivables
        .filter(
          (receivable) =>
            receivable.patientId === patient.id &&
            isOverdueReceivable(receivable, today),
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const oldest = overdue[0];
      if (oldest) {
        add(
          "overdue_payment",
          oldest.id,
          `${plural(overdue.length, "parcela em atraso", "parcelas em atraso")} desde ${shortDate(oldest.dueDate)}`,
          dayNumber(oldest.dueDate),
          oldest.dueDate,
        );
      }
    }
  }

  const hidden = (suggestion: ContactSuggestion) =>
    data.activities.some(
      (activity) =>
        activity.patientId === suggestion.patientId &&
        activity.reason === suggestion.reason &&
        activity.referenceKey === suggestion.referenceKey &&
        (activity.outcome !== "snoozed" ||
          (activity.snoozeUntil !== undefined &&
            activity.snoozeUntil >= today)),
    );

  return candidates
    .filter(({ suggestion }) => !hidden(suggestion))
    .sort(
      (a, b) =>
        a.suggestion.priority - b.suggestion.priority ||
        a.sortKey - b.sortKey ||
        a.suggestion.patientName.localeCompare(
          b.suggestion.patientName,
          "pt-BR",
        ),
    )
    .map(({ suggestion }) => suggestion);
}

/**
 * Aniversariantes ativos do mês `aaaa-mm`, com o mesmo critério de data da
 * sugestão `birthday` (29/02 vira 28/02 em ano não bissexto).
 */
export function buildBirthdayEntries(
  patients: Patient[],
  activities: ContactActivity[],
  month: string,
): BirthdayEntry[] {
  const year = Number(month.slice(0, 4));
  const entries: BirthdayEntry[] = [];
  for (const patient of patients) {
    if (patient.status !== "active" || !patient.birthDate) continue;
    const date = birthdayIn(year, patient.birthDate);
    if (date.slice(0, 7) !== month) continue;
    const referenceKey = `${patient.id}:${year}`;
    entries.push({
      patientId: patient.id,
      patientName: patient.fullName,
      phone: patient.phone,
      whatsapp: patient.whatsapp ? patient.whatsapp : undefined,
      birthDate: patient.birthDate,
      date,
      day: Number(date.slice(8, 10)),
      ageTurning: year - Number(patient.birthDate.slice(0, 4)),
      referenceKey,
      congratulated: activities.some(
        (activity) =>
          activity.patientId === patient.id &&
          activity.reason === "birthday" &&
          activity.referenceKey === referenceKey &&
          activity.outcome === "contacted",
      ),
    });
  }
  return entries.sort(
    (a, b) =>
      a.day - b.day || a.patientName.localeCompare(b.patientName, "pt-BR"),
  );
}
