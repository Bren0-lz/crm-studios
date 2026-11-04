import { nextTestCpf } from "../../test-support/cpf.js";
import type {
  AutoCampaign,
  AutoCampaignDelivery,
  AutoCampaignPromotionOffer,
  AutoCampaignQueue,
  NotificationsSummary,
} from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { verifyAutoCampaignRepository } from "../../test-support/auto-campaigns-suite.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 15:00 em São Paulo, 10/06/2039.
  vi.setSystemTime(new Date("2039-06-10T18:00:00Z"));
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  async function createPatient(fullName: string, birthDate: string) {
    const response = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: {
        cpf: nextTestCpf(),
        fullName,
        phone: "11955554444",
        whatsapp: "11955554444",
        emergencyContactName: fullName,
        emergencyContactPhone: "11955554444",
        birthDate,
        tags: [],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }
  async function queue(requestHeaders = headers) {
    const response = await app.inject({
      method: "GET",
      url: "/communications/auto-campaigns/queue",
      headers: requestHeaders,
    });
    expect(response.statusCode).toBe(200);
    return response.json<AutoCampaignQueue>();
  }
  async function userWith(modules: string[], editModules: string[] = []) {
    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers,
      payload: {
        fullName: "Usuária restrita",
        email: `restrita.${[...modules, "edit", ...editModules].join("-")}@teste.local`,
        role: "user",
        password: "SenhaForte123",
        modules,
        editModules,
      },
    });
    expect(created.statusCode).toBe(201);
    return {
      authorization: `Bearer ${app.jwt.sign({
        sub: created.json<{ id: string }>().id,
        clinicId,
        role: "user",
      })}`,
    };
  }
  return { app, headers, createPatient, queue, userWith };
}

const birthdayCampaign = {
  name: "Aniversariantes",
  trigger: "birthday",
  steps: [
    { offset: 7, message: "Olá, {{nome}}! Seu aniversário está chegando." },
    { offset: 2, message: "{{nome}}, faltam 2 dias!" },
    { offset: 1, message: "{{nome}}, é amanhã!" },
    { offset: 0, message: "Parabéns, {{nome}}! Feliz {{idade}} anos." },
  ],
};

describe("campanhas automáticas", () => {
  it("creates a campaign, lists who matches today and records sent and skipped messages", async () => {
    const { app, headers, createPatient, queue } = await setup();
    const today = await createPatient("Rita Hoje", "1990-06-10");
    const soon = await createPatient("Bruno Breve", "1991-06-12");
    const later = await createPatient("Carla Depois", "1992-06-15");
    const far = await createPatient("Davi Longe", "1993-07-30");

    const created = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: birthdayCampaign,
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<AutoCampaign>();
    expect(campaign.steps.map((step) => step.offset)).toEqual([0, 1, 2, 7]);
    expect(campaign.active).toBe(true);

    const first = await queue();
    const ours = (patientId: string, data = first) =>
      data.items.find(
        (item) =>
          item.campaignId === campaign.id && item.patientId === patientId,
      );
    expect(ours(today.id)).toMatchObject({
      stepLabel: "No dia",
      status: "pending",
      message: "Parabéns, Rita! Feliz 49 anos.",
      occurrenceKey: `${today.id}:2039`,
    });
    expect(ours(soon.id)).toMatchObject({
      stepLabel: "2 dias antes",
      message: "Bruno, faltam 2 dias!",
    });
    expect(ours(later.id)?.stepLabel).toBe("7 dias antes");
    expect(ours(far.id)).toBeUndefined();

    const sent = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: ours(today.id)!.stepId,
        patientId: today.id,
        occurrenceKey: ours(today.id)!.occurrenceKey,
        status: "sent",
      },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json<AutoCampaignDelivery>()).toMatchObject({
      status: "sent",
      message: "Parabéns, Rita! Feliz 49 anos.",
    });

    const missingReason = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: ours(soon.id)!.stepId,
        patientId: soon.id,
        occurrenceKey: ours(soon.id)!.occurrenceKey,
        status: "skipped",
      },
    });
    expect(missingReason.statusCode).toBe(400);
    const skipped = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: ours(soon.id)!.stepId,
        patientId: soon.id,
        occurrenceKey: ours(soon.id)!.occurrenceKey,
        status: "skipped",
        skipReason: "contacted_other_way",
      },
    });
    expect(skipped.statusCode).toBe(201);

    const second = await queue();
    expect(ours(today.id, second)?.status).toBe("sent");
    expect(ours(soon.id, second)).toMatchObject({
      status: "skipped",
      delivery: { skipReason: "contacted_other_way" },
    });
    const summary = (data: AutoCampaignQueue) =>
      data.campaigns.find((item) => item.campaignId === campaign.id)!;
    expect(summary(second)).toMatchObject({
      pending: summary(first).pending - 2,
      sent: summary(first).sent + 1,
      skipped: summary(first).skipped + 1,
    });

    // A mensagem de outro momento não está na fila: não dá para marcar.
    const gone = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: campaign.steps.find((step) => step.offset === 1)!.id,
        patientId: today.id,
        occurrenceKey: `${today.id}:2039`,
        status: "sent",
      },
    });
    expect(gone.statusCode).toBe(409);

    // Desfazer devolve para pendente.
    const undo = await app.inject({
      method: "DELETE",
      url: `/communications/auto-campaigns/deliveries/${sent.json<AutoCampaignDelivery>().id}`,
      headers,
    });
    expect(undo.statusCode).toBe(204);
    expect(ours(today.id, await queue())?.status).toBe("pending");
  });

  it("reminds in the bell how many people are left, keeps step history on edit and stops after delete", async () => {
    const { app, headers, createPatient, queue } = await setup();
    const rita = await createPatient("Rita Hoje", "1990-06-10");
    const campaign = (
      await app.inject({
        method: "POST",
        url: "/communications/auto-campaigns",
        headers,
        payload: { ...birthdayCampaign, name: "Parabéns" },
      })
    ).json<AutoCampaign>();
    const bell = async () =>
      (
        await app.inject({ method: "GET", url: "/notifications", headers })
      ).json<NotificationsSummary>();
    const pending = (await queue()).campaigns.find(
      (item) => item.campaignId === campaign.id,
    )!.pending;
    expect((await bell()).autoCampaigns).toContainEqual({
      id: campaign.id,
      name: "Parabéns",
      pending,
    });

    const dayStep = campaign.steps.find((step) => step.offset === 0)!;
    await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns/deliveries",
      headers,
      payload: {
        campaignId: campaign.id,
        stepId: dayStep.id,
        patientId: rita.id,
        occurrenceKey: `${rita.id}:2039`,
        status: "sent",
      },
    });
    const edited = await app.inject({
      method: "PUT",
      url: `/communications/auto-campaigns/${campaign.id}`,
      headers,
      payload: {
        name: "Parabéns do mês",
        trigger: "birthday",
        active: true,
        steps: [{ id: dayStep.id, offset: 0, message: "Feliz aniversário!" }],
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json<AutoCampaign>().steps).toEqual([
      { id: dayStep.id, offset: 0, message: "Feliz aniversário!" },
    ]);
    const afterEdit = await queue();
    expect(
      afterEdit.items.find(
        (item) => item.campaignId === campaign.id && item.patientId === rita.id,
      )?.status,
    ).toBe("sent");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/communications/auto-campaigns/${campaign.id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);
    expect(
      (await queue()).items.some((item) => item.campaignId === campaign.id),
    ).toBe(false);
    expect(
      ((await bell()).autoCampaigns ?? []).some(
        (item) => item.id === campaign.id,
      ),
    ).toBe(false);
    // Criar, alterar e excluir ficam no Histórico.
    const history = (
      await app.inject({
        method: "GET",
        url: "/history/audit-events?module=communications",
        headers,
      })
    ).json<{
      items: {
        action: string;
        entityId?: string;
        metadata: Record<string, unknown>;
      }[];
    }>().items;
    expect(
      history
        .filter((item) => item.entityId === campaign.id)
        .map((item) => [item.action, item.metadata.name])
        .sort(),
    ).toEqual([
      ["auto_campaign.created", "Parabéns"],
      ["auto_campaign.deleted", "Parabéns do mês"],
      ["auto_campaign.updated", "Parabéns do mês"],
    ]);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/communications/auto-campaigns/${campaign.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("validates steps and protects editing and overdue payments by permission", async () => {
    const { app, headers, userWith } = await setup();
    const duplicated = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        name: "Duplicada",
        trigger: "birthday",
        steps: [
          { offset: 1, message: "a" },
          { offset: 1, message: "b" },
        ],
      },
    });
    expect(duplicated.statusCode).toBe(400);

    const viewer = await userWith(["communications"]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/communications/auto-campaigns/queue",
          headers: viewer,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/communications/auto-campaigns",
          headers: viewer,
          payload: birthdayCampaign,
        })
      ).statusCode,
    ).toBe(403);

    const overdue = await app.inject({
      method: "POST",
      url: "/communications/auto-campaigns",
      headers,
      payload: {
        name: "Cobrança",
        trigger: "overdue_payment",
        steps: [{ offset: 1, message: "Olá, {{nome}}." }],
      },
    });
    expect(overdue.statusCode).toBe(201);
    // Sem o Financeiro, a campanha de cobrança não aparece na fila.
    const viewerQueue = await app.inject({
      method: "GET",
      url: "/communications/auto-campaigns/queue",
      headers: viewer,
    });
    expect(
      viewerQueue
        .json<AutoCampaignQueue>()
        .campaigns.some((item) => item.trigger === "overdue_payment"),
    ).toBe(false);
  });

  it("offers the promotion when scheduling and keeps the client out of that campaign after using it", async () => {
    const { app, headers, createPatient, queue } = await setup();
    // Aniversário em 15/06; hoje é 10/06 (vale a mensagem de 7 dias antes).
    const patient = await createPatient("Lara Promo", "1990-06-15");
    async function createCampaign(name: string, offsets: number[]) {
      const response = await app.inject({
        method: "POST",
        url: "/communications/auto-campaigns",
        headers,
        payload: {
          name,
          trigger: "birthday",
          steps: offsets.map((offset) => ({
            offset,
            message: "Olá, {{nome}}",
          })),
          promotion: {
            validDays: 10,
            cooldown: { amount: 2, unit: "months" },
          },
        },
      });
      expect(response.statusCode).toBe(201);
      return response.json<AutoCampaign>();
    }
    const main = await createCampaign("Aniversariantes promo", [7, 0]);
    expect(main.promotion).toEqual({
      validDays: 10,
      cooldown: { amount: 2, unit: "months" },
    });
    const other = await createCampaign("Mês do aniversário", [7]);

    async function offers() {
      const response = await app.inject({
        method: "GET",
        url: `/appointments/promotions?patientId=${patient.id}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      return response.json<AutoCampaignPromotionOffer[]>();
    }
    // Sem mensagem enviada, não há promoção para usar.
    expect(await offers()).toEqual([]);

    const pending = (await queue()).items.filter(
      (item) => item.patientId === patient.id,
    );
    expect(pending).toHaveLength(2);
    for (const item of pending) {
      const sent = await app.inject({
        method: "POST",
        url: "/communications/auto-campaigns/deliveries",
        headers,
        payload: {
          campaignId: item.campaignId,
          stepId: item.stepId,
          patientId: patient.id,
          occurrenceKey: item.occurrenceKey,
          status: "sent",
        },
      });
      expect(sent.statusCode).toBe(201);
      // Aniversário (15/06) + 10 dias.
      expect(sent.json<AutoCampaignDelivery>().promotionValidUntil).toBe(
        "2039-06-25",
      );
    }
    expect((await offers()).map((offer) => offer.campaignId).sort()).toEqual(
      [main.id, other.id].sort(),
    );

    const [professionals, rooms, services] = await Promise.all(
      ["/professionals", "/rooms", "/services"].map((url) =>
        app.inject({ method: "GET", url, headers }),
      ),
    );
    const appointment = (startsAt: string, promotion?: object) =>
      app.inject({
        method: "POST",
        url: "/appointments",
        headers,
        payload: {
          patientId: patient.id,
          professionalId: professionals!.json()[0].id,
          roomId: rooms!.json()[0].id,
          serviceId: services!.json()[0].id,
          startsAt,
          ...(promotion ? { promotion } : {}),
        },
      });
    const occurrenceKey = `${patient.id}:2039`;
    // Agendado hoje, dentro do prazo, para depois do fim da promoção: vale.
    const booked = await appointment("2039-06-30T13:00:00.000Z", {
      campaignId: main.id,
      occurrenceKey,
    });
    expect(booked.statusCode).toBe(201);
    expect((await offers()).map((offer) => offer.campaignId)).toEqual([
      other.id,
    ]);
    const repeated = await appointment("2039-07-01T13:00:00.000Z", {
      campaignId: main.id,
      occurrenceKey,
    });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({
      code: "AUTO_CAMPAIGN_PROMOTION_UNAVAILABLE",
    });

    // No dia do aniversário, a campanha usada não chama de novo; a outra segue normal.
    vi.setSystemTime(new Date("2039-06-15T18:00:00Z"));
    const onBirthday = (data: AutoCampaignQueue) =>
      data.items.filter((item) => item.patientId === patient.id);
    expect(
      onBirthday(await queue()).some((item) => item.campaignId === main.id),
    ).toBe(false);
    expect(
      onBirthday(await queue()).some((item) => item.campaignId === other.id),
    ).toBe(true);

    // Cancelar o atendimento desfaz o uso: a promoção volta e a mensagem do dia também.
    const cancelled = await app.inject({
      method: "PATCH",
      url: `/appointments/${booked.json<{ id: string }>().id}/status`,
      headers,
      payload: { status: "cancelled" },
    });
    expect(cancelled.statusCode).toBe(200);
    expect((await offers()).some((offer) => offer.campaignId === main.id)).toBe(
      true,
    );
    expect(
      onBirthday(await queue()).some((item) => item.campaignId === main.id),
    ).toBe(true);

    // Depois do prazo, não há mais promoção.
    vi.setSystemTime(new Date("2039-06-26T18:00:00Z"));
    expect(await offers()).toEqual([]);
    expect(
      (
        await appointment("2039-06-25T13:00:00.000Z", {
          campaignId: main.id,
          occurrenceKey,
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe("repositório em memória", () => {
  it("stores campaigns and one delivery per message and event", async () => {
    await verifyAutoCampaignRepository(new MemoryClinicRepository());
  });
});
