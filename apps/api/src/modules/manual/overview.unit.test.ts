import { navMenu, navTabSchema, permissionCatalog } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { crmOverview, overviewModules } from "./overview.js";
import { manualAreas } from "./search.js";

describe("visão geral do CRM para o agente", () => {
  it("mostra todas as abas do menu, com endereço, módulo e quantidade de guias", () => {
    const overview = crmOverview();
    const screens = (overview.menu ?? []).flatMap((group) => group.telas);
    expect(screens.map((screen) => screen.aba).sort()).toEqual(
      [...navTabSchema.options].sort(),
    );
    expect(screens.find((screen) => screen.aba === "agenda")).toMatchObject({
      nome: "Agenda",
      endereco: "https://crm.organizastudios.com/agenda",
      modulo: "agenda",
      exigePermissao: "agenda.view",
      resumo: expect.stringContaining("Agenda"),
      guias: expect.any(Number),
    });
    expect(
      screens.find((screen) => screen.aba === "agenda")?.guias,
    ).toBeGreaterThan(0);
    expect(overview.conceitos?.join(" ")).toMatch(/Usuário comum/);
  });
  it("liga cada área de guias a uma aba, menos acesso e outros", () => {
    const linked = new Set(
      (crmOverview().menu ?? []).flatMap((group) =>
        group.telas.flatMap((screen) => [...screen.areasDeGuias]),
      ),
    );
    expect(manualAreas.filter((area) => !linked.has(area))).toEqual([
      "AC",
      "OU",
    ]);
  });
  it("lista as operações de um módulo com os nomes do catálogo de permissões", () => {
    const agenda = crmOverview("agenda");
    expect(agenda.telas?.map((screen) => screen.aba)).toEqual(["agenda"]);
    expect(agenda.operacoes).toContainEqual({
      permissao: "agenda.reschedule",
      nome: "Remarcar atendimento",
      descricao: expect.stringContaining("horário"),
    });
    expect(agenda.operacoes).toHaveLength(
      permissionCatalog.filter((item) => item.module === "agenda").length,
    );
  });
  it("cobre todos os módulos, inclusive os que ficam dentro de outra tela", () => {
    expect(overviewModules).toContain("trash");
    expect(crmOverview("trash").telas).toEqual([]);
    expect(navMenu.flatMap((group) => group.items)).toHaveLength(
      navTabSchema.options.length,
    );
  });
});
