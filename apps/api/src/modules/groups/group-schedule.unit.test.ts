import { describe, expect, it } from "vitest";
import {
  findWeeklyScheduleConflicts,
  intervalHitsSlots,
  localParts,
  weeklyOccurrences,
  zonedTimeToUtc,
} from "./group-schedule.js";

const timezone = "America/Sao_Paulo";
const slots = [
  { weekday: 2, startTime: "18:00", endTime: "19:00" },
  { weekday: 4, startTime: "08:00", endTime: "09:30" },
];

describe("group schedule", () => {
  it("converts clinic local time to UTC and back", () => {
    const instant = zonedTimeToUtc("2026-09-22", "18:00", timezone);
    expect(instant.toISOString()).toBe("2026-09-22T21:00:00.000Z");
    expect(localParts(instant, timezone)).toEqual({
      date: "2026-09-22",
      weekday: 2,
      time: "18:00",
    });
    expect(
      zonedTimeToUtc("2026-01-10", "07:30", "Europe/Lisbon").toISOString(),
    ).toBe("2026-01-10T07:30:00.000Z");
    expect(
      zonedTimeToUtc("2026-07-10", "07:30", "Europe/Lisbon").toISOString(),
    ).toBe("2026-07-10T06:30:00.000Z");
  });

  it("lists weekly occurrences after a moment and up to a limit", () => {
    const after = zonedTimeToUtc("2026-09-22", "18:30", timezone);
    const until = zonedTimeToUtc("2026-09-29", "18:00", timezone);
    expect(
      weeklyOccurrences(slots, timezone, after, until).map((item) => [
        item.startsAt.toISOString(),
        item.endsAt.toISOString(),
      ]),
    ).toEqual([
      ["2026-09-24T11:00:00.000Z", "2026-09-24T12:30:00.000Z"],
      ["2026-09-29T21:00:00.000Z", "2026-09-29T22:00:00.000Z"],
    ]);
    expect(weeklyOccurrences([], timezone, after, until)).toEqual([]);
  });

  it("detects intervals that overlap a weekly slot in the clinic timezone", () => {
    const tuesday = (time: string) =>
      zonedTimeToUtc("2026-10-06", time, timezone);
    expect(
      intervalHitsSlots(slots, timezone, tuesday("18:30"), tuesday("19:20")),
    ).toBeDefined();
    expect(
      intervalHitsSlots(slots, timezone, tuesday("19:00"), tuesday("19:50")),
    ).toBeUndefined();
    expect(
      intervalHitsSlots(slots, timezone, tuesday("17:10"), tuesday("18:00")),
    ).toBeUndefined();
  });

  it("describes conflicts with appointments and other groups", () => {
    const conflicts = findWeeklyScheduleConflicts(
      slots,
      timezone,
      [
        {
          startsAt: zonedTimeToUtc("2026-10-08", "09:00", timezone),
          endsAt: zonedTimeToUtc("2026-10-08", "09:50", timezone),
          label: "Atendimento de Helena Almeida",
        },
        {
          startsAt: zonedTimeToUtc("2026-10-09", "09:00", timezone),
          endsAt: zonedTimeToUtc("2026-10-09", "09:50", timezone),
          label: "Atendimento livre",
        },
      ],
      [
        {
          slots: [{ weekday: 2, startTime: "18:30", endTime: "20:00" }],
          label: "Pilates Turma A",
        },
      ],
    );
    expect(conflicts).toEqual([
      "toda ter às 18:30 — Pilates Turma A",
      "qui 08/10 às 09:00 — Atendimento de Helena Almeida",
    ]);
  });
});
