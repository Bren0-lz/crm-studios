import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";
import "../../test-support/legacy-setup.js";
import {
  LEAD_BOARD_PAGE_SIZE,
  leadInputSchema,
  type LeadBoard,
  type LeadFilterOptions,
  type LeadStagePage,
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
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const create = (name: string, source = "Site", clinic = clinicId) =>
    repository.createLead(
      clinic,
      leadInputSchema.parse({
        fullName: name,
        phone: "11988887777",
        source,
        interest: "Pilates",
      }),
    );
  return { app, headers, repository, create };
}

describe("paginated commercial board", () => {
  it("returns the first page of each stage with the stage total", async () => {
    const { app, headers, repository, create } = await setup();
    for (let index = 0; index < LEAD_BOARD_PAGE_SIZE + 5; index += 1)
      await create(`Lead novo ${String(index).padStart(2, "0")}`);
    const contacted = await create("Lead em contato", "Indicação");
    await repository.moveLead(clinicId, actorId, contacted.id, "contacted");
    await repository.createLeadTask(clinicId, actorId, contacted.id, {
      title: "Retornar",
      dueAt: "2000-01-01T12:00:00Z",
    });
    await create("Lead de outra clínica", "Site", otherClinicId);

    const response = await app.inject({
      method: "GET",
      url: "/leads/board",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const board = response.json<LeadBoard>();
    expect(board.columns.map((column) => column.stage)).toEqual([
      "new_contact",
      "contacted",
      "evaluation",
      "proposal",
      "won",
      "lost",
    ]);
    const [fresh, inContact] = board.columns;
    expect(fresh).toMatchObject({ total: LEAD_BOARD_PAGE_SIZE + 5 });
    expect(fresh!.leads).toHaveLength(LEAD_BOARD_PAGE_SIZE);
    expect(fresh).toMatchObject({ overdue: 0 });
    expect(inContact).toMatchObject({ total: 1, overdue: 1 });
    expect(inContact!.leads[0]!.fullName).toBe("Lead em contato");

    const next = await app.inject({
      method: "GET",
      url: `/leads/board/new_contact?offset=${LEAD_BOARD_PAGE_SIZE}`,
      headers,
    });
    expect(next.statusCode).toBe(200);
    const page = next.json<LeadStagePage>();
    expect(page.total).toBe(LEAD_BOARD_PAGE_SIZE + 5);
    expect(page.leads).toHaveLength(5);
    const ids = new Set(
      [...fresh!.leads, ...page.leads].map((lead) => lead.id),
    );
    expect(ids.size).toBe(LEAD_BOARD_PAGE_SIZE + 5);
  });

  it("applies the funnel filters and the page size limits", async () => {
    const { app, headers, create } = await setup();
    await create("José Indicado", "Indicação");
    await create("Maria do Site", "Site");
    await create("Ana do Site", "Site");

    const filtered = await app.inject({
      method: "GET",
      url: `/leads/board?source=${encodeURIComponent("Site")}&search=ana&limit=1`,
      headers,
    });
    expect(filtered.statusCode).toBe(200);
    const fresh = filtered.json<LeadBoard>().columns[0]!;
    expect(fresh.total).toBe(1);
    expect(fresh.leads.map((lead) => lead.fullName)).toEqual(["Ana do Site"]);

    const accents = await app.inject({
      method: "GET",
      url: `/leads/board?search=${encodeURIComponent("jose")}`,
      headers,
    });
    expect(
      accents.json<LeadBoard>().columns[0]!.leads.map((lead) => lead.fullName),
    ).toEqual(["José Indicado"]);

    const stageOnly = await app.inject({
      method: "GET",
      url: "/leads/board?stage=contacted",
      headers,
    });
    expect(
      stageOnly.json<LeadBoard>().columns.map((column) => column.total),
    ).toEqual([0, 0, 0, 0, 0, 0]);

    for (const url of [
      "/leads/board?limit=101",
      "/leads/board?limit=0",
      "/leads/board/new_contact?offset=-1",
      "/leads/board/unknown",
    ]) {
      const invalid = await app.inject({ method: "GET", url, headers });
      expect(invalid.statusCode, url).toBe(400);
    }
  });

  it("summarizes the funnel and lists filter options of the clinic only", async () => {
    const { app, headers, repository, create } = await setup();
    const won = await create("Lead convertido", "Indicação");
    await create("Lead aberto", "Site");
    await create("Lead de outra clínica", "Outra clínica", otherClinicId);
    await repository.convertLead(clinicId, actorId, won.id, {
      cpf: "52998224725",
    });

    const insights = await app.inject({
      method: "GET",
      url: "/leads/insights",
      headers,
    });
    expect(insights.json()).toMatchObject({
      total: 2,
      open: 1,
      won: 1,
      conversionRate: 50,
    });

    const options = await app.inject({
      method: "GET",
      url: "/leads/filter-options",
      headers,
    });
    expect(options.statusCode).toBe(200);
    expect(options.json<LeadFilterOptions>()).toMatchObject({
      sources: ["Indicação", "Site"],
      interests: ["Pilates"],
    });
  });
});
