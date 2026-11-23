import { describe, expect, it } from "vitest";
import { searchManual } from "./search.js";

describe("evidência de ajuda", () => {
  it("distingue cadastrar cliente de vender um pacote cadastrado", () => {
    const result = searchManual("Como cadastrar um novo cliente?");
    expect(result.trechos.map((t) => t.id)).toEqual(["cadastrar-cliente"]);
  });
  it.each([
    ["Como cancelar um atendimento?", "Cancelar um atendimento agendado"],
    ["Como cadastrar um lead?", "Cadastrar uma pessoa interessada"],
    ["Como criar uma turma?", "Criar uma turma"],
    [
      "Como dar baixa em uma parcela?",
      "Registrar o pagamento de uma parcela já recebida",
    ],
  ])("localiza a ação pertinente: %s", (query, title) => {
    expect(searchManual(query).trechos[0]?.titulo).toBe(title);
  });
  it.each([
    "Como apagar um cliente?",
    "Como agendar um atendimento?",
    "Como cadastrar um evento?",
    "Como remarcar um atendimento?",
    "Como emitir nota fiscal eletrônica?",
    "Como exportar clientes?",
    "",
    "xyzzy 987654",
  ])("recusa evidência insuficiente: %s", (query) => {
    expect(searchManual(query)).toMatchObject({
      status: "evidencia_insuficiente",
      trechos: [],
    });
  });
});
