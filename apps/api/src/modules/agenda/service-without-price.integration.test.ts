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

async function setup() {
  const repository = new MemoryClinicRepository();
  const app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: ownerId, clinicId, role: "admin" })}`,
  };
  const singlePlans = async (serviceId: string) =>
    (await repository.listPlanTemplates(clinicId)).filter((template) =>
      template.services.some((item) => item.serviceId === serviceId),
    );
  return { app, headers, repository, singlePlans };
}

describe("serviço sem preço", () => {
  it("ignora preço enviado e não gera plano avulso ao cadastrar nem ao editar", async () => {
    const { app, headers, singlePlans } = await setup();
    const created = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      // Cliente antigo ainda pode mandar o preço: é ignorado.
      payload: { name: "Reformer", durationMinutes: 50, priceInCents: 12000 },
    });
    expect(created.statusCode).toBe(201);
    const service = created.json() as { id: string };
    expect(service).not.toHaveProperty("priceInCents");
    expect(await singlePlans(service.id)).toHaveLength(0);

    const edited = await app.inject({
      method: "PUT",
      url: `/admin/registry/${service.id}`,
      headers,
      payload: {
        kind: "service",
        data: {
          name: "Reformer",
          durationMinutes: 55,
          priceInCents: 9000,
          active: true,
        },
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ durationMinutes: 55 });
    expect(edited.json()).not.toHaveProperty("priceInCents");
    expect(await singlePlans(service.id)).toHaveLength(0);
  });

  it("lista o valor da sessão avulsa pelo plano avulso do serviço", async () => {
    const { app, headers, repository } = await setup();
    const bare = (
      await app.inject({
        method: "POST",
        url: "/services",
        headers,
        payload: { name: "Sem plano avulso", durationMinutes: 50 },
      })
    ).json() as { id: string };
    const single = await serviceWithSinglePlan(
      repository,
      clinicId,
      ownerId,
      9500,
    );
    const listed = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json() as { id: string; singleSessionPriceInCents: number | null }[];
    expect(listed.find((item) => item.id === bare.id)).toMatchObject({
      singleSessionPriceInCents: null,
    });
    expect(listed.find((item) => item.id === single.id)).toMatchObject({
      singleSessionPriceInCents: 9500,
    });
  });
});
