import { describe, expect, it } from "vitest";
import { planSessionProgress } from "./model.js";

describe("planSessionProgress", () => {
  const pkg = (remainingSessions: number, totalSessions = 8) => ({
    kind: "fixed_package" as const,
    totalSessions,
    remainingSessions,
  });

  it("mede as sessões usadas sobre o total contratado", () => {
    expect(planSessionProgress(pkg(8))).toEqual({
      tracked: true,
      used: 0,
      total: 8,
      label: "0 de 8 usadas",
    });
    expect(planSessionProgress(pkg(7))).toMatchObject({
      used: 1,
      label: "1 de 8 usada",
    });
    expect(planSessionProgress(pkg(5))).toMatchObject({
      used: 3,
      label: "3 de 8 usadas",
    });
    expect(planSessionProgress(pkg(0))).toMatchObject({
      used: 8,
      total: 8,
      label: "8 de 8 usadas",
    });
  });

  it("não passa do total nem fica abaixo de zero", () => {
    expect(planSessionProgress(pkg(-2))).toMatchObject({ used: 8 });
    expect(planSessionProgress(pkg(10))).toMatchObject({ used: 0 });
  });

  it("plano sem limite de sessões não tem barra", () => {
    expect(
      planSessionProgress({
        kind: "recurring",
        totalSessions: 8,
        remainingSessions: -1,
      }),
    ).toEqual({ tracked: false, label: "Sem limite de sessões" });
    expect(planSessionProgress(pkg(0, 0))).toMatchObject({ tracked: false });
  });
});
