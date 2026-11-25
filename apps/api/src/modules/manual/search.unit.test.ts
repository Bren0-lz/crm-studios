import { describe, expect, it } from "vitest";
import { listGuides, manualAreas, searchManual } from "./search.js";

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
    ["A fila da campanha permite registrar resposta de NPS?", "CO09"],
    ["Como ver os lançamentos de uma categoria da DRE?", "RL07"],
  ])("retorna o guia verificado para %s", (query, id) => {
    const { trechos } = searchManual(query);
    expect(trechos.map((chapter) => chapter.id)).toEqual([id]);
    expect(trechos[0]?.trecho).not.toContain("**Perguntas:**");
    expect(trechos[0]).not.toHaveProperty("perguntas");
  });
  it.each([
    ["como remarcar", "AG07"],
    ["Como cancelar uma aula?", "tutorial-1"],
    ["desmarcar sessão da aluna", "tutorial-1"],
    ["Quero agendar uma aula de pilates", "AG02"],
    ["marcar um horário para a aluna", "AG02"],
    ["Como faço para agendar um atendimento para a cliente?", "AG02"],
    ["trocar minha senha", "MP02"],
    ["Como mudar a senha?", "MP02"],
    ["quem faltou na aula", "AG10"],
    ["ver parcelas atrasadas", "FI01"],
    ["Como dar baixa em parcela", "tutorial-9"],
    ["nova cliente", "cadastrar-cliente"],
    ["Como apagar um cliente?", "LX03"],
    ["Como lançar uma despesa?", "FI15"],
    ["Como inativar uma aluna?", "CL13"],
    ["onde vejo o prontuário", "PR01"],
    ["imprimir contrato", "CT07"],
    ["Como estornar um pagamento?", "FI06"],
    ["reagendar a consulta da paciente", "AG07"],
    ["excluir etiqueta do cliente", "CF20"],
    ["como cadastrar um funcionário", "CF03"],
    ["como renegociar uma dívida", "FI12"],
  ])("entende outra formulação: %s", (query, id) => {
    const { status, trechos } = searchManual(query);
    expect(status).toBe("evidencia_encontrada");
    expect(trechos.length).toBeLessThanOrEqual(3);
    expect(trechos.map((chapter) => chapter.id)).toContain(id);
  });
  it.each([
    ["Como cancelar uma aula?", "AG02"],
    ["trocar minha senha", "CF06"],
    ["marcar presença da aluna", "AG02"],
    ["Como excluir um cliente?", "CF20"],
    ["Como apagar um cliente?", "CF20"],
  ])("não troca a ação pedida: %s", (query, id) => {
    expect(
      searchManual(query).trechos.map((chapter) => chapter.id),
    ).not.toContain(id);
  });
  it.each([
    "Como matricular cliente em turma sem vaga?",
    "Como emitir nota fiscal eletrônica?",
    "Como integrar com o Google Agenda?",
    "",
    "xyzzy 987654",
  ])("recusa evidência insuficiente: %s", (query) => {
    expect(searchManual(query)).toMatchObject({
      status: "evidencia_insuficiente",
      trechos: [],
    });
  });
  it("sugere títulos próximos sem tratá-los como evidência", () => {
    const result = searchManual(
      "Como oferecer uma vaga da Lista de espera e matricular?",
    );
    expect(result).toMatchObject({
      status: "evidencia_insuficiente",
      trechos: [],
    });
    expect(result.sugestoes.map((item) => item.id)).toContain("LE05");
    expect(result.sugestoes[0]).not.toHaveProperty("trecho");
  });
  it("lê o guia pelo id e lista todos os guias por área", () => {
    expect(searchManual("ag07").trechos.map((chapter) => chapter.id)).toEqual([
      "AG07",
    ]);
    const areas = listGuides().areas ?? [];
    const total = areas.reduce((sum, area) => sum + area.guias, 0);
    expect(total).toBe(
      manualAreas.reduce(
        (sum, area) => sum + listGuides(area).guias!.length,
        0,
      ),
    );
    expect(total).toBeGreaterThanOrEqual(241);
    expect(listGuides("OU").guias).toEqual([]);
  });
});
