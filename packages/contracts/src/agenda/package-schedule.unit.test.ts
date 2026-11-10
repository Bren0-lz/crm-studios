import { describe, expect, it } from "vitest";
import {
  agendaConflict,
  agendaConflictCheckInputSchema,
  packageScheduleStarts,
} from "./model.js";

describe("package schedule with fixed weekdays", () => {
  it("repeats the weekly days and times until the package ends", () => {
    // 2026-11-02 é segunda-feira.
    expect(
      packageScheduleStarts({
        fromDate: "2026-11-02",
        slots: [
          { weekday: 3, time: "18:00" },
          { weekday: 1, time: "09:00" },
        ],
        count: 5,
      }),
    ).toEqual([
      "2026-11-02T09:00",
      "2026-11-04T18:00",
      "2026-11-09T09:00",
      "2026-11-11T18:00",
      "2026-11-16T09:00",
    ]);
  });

  it("starts on the first fixed day after the start date", () => {
    expect(
      packageScheduleStarts({
        fromDate: "2026-11-03",
        slots: [{ weekday: 1, time: "09:00" }],
        count: 2,
      }),
    ).toEqual(["2026-11-09T09:00", "2026-11-16T09:00"]);
  });

  it("orders two times on the same day and ignores repeated or invalid slots", () => {
    expect(
      packageScheduleStarts({
        fromDate: "2026-11-02",
        slots: [
          { weekday: 1, time: "17:00" },
          { weekday: 1, time: "08:00" },
          { weekday: 1, time: "08:00" },
          { weekday: 9, time: "10:00" },
          { weekday: 2, time: "" },
        ],
        count: 3,
      }),
    ).toEqual(["2026-11-02T08:00", "2026-11-02T17:00", "2026-11-09T08:00"]);
  });

  it("returns nothing without valid slots", () => {
    expect(
      packageScheduleStarts({ fromDate: "2026-11-02", slots: [], count: 10 }),
    ).toEqual([]);
  });
});

describe("agenda conflict check input", () => {
  const item = {
    key: "s1",
    professionalId: "8f14e45f-ceea-4e7a-9c3b-1a2b3c4d5e6f",
    roomId: "c9f0f895-fb98-4b91-8b3c-2a3b4c5d6e7f",
    serviceId: "45c48cce-2e2d-4fbd-8a5b-3b4c5d6e7f80",
    startsAt: "2026-11-10T17:00:00.000Z",
  };

  it("accepts up to 120 planned times and refuses an empty list", () => {
    expect(
      agendaConflictCheckInputSchema.safeParse({ items: [item] }).success,
    ).toBe(true);
    expect(
      agendaConflictCheckInputSchema.safeParse({ items: [] }).success,
    ).toBe(false);
    expect(
      agendaConflictCheckInputSchema.safeParse({
        items: Array.from({ length: 121 }, (_, index) => ({
          ...item,
          key: String(index),
        })),
      }).success,
    ).toBe(false);
  });

  it("labels each conflict kind", () => {
    expect(agendaConflict("s1", "block")).toEqual({
      key: "s1",
      kind: "block",
      label: "Horário bloqueado",
    });
    expect(agendaConflict("s2", "holiday", "Feriado: Natal").label).toBe(
      "Feriado: Natal",
    );
  });
});
