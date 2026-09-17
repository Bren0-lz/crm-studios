import type { GroupWeeklySlot } from "@crm/contracts";

// Encontros das turmas ficam reservados na agenda por este período e são estendidos
// sempre que a agenda ou as turmas são consultadas.
export const GROUP_SESSION_HORIZON_WEEKS = 12;
// Limite para a agenda não gerar encontros indefinidamente ao navegar para meses distantes.
export const GROUP_SESSION_MAX_WEEKS = 104;

const weekMs = 7 * 86_400_000;
const weekdayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function groupSessionHorizon(now = new Date()) {
  return new Date(now.getTime() + GROUP_SESSION_HORIZON_WEEKS * weekMs);
}

export function clampGroupSessionUntil(until: Date, now = new Date()) {
  const max = now.getTime() + GROUP_SESSION_MAX_WEEKS * weekMs;
  return new Date(Math.min(Math.max(until.getTime(), groupSessionHorizon(now).getTime()), max));
}

interface LocalParts {
  date: string;
  weekday: number;
  time: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string) {
  let item = formatters.get(timezone);
  if (!item) {
    item = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timezone, item);
  }
  return item;
}

function zonedFields(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatter(timezone).formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function localParts(instant: Date, timezone: string): LocalParts {
  const f = zonedFields(instant, timezone);
  const date = `${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`;
  return {
    date,
    weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
    time: `${String(f.hour).padStart(2, "0")}:${String(f.minute).padStart(2, "0")}`,
  };
}

function offsetMs(instant: Date, timezone: string) {
  const f = zonedFields(instant, timezone);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

// Converte data e hora locais do fuso da clínica para um instante UTC.
export function zonedTimeToUtc(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClock = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let instant = new Date(wallClock - offsetMs(new Date(wallClock), timezone));
  const corrected = new Date(wallClock - offsetMs(instant, timezone));
  if (corrected.getTime() !== instant.getTime()) instant = corrected;
  return instant;
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

// Datas em que os horários fixos acontecem depois de `after` e começando até `until`.
export function weeklyOccurrences(
  slots: readonly GroupWeeklySlot[],
  timezone: string,
  after: Date,
  until: Date,
) {
  const occurrences: Array<{ startsAt: Date; endsAt: Date }> = [];
  if (slots.length === 0 || until <= after) return occurrences;
  const last = localParts(until, timezone).date;
  for (let date = localParts(after, timezone).date; date <= last; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      const startsAt = zonedTimeToUtc(date, slot.startTime, timezone);
      if (startsAt <= after || startsAt > until) continue;
      occurrences.push({ startsAt, endsAt: zonedTimeToUtc(date, slot.endTime, timezone) });
    }
  }
  return occurrences.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
  label: string;
}

export interface WeeklyPattern {
  slots: readonly GroupWeeklySlot[];
  label: string;
}

// Um intervalo ocupado bate com um horário fixo quando cai no mesmo dia da semana
// (no fuso da clínica) e as faixas de horário se sobrepõem.
export function intervalHitsSlots(
  slots: readonly GroupWeeklySlot[],
  timezone: string,
  startsAt: Date,
  endsAt: Date,
) {
  const start = localParts(startsAt, timezone);
  const end = localParts(endsAt, timezone);
  const endTime = end.date === start.date ? end.time : "24:00";
  return slots.find(
    (slot) => slot.weekday === start.weekday && slot.startTime < endTime && slot.endTime > start.time,
  );
}

export function findWeeklyScheduleConflicts(
  slots: readonly GroupWeeklySlot[],
  timezone: string,
  busy: readonly BusyInterval[],
  patterns: readonly WeeklyPattern[] = [],
) {
  const conflicts: string[] = [];
  const conflictingPatterns = new Set<string>();
  for (const pattern of patterns) {
    for (const slot of slots) {
      const other = pattern.slots.find(
        (candidate) =>
          candidate.weekday === slot.weekday &&
          candidate.startTime < slot.endTime &&
          candidate.endTime > slot.startTime,
      );
      if (!other) continue;
      conflictingPatterns.add(pattern.label);
      conflicts.push(`toda ${weekdayNames[slot.weekday]} às ${other.startTime} — ${pattern.label}`);
    }
  }
  for (const item of [...busy].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    // Encontros de uma turma cujo horário fixo já foi citado não precisam ser listados um a um.
    if (conflictingPatterns.has(item.label)) continue;
    if (!intervalHitsSlots(slots, timezone, item.startsAt, item.endsAt)) continue;
    const start = localParts(item.startsAt, timezone);
    const [, month, day] = start.date.split("-");
    conflicts.push(`${weekdayNames[start.weekday]} ${day}/${month} às ${start.time} — ${item.label}`);
  }
  return conflicts;
}

export function groupScheduleConflictMessage(conflicts: readonly string[]) {
  const shown = conflicts.slice(0, 5).join("; ");
  const extra = conflicts.length > 5 ? ` e mais ${conflicts.length - 5}` : "";
  return `Os horários da turma conflitam com a agenda do profissional ou da sala: ${shown}${extra}.`;
}
