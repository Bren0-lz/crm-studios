import type {
  ClinicalAppointmentOption,
  ClinicalMeasurement,
  ClinicalRecord,
} from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  buildPatientSummaries,
  filterPatientSummaries,
  goalProgress,
  measurementSeries,
  patientAge,
} from "./model";

const ana = { id: "a", fullName: "Ana Gomes", tags: [] };
const bia = { id: "b", fullName: "Bia Lima", tags: [] };
const caio = { id: "c", fullName: "Caio Souza", tags: [] };

const appointment = (
  id: string,
  patientId: string,
  startsAt: string,
): ClinicalAppointmentOption => ({
  id,
  patientId,
  startsAt,
  patientName: "",
  professionalName: "Dra. Ana",
  status: "completed",
});

describe("clinical chart model", () => {
  it("summarizes pending sessions and drafts per client, most recent activity first", () => {
    const records = [
      {
        id: "r1",
        appointmentId: "s1",
        patientId: ana.id,
        status: "draft",
        appointmentStartsAt: "2026-10-10T12:00:00Z",
      },
    ] as ClinicalRecord[];
    const summaries = buildPatientSummaries([caio, bia, ana], records, [
      appointment("s1", ana.id, "2026-10-10T12:00:00Z"),
      appointment("s2", bia.id, "2026-10-20T12:00:00Z"),
    ]);
    const byId = Object.fromEntries(
      summaries.map((item) => [item.patient.id, item]),
    );
    expect(byId.a).toMatchObject({ records: 1, drafts: 1, pending: [] });
    expect(byId.b?.pending.map((item) => item.id)).toEqual(["s2"]);
    expect(byId.c).not.toHaveProperty("lastActivityAt");

    expect(
      filterPatientSummaries(summaries, "", "all").map(
        (item) => item.patient.id,
      ),
    ).toEqual(["b", "a", "c"]);
    expect(
      filterPatientSummaries(summaries, "", "pending").map(
        (item) => item.patient.id,
      ),
    ).toEqual(["b"]);
    expect(
      filterPatientSummaries(summaries, "", "drafts").map(
        (item) => item.patient.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterPatientSummaries(summaries, "souza", "all").map(
        (item) => item.patient.id,
      ),
    ).toEqual(["c"]);
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
