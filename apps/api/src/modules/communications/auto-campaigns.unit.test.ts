import type { AutoCampaign, AutoCampaignStep, Patient } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  activeStep,
  buildAutoCampaignQueue,
  listPromotionOffers,
  promotionBlockedUntil,
  promotionValidUntil,
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

describe("promoções", () => {
  const promotion = { validDays: 10 };

  it("counts the validity from the scheduled date of the first message", () => {
    const birthday = {
      trigger: "birthday" as const,
      steps: [step(0), step(7)],
    };
    // Primeira mensagem 7 dias antes + 10 dias: até 3 dias depois do aniversário.
    expect(
      promotionValidUntil(birthday, promotion, "2039-06-15", "2039-06-13"),
    ).toBe("2039-06-18");
    const overdue = {
      trigger: "overdue_payment" as const,
      steps: [step(3), step(10)],
    };
    expect(
      promotionValidUntil(overdue, promotion, "2039-06-01", "2039-06-12"),
    ).toBe("2039-06-14");
    const lowBalance = { trigger: "low_balance" as const, steps: [step(2)] };
    expect(
      promotionValidUntil(lowBalance, promotion, undefined, "2039-06-12"),
    ).toBe("2039-06-22");
  });

  it("blocks for days, weeks or months after using", () => {
    expect(
      promotionBlockedUntil("2039-01-31", { amount: 5, unit: "days" }),
    ).toBe("2039-02-05");
    expect(
      promotionBlockedUntil("2039-01-31", { amount: 2, unit: "weeks" }),
    ).toBe("2039-02-14");
    expect(
      promotionBlockedUntil("2039-01-31", { amount: 1, unit: "months" }),
    ).toBe("2039-02-28");
  });

  it("offers only sent, valid and unused promotions", () => {
    const campaign = (id: string, name: string): AutoCampaign => ({
      id,
      name,
      trigger: "birthday",
      active: true,
      steps: [step(7)],
      promotion,
      createdAt: "2039-01-01T00:00:00.000Z",
      updatedAt: "2039-01-01T00:00:00.000Z",
      createdByName: "Equipe",
    });
    const delivery = (
      campaignId: string,
      occurrenceKey: string,
      promotionValidUntil: string,
      status: "sent" | "skipped" = "sent",
    ) => ({
      id: `${campaignId}-${occurrenceKey}`,
      campaignId,
      stepId: step(7).id,
      patientId: "p1",
      occurrenceKey,
      status,
      message: "Olá",
      promotionValidUntil,
      handledAt: "2039-06-08T12:00:00.000Z",
      handledByName: "Equipe",
    });
    const campaigns = [campaign("c1", "Aniversário"), campaign("c2", "Outra")];
    const deliveries = [
      delivery("c1", "p1:2039", "2039-06-18"),
      delivery("c2", "p1:2039", "2039-06-18"),
      delivery("c2", "p1:old", "2039-06-01"),
    ];
    const redemption = {
      id: "r1",
      campaignId: "c1",
      patientId: "p1",
      occurrenceKey: "p1:2038",
      appointmentId: "a1",
      appointmentStatus: "scheduled" as const,
      redeemedOn: "2039-05-01",
      blockedUntil: "2039-07-01",
    };
    // Bloqueado na c1 (uso anterior), mas segue na c2; a oferta vencida não aparece.
    expect(
      listPromotionOffers(
        campaigns,
        deliveries,
        [redemption],
        "p1",
        "2039-06-10",
      ).map((offer) => offer.campaignId),
    ).toEqual(["c2"]);
    // Atendimento cancelado desfaz o uso e o bloqueio.
    expect(
      listPromotionOffers(
        campaigns,
        deliveries,
        [{ ...redemption, appointmentStatus: "cancelled" }],
        "p1",
        "2039-06-10",
      ),
    ).toHaveLength(2);
    expect(
      listPromotionOffers(
        campaigns,
        [delivery("c1", "p1:2039", "2039-06-18", "skipped")],
        [],
        "p1",
        "2039-06-10",
      ),
    ).toEqual([]);
  });
});
