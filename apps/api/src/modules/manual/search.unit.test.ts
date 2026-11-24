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
    ["Como entrar no CRM?", "AC01"],
    ["Onde fica o menu no celular?", "AC03"],
    ["Como localizar uma aluna sem mexer em nada?", "CL01"],
    ["Como abro a ficha do cliente?", "CL04"],
    ["Como alterar o telefone do cliente?", "CL05"],
    ["Como reativar um cliente?", "CL13"],
    ["Como agendar um atendimento?", "AG02"],
    ["Onde confiro o horário de um atendimento?", "AG05"],
    ["Como remarcar um atendimento?", "AG07"],
    ["Como matricular um aluno quando tem vaga?", "GR04"],
    ["Onde vejo os participantes de um evento?", "EV01"],
    ["Como cadastrar um evento?", "EV02"],
    ["Como mudar o local de um evento?", "EV03"],
    ["Como adicionar um participante ao evento?", "EV05"],
    ["Como buscar um participante de evento?", "EV06"],
    ["Como consultar relatórios por período?", "RL01"],
    ["Como lançar uma receita manual?", "FI11"],
    ["Como filtrar parcelas vencidas?", "FI01"],
    ["Como exportar clientes?", "CL11"],
    ["Como assinar um recibo pelo celular?", "AS02"],
    ["Como desfazer a baixa de uma parcela?", "FI06"],
    ["Como vender uma sessão avulsa para um cliente?", "PL04"],
    ["Onde vejo as parcelas na ficha do cliente?", "PL11"],
  ])("retorna o guia verificado para %s", (query, id) => {
    const { trechos } = searchManual(query);
    expect(trechos.map((chapter) => chapter.id)).toEqual([id]);
    expect(trechos[0]?.trecho).not.toContain("**Perguntas:**");
    expect(trechos[0]).not.toHaveProperty("perguntas");
  });
  it.each([
    "Como apagar um cliente?",
    "Como matricular cliente em turma sem vaga?",
    "Como oferecer uma vaga da Lista de espera e matricular?",
    "Como emitir nota fiscal eletrônica?",
    "",
    "xyzzy 987654",
  ])("recusa evidência insuficiente: %s", (query) => {
    expect(searchManual(query)).toMatchObject({
      status: "evidencia_insuficiente",
      trechos: [],
    });
  });
});
