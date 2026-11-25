import { describe, expect, it } from "vitest";
import { listGuides, manualAreas, readGuides, searchGuides } from "./search.js";

const strong = (query: string) =>
  searchGuides(query)
    .guias.filter((guide) => guide.aderencia === "alta")
    .map((guide) => guide.id);

describe("busca nos guias", () => {
  it("põe o guia de cadastro primeiro, sem confundir com venda de pacote", () => {
    const { guias } = searchGuides("Como cadastrar um novo cliente?");
    expect(guias[0]?.id).toBe("cadastrar-cliente");
    expect(guias[0]?.aderencia).toBe("alta");
  });
  it.each([
    ["Como cancelar um atendimento?", "Cancelar um atendimento agendado"],
    ["Como cadastrar um lead?", "Cadastrar uma pessoa interessada"],
    ["Como criar uma turma?", "Criar uma turma"],
    [
      "Como dar baixa em uma parcela?",
      "Registrar o pagamento de uma parcela já recebida",
    ],
  ])("põe a ação pertinente primeiro: %s", (query, title) => {
    expect(searchGuides(query).guias[0]?.titulo).toBe(title);
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
  ])("põe o guia da pergunta cadastrada primeiro: %s", (query, id) => {
    const { status, guias } = searchGuides(query);
    expect(status).toBe("guias_relacionados");
    expect(guias[0]?.id).toBe(id);
    expect(guias[0]).not.toHaveProperty("trecho");
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
    ["como importar feriados", "CF14"],
    ["como editar uma etiqueta automática", "CF20"],
    ["anexar comprovante na parcela", "FI07"],
    ["editar dados do usuário", "CF05"],
    ["como cadastrar um funcionário", "CF03"],
    ["como renegociar uma dívida", "FI12"],
  ])("entende outra formulação: %s", (query, id) => {
    const result = searchGuides(query);
    expect(result.status).toBe("guias_relacionados");
    expect(result.guias.length).toBeLessThanOrEqual(8);
    expect(strong(query)).toContain(id);
  });
  it.each([
    ["Como cancelar uma aula?", "AG02"],
    ["trocar minha senha", "CF06"],
    ["marcar presença da aluna", "AG02"],
    ["Como excluir um cliente?", "CF20"],
    ["Como apagar um cliente?", "CF20"],
    ["Como dar baixa em parcela", "FI06"],
    ["importar feriados", "CF13"],
  ])("não marca como alta a ação trocada: %s", (query, id) => {
    expect(strong(query)).not.toContain(id);
  });
  it.each([
    "Como matricular cliente em turma sem vaga?",
    "Como emitir nota fiscal eletrônica?",
    "Como integrar com o Google Agenda?",
  ])("avisa quando nenhum guia trata da tarefa: %s", (query) => {
    const result = searchGuides(query);
    expect(result.status).not.toBe("guias_relacionados");
    expect(strong(query)).toEqual([]);
    expect(result.orientacao).toMatch(/não cobre|não tem nada/);
  });
  it.each(["", "xyzzy 987654"])("não devolve nada sem termos: %j", (query) => {
    expect(searchGuides(query)).toMatchObject({
      status: "nenhum_guia",
      guias: [],
    });
  });
  it("traz guias parciais para o agente avaliar", () => {
    const result = searchGuides(
      "Como oferecer uma vaga da Lista de espera e matricular?",
    );
    expect(result.guias.map((guide) => guide.id)).toContain("LE05");
  });
  it("lê vários guias inteiros pelo id e aponta os ids desconhecidos", () => {
    expect(searchGuides("ag07").guias.map((guide) => guide.id)).toEqual([
      "AG07",
    ]);
    const result = readGuides(["ag07", "CL13", "ZZ99", "AG07"]);
    expect(result.guias.map((guide) => guide.id)).toEqual(["AG07", "CL13"]);
    expect(result.guias[0]?.trecho).toContain("Remarcar");
    expect(result.guias[0]?.trecho).not.toContain("**Perguntas:**");
    expect(result.guias[0]?.referencias.length).toBeGreaterThan(0);
    expect(result.naoEncontrados).toEqual(["zz99"]);
  });
  it("lista todos os guias por área", () => {
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
