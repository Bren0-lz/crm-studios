import { describe, expect, it } from "vitest";
import { groupOperationRange } from "../../shared/lib/formatting";
import {
  calendarMonthDays,
  groupCalendarRange,
  shiftIsoDate,
  shiftMonth,
} from "./model";

describe("group sessions calendar dates", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", -13)).toBe("2025-09");
    expect(shiftIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftIsoDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("builds full weeks from Monday to Sunday", () => {
    const october = calendarMonthDays("2026-10");
    expect(october[0]).toBe("2026-09-28");
    expect(october.at(-1)).toBe("2026-11-01");
    expect(october).toHaveLength(35);
    const january = calendarMonthDays("2027-01");
    expect(january[0]).toBe("2026-12-28");
    expect(january.at(-1)).toBe("2027-01-31");
    // Fevereiro de 2027 começa numa segunda e termina num domingo.
    expect(calendarMonthDays("2027-02")).toHaveLength(28);
  });

  it("queries the whole visible month together with the operating window", () => {
    const now = new Date("2026-10-18T15:00:00Z");
    const operation = groupOperationRange(now);
    expect(groupCalendarRange("2026-10", now)).toEqual(operation);
    expect(groupCalendarRange("2026-07", now)).toEqual({
      from: "2026-06-28T00:00:00.000Z",
      to: operation.to,
    });
    expect(groupCalendarRange("2027-06", now)).toEqual({
      from: operation.from,
      to: "2027-07-06T00:00:00.000Z",
    });
  });
});
