import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { nextTestCpf } from "../../test-support/cpf.js";
import "../../test-support/legacy-setup.js";
import {
  leadInputSchema,
  type LeadBoard,
  type LeadStageConfig,
} from "@crm/contracts";
import { testPatientContact } from "../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  otherClinicId = "33333333-3333-4333-8333-333333333333",
  actorId = "22222222-2222-4222-8222-222222222222",
  apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

type StageInput = { stage?: string; label: string; final?: boolean };

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const token = (sub: string, role: "admin" | "user") => ({
    authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role })}`,
  });
  const admin = token(actorId, "admin");
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
  const save = (stages: StageInput[], headers = admin) =>
    app.inject({
      method: "PUT",
      url: "/leads/stages",
      headers,
      payload: { stages },
    });
  const list = async () =>
    (
      await app.inject({ method: "GET", url: "/leads/stages", headers: admin })
    ).json<LeadStageConfig[]>();
  const createLead = (fullName: string) =>
    repository.createLead(
      clinicId,
      leadInputSchema.parse({
        fullName,
        phone: "11988887777",
        source: "Site",
        interest: "Pilates",
      }),
    );
  return { app, repository, admin, user, save, list, createLead };
}

const editable = (stages: LeadStageConfig[]): StageInput[] =>
  stages.map(({ stage, label }) => ({ stage, label }));

describe("configurable lead funnel", () => {
  it("returns the default stages with their kind", async () => {
    const { list } = await setup();
    expect(await list()).toEqual([
      { stage: "new_contact", label: "Novos", kind: "open" },
      { stage: "contacted", label: "Em contato", kind: "open" },
      { stage: "evaluation", label: "Avaliação", kind: "open" },
      { stage: "proposal", label: "Proposta", kind: "open" },
      { stage: "won", label: "Ganhos", kind: "won" },
      { stage: "lost", label: "Perdidos", kind: "lost" },
    ]);
  });

  it("renames, adds and removes stages and keeps the board in that order", async () => {
    const { app, admin, save, list, repository } = await setup();
    const stages = editable(await list());
    stages[0]!.label = "  Entrada ";
    const response = await save([
      stages[0]!,
      { label: "Aula experimental" },
      stages[3]!,
      stages[4]!,
      stages[5]!,
    ]);
    expect(response.statusCode).toBe(200);
    const saved = response.json<LeadStageConfig[]>();
    expect(saved.map((item) => item.label)).toEqual([
      "Entrada",
      "Aula experimental",
      "Proposta",
      "Ganhos",
      "Perdidos",
    ]);
    expect(saved[1]!.stage).toMatch(/^stage_[a-f0-9]{12}$/);
    expect(saved[1]!.kind).toBe("open");
    expect(await list()).toEqual(saved);
    expect((await repository.listLeadStages(otherClinicId)).length).toBe(6);

    const board = await app.inject({
      method: "GET",
      url: "/leads/board",
      headers: admin,
    });
    expect(
      board.json<LeadBoard>().columns.map((column) => column.stage),
    ).toEqual(saved.map((item) => item.stage));
  });

  it("puts new leads in the first open stage and moves leads to custom stages", async () => {
    const { app, admin, save, list, createLead } = await setup();
    const stages = editable(await list());
    const saved = (await save([{ label: "Triagem" }, ...stages.slice(1)])).json<
      LeadStageConfig[]
    >();
    const lead = await createLead("Lead da triagem");
    expect(lead.stage).toBe(saved[0]!.stage);

    const moved = await app.inject({
      method: "PATCH",
      url: `/leads/${lead.id}/stage`,
      headers: admin,
      payload: { stage: "proposal" },
    });
    expect(moved.statusCode).toBe(200);
    const unknown = await app.inject({
      method: "PATCH",
      url: `/leads/${lead.id}/stage`,
      headers: admin,
      payload: { stage: "new_contact" },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().message).toBe("Etapa do funil não encontrada.");
  });

  it("blocks removing a stage that still has leads", async () => {
    const { save, list, createLead } = await setup();
    await createLead("Lead novo");
    const stages = editable(await list());
    const response = await save(stages.slice(1));
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe(
      'A etapa "Novos" tem 1 lead. Mova-os para outra etapa antes de removê-la.',
    );
    expect((await list()).length).toBe(6);
  });

  it("chooses another final stage, carrying the converted leads", async () => {
    const { app, admin, save, list, repository, createLead } = await setup();
    const converted = await createLead("Lead convertido");
    await repository.convertLead(clinicId, actorId, converted.id, {
      cpf: nextTestCpf(),
      ...testPatientContact,
    });
    const open = await createLead("Lead aberto");
    await repository.moveLead(clinicId, actorId, open.id, "proposal");

    const stages = editable(await list());
    // Etapa com leads abertos não pode virar a final.
    const blocked = await save(
      stages.map((item) =>
        item.stage === "proposal" ? { ...item, final: true } : item,
      ),
    );
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().message).toContain('A etapa "Proposta" tem 1 lead');

    // Nova etapa "Matrícula" vira a final; a antiga "Ganhos" sai do funil.
    const response = await save([
      ...stages.filter((item) => !["won", "lost"].includes(item.stage!)),
      { label: "Matrícula", final: true },
      stages.find((item) => item.stage === "lost")!,
    ]);
    expect(response.statusCode).toBe(200);
    const saved = response.json<LeadStageConfig[]>();
    expect(saved.at(-2)).toEqual({
      stage: "won",
      label: "Matrícula",
      kind: "won",
    });
    expect(saved.some((item) => item.label === "Ganhos")).toBe(false);
    const board = await app.inject({
      method: "GET",
      url: "/leads/board/won",
      headers: admin,
    });
    expect(board.json().leads.map((lead: { id: string }) => lead.id)).toEqual([
      converted.id,
    ]);

    // Uma etapa vazia existente também pode virar a final; a anterior vira etapa aberta.
    const again = editable(saved).map((item) =>
      item.stage === "evaluation" ? { ...item, final: true } : item,
    );
    const swapped = (await save(again)).json<LeadStageConfig[]>();
    expect(swapped[2]).toEqual({
      stage: "won",
      label: "Avaliação",
      kind: "won",
    });
    expect(swapped.at(-2)!.kind).toBe("open");
    expect(swapped.at(-2)!.label).toBe("Matrícula");
  });

  it("rejects an invalid funnel", async () => {
    const { save, list } = await setup();
    const stages = editable(await list());
    for (const invalid of [
      stages.filter((item) => item.stage !== "lost"),
      stages.map((item) => ({ ...item, final: item.stage === "lost" })),
      [stages[4]!, stages[5]!],
      stages.map((item) => ({ ...item, final: true })),
      [...stages.slice(0, 5), { ...stages[5]!, label: "novos" }],
      [{ stage: "stage_inexistente", label: "Fantasma" }, ...stages],
    ]) {
      const response = await save(invalid);
      expect([400, 409]).toContain(response.statusCode);
    }
    expect((await list()).length).toBe(6);
  });

  it("requires the funnel permission, granted only explicitly", async () => {
    const { app, user, save, list } = await setup();
    const stages = editable(await list());
    const seller = await user("crm-stages-seller@test.local", [
      "crm.view",
      "crm.update",
      "crm.create",
      "crm.stage",
    ]);
    const read = await app.inject({
      method: "GET",
      url: "/leads/stages",
      headers: seller,
    });
    expect(read.statusCode).toBe(200);
    expect((await save(stages, seller)).statusCode).toBe(403);
    const manager = await user("crm-stages-manager@test.local", [
      "crm.view",
      "crm.stages_manage",
    ]);
    expect((await save(stages, manager)).statusCode).toBe(200);
  });
});
