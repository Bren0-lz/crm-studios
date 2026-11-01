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
    // Sem plano avulso não há valor avulso, mesmo com preço de tabela.
    expect(listed.find((item) => item.id === created.json().id)).toMatchObject({
      priceInCents: 12000,
      singleSessionPriceInCents: null,
    });
    expect(listed.find((item) => item.id === single.id)).toMatchObject({
      priceInCents: 0,
      singleSessionPriceInCents: 9500,
    });
  });
});
