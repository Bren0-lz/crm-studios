import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";
import { loadAutoCampaignQueue } from "./auto-campaigns.js";

afterEach(() => vi.useRealTimers());

describe("appointment location source integration", () => {
  it("resolves legacy demo appointments to their default branch and reflects address changes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-06-10T12:00:00Z"));
    const repository = new MemoryClinicRepository(true);
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const actor = "22222222-2222-4222-8222-222222222222";
    const campaign = await repository.createAutoCampaign(clinicId, actor, {
      name: "Endereço dos atendimentos",
      trigger: "appointment_upcoming",
      active: true,
      steps: [
        {
          offset: 365,
          message:
            "Olá, {{nome}}!\nEndereço: {{endereco}}\nMapa: {{link_mapa}}",
        },
      ],
    });
    const queue = () =>
      loadAutoCampaignQueue(repository, clinicId, ["communications", "agenda"]);
    const items = (await queue()).items.filter(
      (item) => item.campaignId === campaign.id,
    );
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.message).toContain(
        "Endereço: Rua das Flores, 100 · Centro · Campinas/SP",
      );
      expect(item.message).toContain(
        "https://www.google.com/maps/search/?api=1&query=",
      );
    }
    const branch = (await repository.listBranches(clinicId)).find(
      (item) => item.isDefault,
    )!;
    await repository.saveBranch(
      clinicId,
      actor,
      { name: branch.name, active: true },
      branch.id,
    );
    const missing = (await queue()).items.filter(
      (item) => item.campaignId === campaign.id,
    );
    expect(missing).toHaveLength(items.length);
    for (const item of missing) {
      expect(item.message).not.toMatch(/Endereço:|Mapa:|\{\{/);
      expect(item.message).toMatch(/^Olá, .+!$/);
    }
  });
});
