import type { GroupClass, GuidedPatientResult } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { guidedNotice } from "./model";

const result = (
  name: string,
  kind: "recurring" | "single" = "recurring",
  groupName?: string,
) =>
  ({
    plan: { name, kind },
    ...(groupName ? { enrollment: { groupId: "g1", status: "active" } } : {}),
  }) as unknown as GuidedPatientResult;

const groups = (name: string) => [{ id: "g1", name }] as GroupClass[];

// QV5: o toast do cadastro guiado não repete o prefixo que o nome já traz.
describe("guidedNotice", () => {
  it("keeps the Plano prefix for a plan named without it", () => {
    expect(guidedNotice(result("Pilates 2x semana"), [])).toBe(
      "Plano “Pilates 2x semana” criado.",
    );
  });

  it("does not repeat Plano when the plan name already starts with it", () => {
    expect(guidedNotice(result("Plano trimestral"), [])).toBe(
      "“Plano trimestral” criado.",
    );
  });

  it("does not repeat the single-service or group prefix", () => {
    expect(guidedNotice(result("Serviço avulso Pilates", "single"), [])).toBe(
      "“Serviço avulso Pilates” criado.",
    );
    expect(
      guidedNotice(
        result("Pilates 2x semana", "recurring", "Turma da manhã"),
        groups("Turma da manhã"),
      ),
    ).toBe(
      "Plano “Pilates 2x semana” criado. Matrícula feita na Turma da manhã.",
    );
  });
});
