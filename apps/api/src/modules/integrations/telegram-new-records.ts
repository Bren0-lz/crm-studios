import type {
  AppointmentsCreatedEvent,
  CreatedAppointmentSummary,
  PatientCreatedEvent,
  PatientsImportedEvent,
} from "../../infrastructure/domain-events.js";
import type { ClinicRepository } from "../../repository.js";
import { DEFAULT_CLINIC_TIMEZONE } from "../finance/daily-cash.js";
import type { TelegramService } from "./telegram.js";

type Repository = Pick<ClinicRepository, "findUserById" | "getClinicSettings">;

const WEEKDAYS_PLURAL = [
  "domingos",
  "segundas",
  "terças",
  "quartas",
  "quintas",
  "sextas",
  "sábados",
];
/** Acima disso, o resumo da recorrência fica só com total e período. */
const MAX_WEEKLY_SLOTS = 4;

function joinPtBr(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

function clinicClock(timeZone: string) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const weekdayIndex = (value: Date) =>
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      weekday.format(value),
    );
  return {
    date: (value: Date) => date.format(value),
    time: (value: Date) => time.format(value),
    weekdayIndex,
  };
}

type Clock = ReturnType<typeof clinicClock>;

/** "10/11/2026 às 09:00" ou "8 sessões, de 10/11/2026 a 29/12/2026, segundas e quartas às 09:00". */
function describeSessions(starts: Date[], clock: Clock) {
  const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0]!;
  if (sorted.length === 1)
    return `${clock.date(first)} às ${clock.time(first)}`;
  const last = sorted.at(-1)!;
  const slots = new Map<string, { weekday: number; time: string }>();
  for (const start of sorted) {
    const weekday = clock.weekdayIndex(start);
    const time = clock.time(start);
    slots.set(`${weekday}|${time}`, { weekday, time });
  }
  const ordered = [...slots.values()].sort(
    (a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time),
  );
  const times = new Set(ordered.map((slot) => slot.time));
  const weekdays = new Set(ordered.map((slot) => slot.weekday));
  let pattern = "";
  if (times.size === 1 && weekdays.size === ordered.length)
    pattern = `, ${joinPtBr(ordered.map((slot) => WEEKDAYS_PLURAL[slot.weekday]!))} às ${ordered[0]!.time}`;
  else if (ordered.length <= MAX_WEEKLY_SLOTS)
    pattern = `, ${joinPtBr(ordered.map((slot) => `${WEEKDAYS_PLURAL[slot.weekday]} às ${slot.time}`))}`;
  const period =
    clock.date(first) === clock.date(last)
      ? `em ${clock.date(first)}`
      : `de ${clock.date(first)} a ${clock.date(last)}`;
  return `${sorted.length} sessões, ${period}${pattern}`;
}

/**
 * Texto do aviso de agendamento: uma mensagem por operação. As sessões do mesmo cliente,
 * serviço e profissional viram uma linha de resumo (recorrência, plano com várias sessões).
 */
export function formatAppointmentsCreatedMessage(
  appointments: CreatedAppointmentSummary[],
  actorName: string | undefined,
  timeZone: string,
) {
  const clock = clinicClock(timeZone);
  const groups = new Map<
    string,
    { item: CreatedAppointmentSummary; starts: Date[] }
  >();
  for (const item of appointments) {
    const key = JSON.stringify([
      item.patientName,
      item.lead,
      item.serviceName,
      item.professionalName,
    ]);
    const group = groups.get(key) ?? { item, starts: [] };
    group.starts.push(new Date(item.startsAt));
    groups.set(key, group);
  }
  const lines = [...groups.values()].map(
    ({ item, starts }) =>
      `${item.patientName}${item.lead ? " (lead)" : ""} · ${item.serviceName} · com ${item.professionalName} · ${describeSessions(starts, clock)}`,
  );
  const title =
    appointments.length > 1 ? "Novos agendamentos" : "Novo agendamento";
  const header = `${title}${actorName ? ` por ${actorName}` : ""}:`;
  return lines.length === 1
    ? `${header} ${lines[0]}`
    : [header, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function formatPatientCreatedMessage(
  event: Pick<PatientCreatedEvent, "fullName" | "origin">,
  actorName: string | undefined,
) {
  return `Cliente novo: ${event.fullName}${event.origin === "lead" ? " (convertido de lead)" : ""}${actorName ? ` · cadastrado por ${actorName}` : ""}`;
}

export function formatPatientsImportedMessage(
  created: number,
  actorName: string | undefined,
) {
  const count = created === 1 ? "1 cliente novo" : `${created} clientes novos`;
  return `Importação de clientes: ${count}${actorName ? ` · importados por ${actorName}` : ""}`;
}

async function actorName(
  repository: Repository,
  clinicId: string,
  userId: string,
) {
  return (await repository.findUserById(clinicId, userId))?.fullName;
}

/** Consumidor de `appointments.created`: só roda depois do commit da criação. */
export function createAppointmentsCreatedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Repository;
  telegram: TelegramService;
}) {
  return async (event: AppointmentsCreatedEvent) => {
    if (!telegram.enabled || event.appointments.length === 0) return;
    const [actor, settings] = await Promise.all([
      actorName(repository, event.clinicId, event.actorUserId),
      repository.getClinicSettings(event.clinicId),
    ]);
    await telegram.notifyLinkedChats(
      event.clinicId,
      formatAppointmentsCreatedMessage(
        event.appointments,
        actor,
        settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
      ),
    );
  };
}

/** Consumidor de `patient.created`: só roda depois do commit do cadastro. */
export function createPatientCreatedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Repository;
  telegram: TelegramService;
}) {
  return async (event: PatientCreatedEvent) => {
    if (!telegram.enabled) return;
    await telegram.notifyLinkedChats(
      event.clinicId,
      formatPatientCreatedMessage(
        event,
        await actorName(repository, event.clinicId, event.actorUserId),
      ),
    );
  };
}

/** Consumidor de `patients.imported`: um aviso com o total da importação. */
export function createPatientsImportedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Repository;
  telegram: TelegramService;
}) {
  return async (event: PatientsImportedEvent) => {
    if (!telegram.enabled || event.created === 0) return;
    await telegram.notifyLinkedChats(
      event.clinicId,
      formatPatientsImportedMessage(
        event.created,
        await actorName(repository, event.clinicId, event.actorUserId),
      ),
    );
  };
}
