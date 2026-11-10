import type { ClinicalMeasurement } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  filterClinicalPatients,
  goalProgress,
  measurementSeries,
  patientAge,
} from "./model";

const ana = { id: "a", fullName: "Ana Gomes", tags: [] };
const bia = { id: "b", fullName: "Bia Lima", tags: [] };
const caio = { id: "c", fullName: "Caio Souza", tags: [] };

describe("clinical chart model", () => {
  it("lists clients alphabetically and searches by name without accents", () => {
    expect(
      filterClinicalPatients([caio, bia, ana], "").map((item) => item.id),
    ).toEqual(["a", "b", "c"]);
    expect(
      filterClinicalPatients([caio, bia, ana], "SOUZA").map((item) => item.id),
    ).toEqual(["c"]);
    expect(
      filterClinicalPatients(
        [{ id: "d", fullName: "Débora Lú", tags: [] }],
        "debora lu",
      ),
    ).toHaveLength(1);
  });

  it("measures goal progress whether the target goes up or down", () => {
    expect(goalProgress({ baselineValue: 90, targetValue: 130 }, 110)).toBe(50);
    expect(goalProgress({ baselineValue: 8, targetValue: 2 }, 5)).toBe(50);
    expect(goalProgress({ baselineValue: 8, targetValue: 2 }, 0)).toBe(100);
    expect(goalProgress({ targetValue: 2 }, 5)).toBeUndefined();
  });

  it("groups measurements by name and unit in chronological order", () => {
    const measurement = (
      id: string,
      name: string,
      value: number,
      measuredAt: string,
    ) =>
      ({ id, name, value, unit: "graus", measuredAt }) as ClinicalMeasurement;
    const series = measurementSeries([
      measurement("m2", "Flexão", 110, "2026-10-20T12:00:00Z"),
      measurement("m1", "flexão", 90, "2026-10-01T12:00:00Z"),
      measurement("m3", "Extensão", 0, "2026-10-01T12:00:00Z"),
    ]);
    expect(series).toHaveLength(2);
    expect(series[0]?.points.map((item) => item.value)).toEqual([90, 110]);
  });

  it("computes the age from the birth date", () => {
    const now = new Date("2026-10-23T12:00:00");
    expect(patientAge("1990-10-23", now)).toBe(36);
    expect(patientAge("1990-10-24", now)).toBe(35);
    expect(patientAge(undefined, now)).toBeUndefined();
  });
});
