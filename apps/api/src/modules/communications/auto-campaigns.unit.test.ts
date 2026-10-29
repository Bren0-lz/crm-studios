import type { AutoCampaign, AutoCampaignStep, Patient } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  activeStep,
  buildAutoCampaignQueue,
  type AutoCampaignSourceData,
} from "./auto-campaigns.js";

const step = (offset: number): AutoCampaignStep => ({
  id: `00000000-0000-4000-8000-00000000000${offset % 10}`,
  offset,
  message: `Mensagem ${offset}`,
});

describe("activeStep", () => {
  const before = [step(7), step(2), step(1), step(0)];

  it("picks the closest step that has not passed for events ahead", () => {
    expect(activeStep("birthday", before, 8)).toBeUndefined();
    expect(activeStep("birthday", before, 7)?.offset).toBe(7);
    expect(activeStep("birthday", before, 5)?.offset).toBe(7);
    expect(activeStep("birthday", before, 2)?.offset).toBe(2);
    expect(activeStep("birthday", before, 1)?.offset).toBe(1);
    expect(activeStep("birthday", before, 0)?.offset).toBe(0);
    expect(activeStep("birthday", before, -1)).toBeUndefined();
  });

  it("picks the latest step reached for past events and expires the last one", () => {
    const after = [step(1), step(7), step(15)];
    expect(activeStep("overdue_payment", after, 0)).toBeUndefined();
    expect(activeStep("overdue_payment", after, 3)?.offset).toBe(1);
    expect(activeStep("overdue_payment", after, 7)?.offset).toBe(7);
    expect(activeStep("overdue_payment", after, 22)?.offset).toBe(15);
    expect(activeStep("overdue_payment", after, 23)).toBeUndefined();
  });

  it("uses remaining sessions for low balance", () => {
    const sessions = [step(2), step(0)];
    expect(activeStep("low_balance", sessions, 3)).toBeUndefined();
    expect(activeStep("low_balance", sessions, 2)?.offset).toBe(2);
    expect(activeStep("low_balance", sessions, 1)?.offset).toBe(2);
    expect(activeStep("low_balance", sessions, 0)?.offset).toBe(0);
  });
});

describe("buildAutoCampaignQueue", () => {
  const patient = (
    id: string,
    fullName: string,
    birthDate: string,
    phone = "11999990000",
  ) =>
    ({
      id,
      fullName,
      phone,
      birthDate,
      status: "active",
    }) as Patient;
  const data: AutoCampaignSourceData = {
    patients: [
      patient("p1", "Ana Lima", "1990-10-27"),
      patient("p2", "Bia Rocha", "1985-10-25", ""),
      patient("p3", "Caio Reis", "1992-11-20"),
      patient("p4", "Duda Melo", "1995-10-26"),
    ],
    plans: [],
    appointments: [],
    receivables: [],
    tabs: [],
    surveys: [],
    preferences: [
      {
        id: "pref",
        clinicId: "c",
        patientId: "p4",
        channel: "whatsapp",
        allowed: false,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
  const campaign: AutoCampaign = {
    id: "camp",
    name: "Aniversários",
    trigger: "birthday",
    active: true,
    steps: [
      { id: "s7", offset: 7, message: "Faltam poucos dias, {{nome}}!" },
      {
        id: "s2",
        offset: 2,
        message: "{{nome}}, dia {{data}} você faz {{idade}} anos!",
      },
      { id: "s0", offset: 0, message: "Parabéns, {{nome}}!" },
    ],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    createdByName: "Equipe",
  };

  it("lists who matches today's step with the filled message and blocked reasons", () => {
    const queue = buildAutoCampaignQueue(
      [campaign],
      data,
      [],
      "2026-10-25",
      "America/Sao_Paulo",
    );
    expect(
      queue.items.map((item) => [
        item.patientName,
        item.stepLabel,
        item.status,
        item.blockedReason,
      ]),
    ).toEqual([
      ["Ana Lima", "2 dias antes", "pending", undefined],
      ["Bia Rocha", "No dia", "skipped", "no_destination"],
      ["Duda Melo", "2 dias antes", "skipped", "opt_out"],
    ]);
    expect(queue.items[0]!.message).toBe("Ana, dia 27/10 você faz 36 anos!");
    expect(queue.items[0]!.occurrenceKey).toBe("p1:2026");
    expect(queue.campaigns).toEqual([
      expect.objectContaining({ campaignId: "camp", pending: 1, skipped: 2 }),
    ]);
  });

  it("marks recorded deliveries and ignores inactive campaigns", () => {
    const queue = buildAutoCampaignQueue(
      [campaign],
      data,
      [
        {
          id: "d1",
          campaignId: "camp",
          stepId: "s2",
          patientId: "p1",
          occurrenceKey: "p1:2026",
          status: "sent",
          message: "x",
          handledAt: "2026-10-25T12:00:00Z",
          handledByName: "Equipe",
        },
      ],
      "2026-10-25",
      "America/Sao_Paulo",
    );
    expect(queue.items.find((item) => item.patientId === "p1")?.status).toBe(
      "sent",
    );
    expect(
      buildAutoCampaignQueue(
        [{ ...campaign, active: false }],
        data,
        [],
        "2026-10-25",
        "America/Sao_Paulo",
      ).items,
    ).toEqual([]);
  });
});
