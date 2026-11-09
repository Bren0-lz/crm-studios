import { describe, expect, it } from "vitest";
import { withPrefix, withQuotedPrefix } from "../index.js";

describe("withPrefix", () => {
  it("adds the prefix to a name that does not start with it", () => {
    expect(withPrefix("Sala", "Pilates")).toBe("Sala Pilates");
    expect(withPrefix("Turma", "Pilates Turma A")).toBe(
      "Turma Pilates Turma A",
    );
  });

  it("does not repeat a prefix the name already has, ignoring case and accents", () => {
    expect(withPrefix("Sala", "Sala de Dança")).toBe("Sala de Dança");
    expect(withPrefix("Sala", "sala 2")).toBe("sala 2");
    expect(withPrefix("Plano", "PLANO trimestral")).toBe("PLANO trimestral");
    expect(withPrefix("turma", "Turma da manhã")).toBe("Turma da manhã");
    expect(withPrefix("Estúdio", "Estudio 1")).toBe("Estudio 1");
    expect(withPrefix("Sala", "  Sala Movimento ")).toBe("Sala Movimento");
  });

  it("only treats the prefix as repeated when it is a whole word", () => {
    expect(withPrefix("Sala", "Salão principal")).toBe("Sala Salão principal");
    expect(withPrefix("Plano", "Planos família")).toBe("Plano Planos família");
  });

  it("keeps just the prefix when the name is empty", () => {
    expect(withPrefix("Sala", "  ")).toBe("Sala");
  });
});

describe("withQuotedPrefix", () => {
  it("quotes the name and keeps the prefix only when it is not repeated", () => {
    expect(withQuotedPrefix("Modelo", "Anamnese")).toBe("Modelo “Anamnese”");
    expect(withQuotedPrefix("Modelo", "Modelo padrão")).toBe("“Modelo padrão”");
    expect(withQuotedPrefix("Centro de custo", "centro de custo geral")).toBe(
      "“centro de custo geral”",
    );
    expect(withQuotedPrefix("etapa", "Etapa final", ['"', '"'])).toBe(
      '"Etapa final"',
    );
    expect(withQuotedPrefix("etapa", "Perdido", ['"', '"'])).toBe(
      'etapa "Perdido"',
    );
  });
});
