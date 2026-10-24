import { describe, expect, it } from "vitest";
import {
  matchesPatientActivity,
  matchesPatientProfile,
  matchesPatientSegment,
  patientActivityFilterSchema,
  patientProfileFilterSchema,
  type PatientSegmentSummary,
} from "./segments.js";
import { clientDetailsFilterSchema } from "./report-details.js";

describe("client profile and segments", () => {
  const profile = {
    city: "São Paulo",
    neighborhood: "Centro",
    occupation: "Professora",
    level: "Intermediário",
    source: "Indicação",
    interests: ["Pilates"],
    gender: "female",
    email: "cliente@example.com",
  };

  it.each(["city", "neighborhood", "occupation", "level", "source"] as const)(
    "matches %s without case sensitivity and excludes missing or different values",
    (key) => {
      expect(
        matchesPatientProfile(profile, { [key]: profile[key].toUpperCase() }),
      ).toBe(true);
      expect(matchesPatientProfile(profile, { [key]: "inexistente" })).toBe(
        false,
      );
      expect(matchesPatientProfile({}, { [key]: profile[key] })).toBe(false);
    },
  );

  it("combines exact interests, gender and email availability", () => {
    expect(matchesPatientProfile({}, {})).toBe(true);
    expect(
      matchesPatientProfile(profile, {
        interest: "Pilates",
        gender: "female",
        record: "with_email",
      }),
    ).toBe(true);
    expect(matchesPatientProfile(profile, { interest: "Postura" })).toBe(false);
    expect(matchesPatientProfile({}, { interest: "Pilates" })).toBeFalsy();
    expect(matchesPatientProfile(profile, { gender: "male" })).toBe(false);
    expect(matchesPatientProfile(profile, { record: "without_email" })).toBe(
      false,
    );
    expect(matchesPatientProfile({}, { record: "without_email" })).toBe(true);
    expect(matchesPatientProfile({}, { record: "with_email" })).toBe(false);
    expect(
      patientProfileFilterSchema.parse({ city: "", segment: "", record: "" }),
    ).toMatchObject({ city: undefined, segment: undefined, record: undefined });
  });

  const summary: PatientSegmentSummary = {
    patientId: "client",
    activePlans: 1,
    renewalDue: true,
    availableReplacements: 2,
    waiting: 1,
    pendingReceivables: 1,
    overdueReceivables: 1,
  };
  it.each([
    "active_plan",
    "renewal",
    "replacement",
    "waiting",
    "pending",
    "overdue",
  ] as const)("selects %s only when the summary qualifies", (segment) => {
    expect(matchesPatientSegment(summary, segment)).toBe(true);
    expect(
      matchesPatientSegment(
        {
          patientId: "client",
          activePlans: 0,
          renewalDue: false,
          availableReplacements: 0,
          waiting: 0,
        },
        segment,
      ),
    ).toBe(false);
    expect(matchesPatientSegment(undefined, segment)).toBe(false);
  });
  it("does not require a summary without segmentation and distinguishes clients without plans", () => {
    expect(matchesPatientSegment(undefined, undefined)).toBe(true);
    expect(matchesPatientSegment(summary, "no_plan")).toBe(false);
    expect(
      matchesPatientSegment({ ...summary, activePlans: 0 }, "no_plan"),
    ).toBe(true);
  });

  it("filters by services, groups, professionals and visits from the summary", () => {
    const today = "2040-06-30";
    const active: PatientSegmentSummary = {
      ...summary,
      services: ["Pilates"],
      groups: ["Pilates manhã"],
      professionals: ["Marina"],
      lastVisitOn: "2040-06-10",
      nextAppointmentAt: "2040-07-02T13:00:00.000Z",
    };
    expect(matchesPatientActivity(undefined, {}, today)).toBe(true);
    expect(
      matchesPatientActivity(undefined, { service: "Pilates" }, today),
    ).toBe(false);
    expect(
      matchesPatientActivity(
        active,
        {
          service: "Pilates",
          group: "Pilates manhã",
          professional: "Marina",
          lastVisit: "last_30",
          nextAppointment: "scheduled",
        },
        today,
      ),
    ).toBe(true);
    expect(
      matchesPatientActivity(active, { service: "Depilação" }, today),
    ).toBe(false);
    expect(
      matchesPatientActivity(summary, { group: "Pilates manhã" }, today),
    ).toBe(false);
    expect(
      matchesPatientActivity(active, { lastVisit: "over_30" }, today),
    ).toBe(false);
    const old = { ...active, lastVisitOn: "2040-03-01" };
    expect(matchesPatientActivity(old, { lastVisit: "over_30" }, today)).toBe(
      true,
    );
    expect(matchesPatientActivity(old, { lastVisit: "over_90" }, today)).toBe(
      true,
    );
    expect(matchesPatientActivity(summary, { lastVisit: "never" }, today)).toBe(
      true,
    );
    expect(
      matchesPatientActivity(summary, { lastVisit: "over_90" }, today),
    ).toBe(false);
    expect(
      matchesPatientActivity(summary, { nextAppointment: "none" }, today),
    ).toBe(true);
    expect(
      patientActivityFilterSchema.parse({ service: "", lastVisit: "" }),
    ).toMatchObject({ service: undefined, lastVisit: undefined });
    expect(
      patientActivityFilterSchema.safeParse({ lastVisit: "yesterday" }).success,
    ).toBe(false);
  });

  it("validates report periods and requested columns before exporting", () => {
    const dates = { from: "2040-01-01", to: "2040-12-31" };
    expect(
      clientDetailsFilterSchema.parse({
        ...dates,
        columns: "fullName,attendanceRate",
      }).columns,
    ).toEqual(["fullName", "attendanceRate"]);
    expect(clientDetailsFilterSchema.safeParse(dates).success).toBe(true);
    expect(
      clientDetailsFilterSchema.safeParse({ ...dates, columns: "" }).success,
    ).toBe(false);
    expect(
      clientDetailsFilterSchema.safeParse({ ...dates, columns: "privateData" })
        .success,
    ).toBe(false);
    expect(
      clientDetailsFilterSchema.safeParse({ ...dates, to: "2039-12-31" })
        .success,
    ).toBe(false);
    expect(
      clientDetailsFilterSchema.safeParse({ ...dates, to: "2041-01-02" })
        .success,
    ).toBe(false);
  });
});
