import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { serviceWithSinglePlan } from "../../test-support/single-plan-service.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("preço do serviço", () => {
  it("guarda o preço de tabela e lista o valor da sessão do plano avulso", async () => {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
    };

    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Reformer",
        durationMinutes: 50,
        priceInCents: 12000,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ priceInCents: 12000 });
    const negative = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "Preço negativo",
        durationMinutes: 50,
        priceInCents: -1,
      },
    });
    expect(negative.statusCode).toBe(400);

    const single = await serviceWithSinglePlan(
      repository,
      clinicId,
      ownerId,
      9500,
    );
    const listed = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json() as {
      id: string;
      priceInCents: number;
      singleSessionPriceInCents: number | null;
    }[];
    // O preço de tabela gera o plano avulso do serviço.
    expect(listed.find((item) => item.id === created.json().id)).toMatchObject({
      priceInCents: 12000,
      singleSessionPriceInCents: 12000,
    });
    expect(listed.find((item) => item.id === single.id)).toMatchObject({
      priceInCents: 0,
      singleSessionPriceInCents: 9500,
    });
  });
});

describe("plano avulso gerado pelo preço de tabela", () => {
  async function setup() {
    const repository = new MemoryClinicRepository();
    const app = await buildApp({ repository, logger: false });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
    };
    const singlePlans = async (serviceId: string) =>
      (await repository.listPlanTemplates(clinicId)).filter(
        (template) =>
          template.active &&
          template.planType === "single" &&
          template.services.some((item) => item.serviceId === serviceId),
      );
    return { app, headers, singlePlans };
  }

  it("cria um avulso ao cadastrar e atualiza o mesmo ao editar o preço", async () => {
    const { app, headers, singlePlans } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: {
        name: "QA Serviço Tabela",
        durationMinutes: 60,
        priceInCents: 8000,
      },
    });
    expect(created.statusCode).toBe(201);
    const service = created.json() as { id: string };
    const [plan, ...others] = await singlePlans(service.id);
    expect(others).toHaveLength(0);
    expect(plan).toMatchObject({
      name: "QA Serviço Tabela (avulso)",
      totalValueInCents: 8000,
      services: [
        { serviceId: service.id, totalSessions: 1, totalValueInCents: 8000 },
      ],
    });

    const edited = await app.inject({
      method: "PUT",
      url: `/admin/registry/${service.id}`,
      headers,
      payload: {
        kind: "service",
        data: {
          name: "QA Serviço Tabela",
          durationMinutes: 60,
          priceInCents: 9000,
          active: true,
        },
      },
    });
    expect(edited.statusCode).toBe(200);
    const after = await singlePlans(service.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: plan!.id, totalValueInCents: 9000 });
    expect(after[0]!.services[0]).toMatchObject({ totalValueInCents: 9000 });

    // Salvar de novo com o mesmo preço não duplica.
    await app.inject({
      method: "PUT",
      url: `/admin/registry/${service.id}`,
      headers,
      payload: {
        kind: "service",
        data: {
          name: "QA Serviço Tabela",
          durationMinutes: 60,
          priceInCents: 9000,
          active: true,
        },
      },
    });
    expect(await singlePlans(service.id)).toHaveLength(1);

    const listed = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json() as { id: string; singleSessionPriceInCents: number | null }[];
    expect(listed.find((item) => item.id === service.id)).toMatchObject({
      singleSessionPriceInCents: 9000,
    });
  });

  it("não cria avulso para serviço sem preço", async () => {
    const { app, headers, singlePlans } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: { name: "Sem preço", durationMinutes: 30, priceInCents: 0 },
    });
    expect(
      await singlePlans((created.json() as { id: string }).id),
    ).toHaveLength(0);
  });
});
