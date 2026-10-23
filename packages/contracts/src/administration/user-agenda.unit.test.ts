import { describe, expect, it } from "vitest";
import { adminUserInputSchema, adminUserUpdateSchema } from "./model.js";

const base = {
  fullName: "Ana Souza",
  email: "ana@example.com",
  password: "Senha123",
  role: "user",
};
const data = {
  fullName: "Dra. Ana",
  crefito: "12345-F",
  specialty: "Pilates",
  color: "#547A6B",
};
describe("cadastro unificado de usuário e profissional", () => {
  it("preserva payloads antigos e aceita comissão junto com a edição", () => {
    expect(adminUserInputSchema.parse(base).professional).toBeUndefined();
    expect(
      adminUserUpdateSchema.parse({
        fullName: base.fullName,
        role: "user",
        active: true,
        commission: { percentage: 20, effectiveFrom: "2026-10-01" },
      }).commission,
    ).toMatchObject({ percentage: 20 });
  });
  it("valida criar, vincular/editar e desativar", () => {
    for (const professional of [
      { mode: "create", data },
      { mode: "save", id: "33333333-3333-4333-8333-333333333333", data },
      { mode: "deactivate" },
    ])
      expect(
        adminUserInputSchema.safeParse({ ...base, professional }).success,
      ).toBe(true);
    for (const professional of [
      { mode: "create", data: { ...data, crefito: "" } },
      { mode: "create", data: { ...data, fullName: "A" } },
      { mode: "create", data: { ...data, specialty: "" } },
      { mode: "create", data: { ...data, color: "verde" } },
      { mode: "save", id: "invalid", data },
    ])
      expect(
        adminUserInputSchema.safeParse({ ...base, professional }).success,
      ).toBe(false);
  });
});
