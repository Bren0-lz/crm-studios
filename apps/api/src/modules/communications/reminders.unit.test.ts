import { describe, expect, it } from "vitest";
import { buildReminderCandidates } from "./reminders.js";

describe("reminder messages", () => {
  it("greets the client by the first name in every generated reminder", () => {
    const patient = {
      id: "p1",
      fullName: "  Viviane   Araújo Lima ",
      phone: "11999999999",
      birthDate: "1990-10-17",
      status: "active",
    };
    const candidates = buildReminderCandidates(
      [patient],
      [
        {
          id: "a1",
          patientId: "p1",
          startsAt: "2026-10-17T13:00:00.000Z",
          status: "scheduled",
        },
        {
          id: "a2",
          patientId: "p1",
          startsAt: "2026-10-17T11:00:00.000Z",
          status: "completed",
        },
      ],
      [{ id: "r1", patientId: "p1", dueDate: "2026-10-10", status: "open" }],
      [],
      "2026-10-17",
      "America/Sao_Paulo",
      { satisfaction: true, birthdays: true },
    );
    expect(candidates.map((item) => item.kind).sort()).toEqual([
      "appointment_reminder",
      "birthday_reminder",
      "payment_reminder",
      "satisfaction_followup",
    ]);
    for (const candidate of candidates) {
      expect(candidate.body).toMatch(/^Olá, Viviane\. /);
      expect(candidate.body).not.toContain("Araújo");
    }
  });
});
