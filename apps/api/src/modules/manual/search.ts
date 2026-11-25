import data from "./manual-data.json" with { type: "json" };

type Chapter = (typeof data.capitulos)[number];

// Palavras que não ajudam a escolher o guia.
const stop = new Set(
  (
    "a o os as um uma uns umas de do da dos das no na nos nas num numa para pra por pelo pela pelos pelas e ou em com ao aos " +
    "como que qual quais quando onde porque por que se ja eu me meu minha meus minhas seu sua isso esse essa este esta " +
    "faco fazer faz posso pode consigo preciso quero queria gostaria devo tenho tem ter da sobre tela crm organiza studios " +
    "aqui la ele ela dele dela lhe nele nela outro outra mais ainda so quem dar fica ficam " +
    // Serviços e modalidades são cadastro da clínica, não muda o passo a passo.
    "pilates dancaterapia depilacao fisioterapia"
  ).split(" "),
);

// Sinônimos que a equipe usa; o primeiro termo é o canônico.
const groups: string[][] = [
  ["cliente", "client", "aluno", "aluna", "paciente"],
  ["atendimento", "aula", "sessao", "consulta", "agendamento"],
  ["agendar", "agendo"],
  ["cancelar", "desmarcar", "cancelamento", "cancelo", "desmarco"],
  ["remarcar", "reagendar", "remarcacao", "reagendamento", "remarco"],
  ["excluir", "apagar", "deletar", "remover", "exclusao", "excluo", "apago"],
  [
    "criar",
    "cadastrar",
    "adicionar",
    "incluir",
    "registrar",
    "lancar",

    "crio",
    "cadastro_acao",
    "lanco",
    "registro_acao",
  ],
  [
    "editar",
    "alterar",
    "mudar",
    "trocar",
    "atualizar",
    "corrigir",
    "modificar",
    "mudo",
    "troco",
    "altero",
    "edito",
  ],
  [
    "ver",
    "vejo",
    "consultar",
    "conferir",
    "visualizar",
    "localizar",
    "encontrar",
    "buscar",
    "procurar",
    "achar",
    "pesquisar",
    "acho",
    "confiro",
  ],
  ["pagamento", "baixa", "quitar", "pago", "paga", "pagar"],
  ["estornar", "estorno", "desfazer", "reembolso", "devolver"],
  ["inativar", "desativar", "inativo", "inativa"],
  ["reativar", "reativo"],
  ["lead", "interessado", "interessada", "prospect"],
  ["whatsapp", "zap", "wpp", "whats"],
  ["enviar", "mandar", "envio", "mando", "envie"],
  ["vencida", "vencido", "atrasada", "atrasado", "atraso", "vencimento_atraso"],
  ["falta", "faltou", "faltar", "ausencia", "faltaram"],
  ["receita", "faturamento", "faturei", "recebimento"],
  ["matricular", "matricula", "matriculo", "inscrever"],
  ["novo", "nova", "novos", "novas"],
  ["usuario", "funcionario", "funcionaria", "colaborador", "colaboradora"],
  ["parcela", "divida", "debito", "mensalidade"],
  ["senha", "password"],
  ["imprimir", "impressao", "imprimo"],
  ["exportar", "exportacao", "baixar_arquivo"],
  ["turma", "grupo"],
];
const canonical = new Map<string, string>();
for (const group of groups)
  for (const word of group) canonical.set(word, group[0]!);

// Ações que mudam o passo a passo: o guia precisa tratar da mesma ação.
const actions = new Set([
  "agendar",
  "cancelar",
  "remarcar",
  "excluir",
  "criar",
  "editar",
  "estornar",
  "inativar",
  "reativar",
  "matricular",
  "exportar",
  "importar",
  "imprimir",
  "assinar",
  "enviar",
  "emitir",
  "pagamento",
]);
// Ações que desfazem ou trocam algo: guia com uma delas no título só serve se a consulta pedir.
const reversals = [
  "estornar",
  "cancelar",
  "excluir",
  "inativar",
  "reativar",
  "remarcar",
];
// Palavras que invertem o sentido ("turma sem vaga" não é "turma com vaga").
const polarity = new Set(["sem", "nao", "nunca", "nenhum", "nenhuma"]);

function stem(word: string) {
  const known = canonical.get(word);
  if (known) return known;
  let w = word;
  if (w.endsWith("oes") || w.endsWith("aes")) w = w.slice(0, -3) + "ao";
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return canonical.get(w) ?? w;
}

function words(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  ).filter((word) => !stop.has(word));
}
function tokens(text: string) {
  return [...new Set(words(text).map(stem))];
}
/** Sem sinônimos: "onde vejo" e "como buscar" são perguntas diferentes. */
function literal(text: string) {
  return [...new Set(words(text).map((word) => word.replace(/s$/, "")))];
}

function queryKey(words: string[]) {
  return [...words].sort().join(" ");
}

const index = data.capitulos.map((chapter) => {
  const aliases =
    chapter.trecho.match(/\*\*Também perguntam:\*\*([^\n]+)/)?.[1] ?? "";
  const questions = "perguntas" in chapter ? chapter.perguntas : [];
  const intentText = [chapter.titulo, aliases, ...questions].join(" ");
  return {
    chapter,
    title: new Set(tokens(chapter.titulo)),
    intent: new Set(tokens(intentText)),
    body: new Set(tokens(chapter.trecho)),
    keys: new Set(
      [chapter.titulo, ...questions].map((question) =>
        queryKey(literal(question)),
      ),
    ),
  };
});
const documentFrequency = new Map<string, number>();
for (const entry of index)
  for (const word of new Set([...entry.intent, ...entry.body]))
    documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
const idf = (word: string) =>
  Math.log(1 + index.length / (documentFrequency.get(word) ?? 0.5));

function rank(words: string[]) {
  const total = words.reduce((sum, word) => sum + idf(word), 0);
  return index
    .map((entry) => {
      let score = 0;
      let matched = 0;
      for (const word of words) {
        if (entry.intent.has(word)) {
          score += idf(word) * (entry.title.has(word) ? 4 : 3);
          matched += idf(word);
        } else if (entry.body.has(word)) {
          score += idf(word);
          matched += idf(word) * 0.5;
        }
      }
      // Desempate: título mais específico para a consulta vem antes.
      const titleWords = [...entry.title];
      score +=
        titleWords.filter((word) => words.includes(word)).length /
        Math.max(1, titleWords.length);
      const fits =
        words.every(
          (word) =>
            !(actions.has(word) || polarity.has(word)) ||
            entry.intent.has(word),
        ) &&
        (!reversals.some((action) => entry.title.has(action)) ||
          reversals.some(
            (action) => entry.title.has(action) && words.includes(action),
          ));
      return { entry, score, coverage: total ? matched / total : 0, fits };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function find(consulta: string) {
  const byId = index.find(
    (entry) => entry.chapter.id.toLowerCase() === consulta.trim().toLowerCase(),
  );
  if (byId) return { found: [byId.chapter], suggestions: [] as Chapter[] };
  const words = tokens(consulta);
  if (!words.length)
    return { found: [] as Chapter[], suggestions: [] as Chapter[] };
  const key = queryKey(literal(consulta));
  const exact = index.filter((entry) => entry.keys.has(key));
  if (exact.length === 1)
    return { found: [exact[0]!.chapter], suggestions: [] };
  const ranked = rank(words);
  const accepted = ranked.filter((item) => item.fits && item.coverage >= 0.75);
  const best = accepted[0]?.score ?? 0;
  const found = accepted
    .filter((item) => item.score >= best * 0.8)
    .slice(0, 3)
    .map((item) => item.entry.chapter);
  const suggestions = found.length
    ? []
    : ranked.slice(0, 5).map((item) => item.entry.chapter);
  return { found, suggestions };
}

export function searchManual(consulta: string) {
  const { found, suggestions } = find(consulta);
  return {
    status: found.length ? "evidencia_encontrada" : "evidencia_insuficiente",
    revisao: { fontes: data.revisao, material: `sha256:${data.material}` },
    cobertura:
      "Parcial. Somente tutoriais auditados cujas fontes conferem com o build. A revisão da URL publicada precisa ser conferida no deploy.",
    orientacao:
      "Responda em português do Brasil, com passos curtos e os nomes exatos dos botões e campos confirmados nos trechos. Use somente evidência pertinente. Se os trechos não responderem à pergunta ou faltarem passos, diga explicitamente o que não foi confirmado. Não peça dados pessoais.",
    mensagem: found.length
      ? "Confira as condições e os limites dos trechos antes de orientar."
      : "Não encontrei evidência suficiente no conteúdo de ajuda disponível para esta consulta. Não invente passos. Se um dos títulos em sugestoes corresponder à tarefa, consulte de novo pelo id dele; senão, use listar_guias ou peça uma descrição da tela, sem dados pessoais.",
    trechos: found.map(({ id, titulo, trecho, referencias }) => ({
      id,
      titulo,
      trecho,
      referencias,
    })),
    sugestoes: suggestions.map(({ id, titulo }) => ({ id, titulo })),
  };
}

const areaNames: Record<string, string> = {
  AC: "Acesso ao CRM",
  VG: "Visão geral",
  AG: "Agenda",
  CL: "Clientes",
  PR: "Prontuário",
  LX: "Lixeira de clientes",
  PL: "Planos e sessões",
  GR: "Turmas",
  LE: "Lista de espera",
  EV: "Eventos",
  CM: "Comercial e leads",
  RE: "Retorno de clientes",
  CO: "Comunicações",
  CT: "Contratos e documentos",
  AS: "Assinatura por link",
  VE: "Vendas de produtos",
  FI: "Financeiro",
  RL: "Relatórios",
  HI: "Histórico de alterações",
  CF: "Configurações",
  MP: "Meu perfil",
  OU: "Outros guias",
};
export const manualAreas = Object.keys(areaNames) as [string, ...string[]];
// Tutoriais anteriores aos guias verificados não têm sigla no id.
const legacyAreas: Record<string, string> = {
  "cadastrar-cliente": "CL",
  "Cancelar um atendimento agendado": "AG",
  "Cadastrar uma pessoa interessada": "CM",
  "Transformar uma pessoa interessada em cliente": "CM",
  "Criar uma turma": "GR",
  "Abrir os dados e a frequência de uma turma": "GR",
  "Colocar um cliente na espera de uma turma cheia": "LE",
  "Contratar um pacote já cadastrado para um cliente": "PL",
  "Colocar um cliente na fila por um serviço": "LE",
  "Registrar o pagamento de uma parcela já recebida": "FI",
};
function areaOf(chapter: Chapter) {
  const prefix = /^([A-Z]{2})\d{2}$/.exec(chapter.id)?.[1];
  return (
    prefix ?? legacyAreas[chapter.id] ?? legacyAreas[chapter.titulo] ?? "OU"
  );
}

/** Índice do manual: áreas com a quantidade de guias, ou os guias de uma área. */
export function listGuides(area?: string) {
  const revisao = { fontes: data.revisao, material: `sha256:${data.material}` };
  if (!area)
    return {
      revisao,
      orientacao:
        "Escolha a área e chame listar_guias de novo com ela. Depois use consultar_manual_crm com o id do guia.",
      areas: manualAreas.map((code) => ({
        area: code,
        nome: areaNames[code]!,
        guias: data.capitulos.filter((chapter) => areaOf(chapter) === code)
          .length,
      })),
    };
  return {
    revisao,
    orientacao:
      "Para ler um guia, chame consultar_manual_crm com o id dele. Os títulos não substituem os passos do guia.",
    area,
    nome: areaNames[area] ?? area,
    guias: data.capitulos
      .filter((chapter) => areaOf(chapter) === area)
      .map((chapter) => ({
        id: chapter.id,
        titulo: chapter.titulo,
        perguntas: "perguntas" in chapter ? chapter.perguntas : [],
      })),
  };
}
