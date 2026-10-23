import {
  agendaNoteOccurrenceDates,
  type AgendaNoteInput,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { localParts, zonedTimeToUtc } from "../groups/group-schedule.js";

export function noteOccurrences(input: AgendaNoteInput, timezone: string) {
  try {
    const dates = agendaNoteOccurrenceDates(input, timezone);
    const time = localParts(new Date(input.startsAt), timezone).time;
    const duration = Date.parse(input.endsAt) - Date.parse(input.startsAt);
    return dates.map((date, index) => {
      const startsAt =
        index === 0
          ? new Date(input.startsAt)
          : zonedTimeToUtc(date, time, timezone);
      return {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + duration).toISOString(),
      };
    });
  } catch (cause) {
    throw new DomainError(
      "INVALID_NOTE_RECURRENCE",
      (cause as Error).message,
      400,
    );
  }
}
