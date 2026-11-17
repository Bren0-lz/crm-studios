import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import "../../test-support/legacy-setup.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const token = (sub: string, role: "admin" | "user") => ({
    authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role })}`,
  });
  const admin = token(actorId, "admin");
  const member = token(
    (
      await repository.createAdminUser(
        clinicId,
        actorId,
        {
          fullName: "Recepção",
          email: "recepcao-desconto@example.com",
          password: "Password123",
          role: "user",
          permissions: ["patients.view"],
        },
        "unused",
      )
    ).id,
    "user",
  );
  const base = { name: "Studios Aryana", timezone: "America/Sao_Paulo" };
  const save = (payload: Record<string, unknown>, headers = admin) =>
    app.inject({
      method: "PUT",
      url: "/admin/clinic-settings",
      headers,
      payload: { ...base, ...payload },
    });
  const branding = async (headers = member) =>
    (
      await app.inject({ method: "GET", url: "/clinic/branding", headers })
    ).json<{ defaultDiscountScope?: string }>();
  return { app, admin, member, save, branding };
}

// RF11 (D3): o alcance padrão do desconto é configurado pela clínica.
describe("alcance padrão do desconto do plano", () => {
  it("vale “só no próximo pagamento” até a clínica escolher outro", async () => {
    const { app, admin, branding } = await setup();
    expect((await branding()).defaultDiscountScope).toBe("once");
    const settings = await app.inject({
      method: "GET",
      url: "/admin/clinic-settings",
      headers: admin,
    });
    expect(settings.json()).toMatchObject({ defaultDiscountScope: "once" });
  });

  it("o admin grava o alcance e todo usuário logado lê pela marca da clínica", async () => {
    const { save, branding } = await setup();
    const saved = await save({ defaultDiscountScope: "permanent" });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ defaultDiscountScope: "permanent" });
    expect((await branding()).defaultDiscountScope).toBe("permanent");

    // Sem o campo, o alcance gravado continua.
    expect((await save({})).json()).toMatchObject({
      defaultDiscountScope: "permanent",
    });
    expect((await branding()).defaultDiscountScope).toBe("permanent");
  });

  it("recusa alcance desconhecido e quem não edita as configurações da clínica", async () => {
    const { save, member, branding } = await setup();
    expect((await save({ defaultDiscountScope: "always" })).statusCode).toBe(
      400,
    );
    expect(
      (await save({ defaultDiscountScope: "next" }, member)).statusCode,
    ).toBe(403);
    expect((await branding()).defaultDiscountScope).toBe("once");
  });
});
