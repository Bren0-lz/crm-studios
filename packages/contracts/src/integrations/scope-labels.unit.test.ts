import { describe, expect, it } from "vitest";
import {
  integrationScopeDescriptions,
  integrationScopeLabels,
  integrationScopeSchema,
} from "./model.js";

describe("rótulos das permissões das chaves de API (INT4)", () => {
  it("nomeia cada escopo pelo alcance real, não só por 'vendas'", () => {
    expect(integrationScopeLabels).toEqual({
      "sales:read": "Consultar dados da clínica",
      "sales:write": "Cadastrar e alterar leads e vendas",
    });
  });

  it("descreve o que cada escopo libera", () => {
    for (const scope of integrationScopeSchema.options) {
      expect(integrationScopeDescriptions[scope]).toMatch(/\S/);
    }
    expect(integrationScopeDescriptions["sales:read"]).toMatch(/clientes/);
    expect(integrationScopeDescriptions["sales:read"]).toMatch(/lista de espera/);
    expect(integrationScopeDescriptions["sales:write"]).toMatch(/Leads/);
    expect(integrationScopeDescriptions["sales:write"]).toMatch(/venda de plano/);
  });
});
