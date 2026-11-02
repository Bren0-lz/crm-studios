import {
  packageScheduleStarts,
  type PackageWeeklySlot,
  type PatientPlanInput,
} from "@crm/contracts";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

/** Máximo de horários de uma contratação (mesmo limite da API). */
export const planScheduleMaxSessions = 120;

const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

/** Dias fixos de um serviço do plano: profissional, sala, 1º dia e os dias/horários da semana. */
export interface ServiceScheduleConfig {
  professionalId: string;
  roomId: string;
  fromDate: string;
  slots: PackageWeeklySlot[];
}

/** Sessão planejada antes de confirmar a contratação; `local` = "AAAA-MM-DDTHH:MM". */
export interface PlannedSession {
  key: string;
  serviceId: string;
  number: number;
  professionalId: string;
  roomId: string;
  local: string;
  exception: boolean;
}

/** Exceção de uma sessão: outro dia/horário (e, se preciso, outro profissional ou sala). */
export type SessionException = Pick<
  PlannedSession,
  "local" | "professionalId" | "roomId"
>;

/**
 * Sessões de cada serviço que a contratação agenda: plano avulso ou pacote fixo (com saldo de
 * sessões). Recorrente e personalizado não têm agenda gerada aqui.
 */
export function planScheduledSessionCounts(
  plan: Pick<PatientPlanInput, "kind" | "services">,
): Record<string, number> | undefined {
  if (plan.kind !== "single" && plan.kind !== "fixed_package") return undefined;
  const counts: Record<string, number> = {};
  for (const item of plan.services)
    if (item.serviceId)
      counts[item.serviceId] =
        (counts[item.serviceId] ?? 0) + item.totalSessions;
  return Object.keys(counts).length ? counts : undefined;
}

/** Chave de uma sessão: serviço + posição, estável enquanto os dias fixos não mudarem. */
export function plannedSessionKey(serviceId: string, index: number) {
  return `${serviceId}:${index}`;
}

/**
 * Exatamente `count` sessões de um serviço nos dias fixos, com as exceções aplicadas só na
 * sessão alterada. Sem profissional, sala ou dia fixo, o serviço ainda não tem sessões.
 */
export function plannedServiceSessions(
  serviceId: string,
  count: number,
  config: ServiceScheduleConfig | undefined,
  exceptions: Record<string, SessionException>,
): PlannedSession[] {
  if (!config?.professionalId || !config.roomId || !config.fromDate) return [];
  return packageScheduleStarts({
    fromDate: config.fromDate,
    slots: config.slots,
    count,
  }).map((local, index) => {
    const key = plannedSessionKey(serviceId, index);
    const exception = exceptions[key];
    return {
      key,
      serviceId,
      number: index + 1,
      professionalId: exception?.professionalId ?? config.professionalId,
      roomId: exception?.roomId ?? config.roomId,
      local: exception?.local ?? local,
      exception: Boolean(exception),
    };
  });
}

/** "ter., 04 de nov. · 14:00" de um horário local "AAAA-MM-DDTHH:MM" ou ISO. */
export function sessionDateLabel(value: string) {
  const date = new Date(value);
  return `${weekdayShort.format(date)}, ${shortDate.format(date)} · ${timeLabel.format(date)}`;
}

/** Mensagem do WhatsApp com todas as sessões agendadas na contratação. */
export function planScheduleMessage({
  patientName,
  planName,
  sessions,
}: {
  patientName: string;
  planName: string;
  sessions: { startsAt: string; serviceName?: string | undefined }[];
}) {
  const sorted = [...sessions].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const firstName = patientName.trim().split(/\s+/)[0] ?? patientName;
  return [
    `Olá, ${firstName}! Estas são as sessões do seu plano *${planName}*:`,
    "",
    ...sorted.map(
      (session, index) =>
        `${index + 1}. ${sessionDateLabel(session.startsAt)}${session.serviceName ? ` · ${session.serviceName}` : ""}`,
    ),
    "",
    "Se precisar remarcar alguma, é só nos avisar.",
  ].join("\n");
}
