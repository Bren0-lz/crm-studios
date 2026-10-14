import { describe, expect, it } from "vitest";
import {
  buildLeadInsights,
  leadFilterSchema,
  matchesLead,
} from "./insights.js";
import type { Lead } from "./types.js";

const lead: Lead = {
  id: "lead-1",
  clinicId: "clinic-1",
  fullName: "José da Silva",
  phone: "11988887777",
  email: "jose@example.com",
  tags: ["Indicação"],
  source: "Site",
  interest: "Pilates",
  interests: ["Postura"],
  contactMethod: "WhatsApp",
  responsibleUserId: "11111111-1111-4111-8111-111111111111",
  stage: "lost",
  lostReason: "Preço",
  createdAt: "2040-06-02T01:00:00Z",
  updatedAt: "2040-06-02T01:00:00Z",
  openTasks: 2,
  overdueTasks: 1,
  lastContactAt: "2040-06-01T23:00:00Z",
};

describe("commercial filters", () => {
  it("combines filters, searches accents and respects the clinic date", () => {
    expect(matchesLead(lead, {})).toBe(true);
    expect(
      matchesLead(lead, {
        search: "jose",
        source: "Site",
        interest: "Postura",
        contactMethod: "WhatsApp",
        lostReason: "Preço",
        stage: "lost",
        responsibleUserId: lead.responsibleUserId!,
        from: "2040-06-01",
        to: "2040-06-01",
        tasks: "overdue",
        contact: "with",
      }),
    ).toBe(true);
    expect(matchesLead(lead, { search: "indicacao" })).toBe(true);
    expect(matchesLead(lead, { interest: "Pilates" })).toBe(true);
    expect(matchesLead(lead, { from: "2040-06-02" })).toBe(false);
    expect(matchesLead(lead, { to: "2040-05-31" })).toBe(false);
    expect(matchesLead(lead, { from: "2040-06-02" }, "UTC")).toBe(true);
  });

  it.each([
    { search: "inexistente" },
    { source: "Outra" },
    { interest: "Dança" },
    { contactMethod: "Telefone" },
    { lostReason: "Horário" },
    { stage: "won" as const },
    { responsibleUserId: "outro" },
  ])("excludes a lead when a selected filter differs: %j", (filter) => {
    expect(matchesLead(lead, filter)).toBe(false);
  });

  it("distinguishes pending, overdue and absent tasks and recorded contacts", () => {
    const noWork = { ...lead, openTasks: 0, overdueTasks: 0 };
    delete noWork.lastContactAt;
    expect(matchesLead(lead, { tasks: "open" })).toBe(true);
    expect(matchesLead(lead, { tasks: "none" })).toBe(false);
    expect(matchesLead(noWork, { tasks: "none", contact: "without" })).toBe(
      true,
    );
    expect(matchesLead(noWork, { tasks: "open" })).toBe(false);
    expect(matchesLead(noWork, { tasks: "overdue" })).toBe(false);
    expect(matchesLead(noWork, { contact: "with" })).toBe(false);
    expect(matchesLead(lead, { contact: "without" })).toBe(false);
    const noInterests = { ...lead };
    delete noInterests.interests;
    expect(matchesLead(noInterests, { interest: "Postura" })).toBe(false);
  });

  it("accepts open date ranges and rejects an inverted range", () => {
    for (const filter of [
      {},
      { from: "2040-06-01" },
      { to: "2040-06-01" },
      { from: "2040-06-01", to: "2040-06-01" },
    ]) {
      expect(leadFilterSchema.safeParse(filter).success).toBe(true);
    }
    expect(
      leadFilterSchema.safeParse({ from: "2040-06-02", to: "2040-06-01" })
        .success,
    ).toBe(false);
  });
});

describe("commercial indicators", () => {
  it("returns zero counts and rates for an empty funnel", () => {
    expect(buildLeadInsights([])).toEqual({
      total: 0,
      open: 0,
      won: 0,
      lost: 0,
      conversionRate: 0,
      openTasks: 0,
      overdueTasks: 0,
      withoutContact: 0,
      sources: [],
      contactMethods: [],
      lostReasons: [],
    });
  });

  it("counts conversions, tasks and losses by origin and contact method", () => {
    const result = buildLeadInsights([
      { ...lead, stage: "won", source: "Indicação" },
      { ...lead, stage: "won", contactMethod: "E-mail" },
      { ...lead, contactMethod: "" },
      { ...lead, source: "", contactMethod: "", lostReason: "" },
      { ...lead, stage: "new_contact", lastContactAt: "" },
    ]);
    expect(result).toMatchObject({
      total: 5,
      open: 1,
      won: 2,
      lost: 2,
      conversionRate: 40,
      openTasks: 10,
      overdueTasks: 5,
      withoutContact: 1,
      lostReasons: [
        { name: "Preço", leads: 1 },
        { name: "Não informado", leads: 1 },
      ],
    });
    expect(result.sources.map((item) => item.name)).toEqual([
      "Site",
      "Indicação",
      "Não informado",
    ]);
    expect(result.sources[0]).toEqual({
      name: "Site",
      leads: 3,
      won: 1,
      lost: 1,
      conversionRate: 33,
    });
    expect(
      result.contactMethods.find((item) => item.name === "Não informado"),
    ).toMatchObject({ leads: 2, won: 0, lost: 2, conversionRate: 0 });
    expect(
      result.contactMethods.find((item) => item.name === "WhatsApp"),
    ).toMatchObject({ leads: 2, won: 1, lost: 0, conversionRate: 50 });
  });
});
