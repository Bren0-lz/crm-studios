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
    ["Como cancelar uma aula?", "cancelar-um-atendimento-agendado"],
    ["desmarcar sessão da aluna", "cancelar-um-atendimento-agendado"],
    ["Quero agendar uma aula de pilates", "AG02"],
    ["marcar um horário para a aluna", "AG02"],
    ["Como faço para agendar um atendimento para a cliente?", "AG02"],
    ["trocar minha senha", "MP02"],
    ["Como mudar a senha?", "MP02"],
    ["quem faltou na aula", "AG10"],
    ["ver parcelas atrasadas", "FI01"],
    [
      "Como dar baixa em parcela",
      "registrar-o-pagamento-de-uma-parcela-ja-recebida",
    ],
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
  // INT5: guia de conexão do conector MCP (depende da regeneração do manual-data.json).
  it.each([
    "conectar o claude ao manual mcp",
    "manual no claude",
    "conector mcp",
  ])("encontra o guia de conexão do Claude ao manual: %s", (query) => {
    const result = searchGuides(query);
    expect(result.status).toBe("guias_relacionados");
    expect(strong(query)).toContain("CF24");
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
  it.each([
    ["cancelei a aula por engano", "cancelar-um-atendimento-agendado"],
    ["remarquei a sessão da aluna", "AG07"],
    ["consulto o extrato como", "RL09"],
    ["desfaço a baixa como", "FI06"],
    // "sem querer" não conta: antes, o "sem" casava por acaso com "sem apagar de vez" do LX01.
    ["excluí um cliente sem querer", "LX03"],
    ["lancei uma despesa errada", "FI15"],
  ])("entende o verbo conjugado: %s", (query, id) => {
    expect(
      searchGuides(query)
        .guias.slice(0, 3)
        .map((guide) => guide.id),
    ).toContain(id);
  });
  it.each([
    ["não consigo entrar no CRM", "AC01"],
    ["não consigo agendar", "AG02"],
  ])('não descarta queixas com "não": %s', (query, id) => {
    expect(strong(query)).toContain(id);
  });
  it("dá aos tutoriais antigos ids derivados do título", () => {
    const legacy = (listGuides().areas ?? [])
      .flatMap((area) => listGuides(area.area).guias ?? [])
      .filter((guide) => !/^[A-Z]{2}\d{2}$/.test(guide.id));
    expect(legacy.length).toBeGreaterThan(0);
    for (const guide of legacy)
      expect(guide.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(legacy.map((guide) => guide.id)).not.toContainEqual(
      expect.stringMatching(/^tutorial-\d+$/),
    );
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

describe("confirmação do que a pessoa quis dizer", () => {
  it("não pede confirmação quando um guia responde a pergunta", () => {
    const result = searchGuides("cliente faltou, como marco a falta?");
    expect(result.confirmacao).toEqual({ necessaria: false });
    expect(result.entendimento.termosDesconhecidos).toEqual([]);
  });
  it.each([
    ["como trocar o aluno de turma", ["GR03", "CF18"]],
    ["como dar desconto", ["CL16", "FI30"]],
  ])(
    "pede para escolher quando guias fortes são de áreas diferentes: %s",
    (query, ids) => {
      const { status, confirmacao } = searchGuides(query);
      expect(status).toBe("guias_relacionados");
      expect(confirmacao).toMatchObject({
        necessaria: true,
        motivo: "varias_interpretacoes",
      });
      const options = "opcoes" in confirmacao ? confirmacao.opcoes : [];
      expect(options.map((option) => option.id)).toEqual(ids);
      expect(options[0]?.pergunta).toMatch(/^Você quer [a-z].*\?$/);
    },
  );
  it("sugere os guias parciais como opções em vez de supor em silêncio", () => {
    const { confirmacao } = searchGuides("como mandar lembrete pelo whatsapp");
    expect(confirmacao).toMatchObject({
      necessaria: true,
      motivo: "sem_guia_exato",
      opcoes: expect.arrayContaining([
        expect.objectContaining({
          id: "CO10",
          pergunta: "Você quer preparar lembrete de uma sessão pelo WhatsApp?",
        }),
      ]),
    });
  });
  it.each([
    ["como cadastrar uma nova professora", "professora"],
    ["onde vejo quem está devendo", "devendo"],
  ])(
    "aponta as palavras que o manual não conhece para o agente reformular: %s",
    (query, word) => {
      const result = searchGuides(query);
      expect(result.entendimento.termosDesconhecidos).toContain(word);
      expect(result.confirmacao).toMatchObject({ necessaria: true });
      expect(result.orientacao).toMatch(/Reformule/);
    },
  );
  it("'sem querer' não inverte o sentido nem vira termo desconhecido", () => {
    const result = searchGuides("cancelei um atendimento sem querer");
    expect(result.entendimento.termosDesconhecidos).toEqual([]);
    expect(result.guias[0]?.id).toBe("cancelar-um-atendimento-agendado");
  });
  it("busca pelo id não pede confirmação", () => {
    expect(searchGuides("AG07").confirmacao).toEqual({ necessaria: false });
  });
});
