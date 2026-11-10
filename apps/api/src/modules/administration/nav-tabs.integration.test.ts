import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import "../../test-support/legacy-setup.js";
import {
  defaultNavTabLabels,
  navTabSchema,
  type NavTabLabel,
} from "@crm/contracts";

const clinicId = "11111111-1111-4111-8111-111111111111",
  otherClinicId = "33333333-3333-4333-8333-333333333333",
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
          email: "recepcao-abas@example.com",
          password: "Password123",
          role: "user",
          permissions: ["agenda.view"],
        },
        "unused",
      )
    ).id,
    "user",
  );
  const save = (tabs: NavTabLabel[], headers = admin) =>
    app.inject({
      method: "PUT",
      url: "/admin/nav-tabs",
      headers,
      payload: { tabs },
    });
  const list = async (headers = admin) =>
    (
      await app.inject({ method: "GET", url: "/clinic/nav-tabs", headers })
    ).json<NavTabLabel[]>();
  return { app, repository, admin, member, save, list };
}

const defaults = () =>
  navTabSchema.options.map((tab) => ({
    tab,
    label: defaultNavTabLabels[tab],
  }));

describe("nomes das abas do menu", () => {
  it("devolve os nomes padrão para qualquer usuário logado", async () => {
    const { list, member } = await setup();
    expect(await list(member)).toEqual(defaults());
  });

  it("admin renomeia as abas; vale para a equipe e não para outra clínica", async () => {
    const { save, list, member, repository } = await setup();
    const tabs = defaults();
    tabs[3]!.label = "  Alunos ";
    tabs[6]!.label = "Funil";
    const response = await save(tabs);
    expect(response.statusCode).toBe(200);
    const saved = response.json<NavTabLabel[]>();
    expect(saved[3]).toEqual({ tab: "patients", label: "Alunos" });
    expect(saved[6]).toEqual({ tab: "crm", label: "Funil" });
    expect(await list(member)).toEqual(saved);
    expect(await repository.listNavTabLabels(otherClinicId)).toEqual(
      defaults(),
    );
  });

  it("só o admin pode renomear", async () => {
    const { save, member } = await setup();
    expect((await save(defaults(), member)).statusCode).toBe(403);
  });

  it("rejeita nome vazio, repetido ou aba faltando", async () => {
    const { save, list } = await setup();
    const empty = defaults();
    empty[0]!.label = "  ";
    expect((await save(empty)).statusCode).toBe(400);
    const repeated = defaults();
    repeated[1]!.label = "clientes";
    expect((await save(repeated)).statusCode).toBe(400);
    expect((await save(defaults().slice(1))).statusCode).toBe(400);
    expect(await list()).toEqual(defaults());
  });
});
