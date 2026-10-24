import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import "../../test-support/legacy-setup.js";
import { defaultLeadStageLabels, type LeadStageLabel } from "@crm/contracts";

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
  const user = async (
    email: string,
    permissions: Parameters<
      MemoryClinicRepository["createAdminUser"]
    >[2]["permissions"],
  ) =>
    token(
      (
        await repository.createAdminUser(
          clinicId,
          actorId,
          {
            fullName: "Equipe comercial",
            email,
            password: "Password123",
            role: "user",
            permissions,
          },
          "unused",
        )
      ).id,
      "user",
    );
  return { app, repository, admin: token(actorId, "admin"), user };
}

const renamed = (): LeadStageLabel[] => [
  { stage: "new_contact", label: "Entrada" },
  { stage: "contacted", label: "Primeiro contato" },
  { stage: "evaluation", label: "Aula experimental" },
  { stage: "proposal", label: "Negociação" },
  { stage: "won", label: "Matriculados" },
  { stage: "lost", label: "Descartados" },
];

describe("lead stage labels", () => {
  it("returns the default names until the clinic renames them", async () => {
    const { app, admin } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/leads/stages",
      headers: admin,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      Object.entries(defaultLeadStageLabels).map(([stage, label]) => ({
        stage,
        label,
      })),
    );
  });

  it("saves trimmed names per clinic, in funnel order", async () => {
    const { app, admin, repository } = await setup();
    const input = renamed().reverse();
    input[0] = { stage: "lost", label: "  Descartados  " };
    const response = await app.inject({
      method: "PUT",
      url: "/leads/stages",
      headers: admin,
      payload: { stages: input },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(renamed());
    const listed = await app.inject({
      method: "GET",
      url: "/leads/stages",
      headers: admin,
    });
    expect(listed.json()).toEqual(renamed());
    expect(
      (await repository.listLeadStageLabels(otherClinicId))[0]?.label,
    ).toBe("Novos");
  });

  it("rejects missing stages, empty and repeated names", async () => {
    const { app, admin } = await setup();
    const repeated = renamed();
    repeated[1] = { stage: "contacted", label: "entrada" };
    for (const stages of [
      renamed().slice(1),
      renamed().map((item) => ({
        ...item,
        label: item.stage === "won" ? " " : item.label,
      })),
      repeated,
      [...renamed().slice(0, 5), { stage: "won", label: "Outro" }],
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: "/leads/stages",
        headers: admin,
        payload: { stages },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("requires the rename permission, granted only explicitly", async () => {
    const { app, user } = await setup();
    const viewer = await user("crm-stages-viewer@test.local", [
      "crm.view",
      "crm.update",
      "crm.create",
      "crm.stage",
    ]);
    const read = await app.inject({
      method: "GET",
      url: "/leads/stages",
      headers: viewer,
    });
    expect(read.statusCode).toBe(200);
    const denied = await app.inject({
      method: "PUT",
      url: "/leads/stages",
      headers: viewer,
      payload: { stages: renamed() },
    });
    expect(denied.statusCode).toBe(403);

    const manager = await user("crm-stages-manager@test.local", [
      "crm.view",
      "crm.stages_manage",
    ]);
    const allowed = await app.inject({
      method: "PUT",
      url: "/leads/stages",
      headers: manager,
      payload: { stages: renamed() },
    });
    expect(allowed.statusCode).toBe(200);
  });
});
