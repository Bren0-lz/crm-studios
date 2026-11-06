import { describe, expect, it } from "vitest";
import type { Appointment, Branch, Patient } from "@crm/contracts";
import {
  detectAutoCampaignEvents,
  type AutoCampaignSourceData,
} from "./auto-campaigns.js";

const branch = (id: string, street: string): Branch => ({
  id,
  clinicId: "clinic",
  name: id,
  active: true,
  isDefault: false,
  street,
  number: "10",
  city: "Campinas",
});
const data: AutoCampaignSourceData = {
  patients: [{ id: "patient", fullName: "Ana", status: "active" } as Patient],
  appointments: ["north", "south", "missing"].map(
    (branchId) =>
      ({
        id: branchId,
        patientId: "patient",
        branchId,
        startsAt: "2039-06-10T15:00:00Z",
        status: "scheduled",
        serviceName: "Pilates",
      }) as Appointment,
  ),
  plans: [],
  receivables: [],
  tabs: [],
  surveys: [],
  preferences: [],
  branches: [branch("north", "Rua Norte"), branch("south", "Rua Sul")],
};

describe("appointment branch location", () => {
  it("uses each appointment branch without falling back to another unit", () => {
    const events = detectAutoCampaignEvents(
      "appointment_upcoming",
      data,
      "2039-06-10",
      "America/Sao_Paulo",
    );
    expect(events.map((event) => event.vars.endereco)).toEqual([
      "Rua Norte, 10 · Campinas",
      "Rua Sul, 10 · Campinas",
      "",
    ]);
    expect(events[2]!.vars.link_mapa).toBe("");
  });
});
