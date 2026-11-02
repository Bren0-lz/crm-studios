import type { AdminUser } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  parsePercentage,
  userAccessSummary,
  userCommissionSummary,
  userSaveErrorMessage,
} from "./model";

const user: AdminUser = {
  id: "user",
  clinicId: "clinic",
  fullName: "Equipe",
  email: "equipe@example.com",
  role: "user",
  modules: ["agenda"],
  editModules: [],
  permissions: [],
  customModules: true,
  active: true,
  createdAt: "2040-01-01",
  updatedAt: "2040-01-01",
};

describe("commission and access summaries", () => {
  it("preserves actionable server errors when saving a user", () => {
    expect(userSaveErrorMessage(new Error("E-mail já cadastrado."))).toBe(
      "E-mail já cadastrado.",
    );
  });
  it("keeps invalid percentages distinct from an omitted percentage and accepts decimal commas", () => {
    expect(parsePercentage(" ")).toBeUndefined();
    expect(parsePercentage(" 12,5 ")).toBe(12.5);
    expect(parsePercentage("inválido")).toBeNaN();
    expect(parsePercentage("Infinity")).toBeNaN();
  });
  it("summarizes the general commission, including zero", () => {
    expect(
      userCommissionSummary({
        ...user,
        professionalId: "professional",
        professionalName: "Profissional",
        commissionPercentage: 0,
      }),
    ).toBe("Agenda: Profissional · Comissão 0%");
    expect(userCommissionSummary({ ...user, commissionPercentage: 12.5 })).toBe(
      "Sem profissional da agenda · Comissão 12,5%",
    );
    expect(userCommissionSummary(user)).toBe(
      "Sem profissional da agenda · Sem comissão vigente",
    );
  });
  it("summarizes effective access without implying editing rights", () => {
    expect(userAccessSummary(user)).toBe("Vê 1 módulo · 0 permissões");
    expect(
      userAccessSummary({ ...user, modules: ["agenda", "clinical"] }),
    ).toBe("Vê 2 módulos · 0 permissões");
    expect(userAccessSummary({ ...user, modules: [] })).toBe(
      "Nenhum módulo (só Visão geral)",
    );
    expect(userAccessSummary({ ...user, role: "admin" })).toBe("Acesso total");
  });
});
