import { describe, expect, it } from "vitest";
import { packageScheduleStarts } from "./model.js";

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
