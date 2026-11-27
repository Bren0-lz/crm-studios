import type { data as material } from "./material.js";

type Chapter = (typeof material.capitulos)[number];

// Palavras que não ajudam a escolher o guia.
const stop = new Set(
  (
    "a o os as um uma uns umas de do da dos das no na nos nas num numa para pra por pelo pela pelos pelas e ou em com ao aos " +
    "como que qual quais quando onde porque por que se ja eu me meu minha meus minhas seu sua isso esse essa este esta " +
    "faco fazer faz posso pode consigo preciso quero queria gostaria devo tenho tem ter da sobre tela crm organiza studios " +
    "aqui la ele ela dele dela lhe nele nela outro outra mais ainda so quem dar fica ficam nao " +
    "to ta tava pro pros pras alguem gente entao agora dai aquilo mesma mesmo tambem " +
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
  [
    "excluir",
    "apagar",
    "deletar",
    "remover",
    "exclusao",
    "excluo",
    "exclui",
    "apago",
  ],
  [
    "criar",
    "cadastrar",
    "adicionar",
    "incluir",
    "registrar",
    "lancar",
    "crio",
    "lanco",
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
  ["estornar", "estorno", "desfazer", "desfaco", "reembolso", "devolver"],
  ["inativar", "desativar", "inativo", "inativa"],
  ["reativar", "reativo"],
  ["lead", "interessado", "interessada", "prospect"],
  ["whatsapp", "zap", "wpp", "whats"],
  ["enviar", "mandar", "envio", "mando", "envie"],
  ["vencida", "vencido", "atrasada", "atrasado", "atraso"],
  ["falta", "faltou", "faltar", "ausencia", "faltaram"],
  ["receita", "faturamento", "faturei", "recebimento"],
  ["matricular", "matricula", "matriculo", "inscrever"],
  ["novo", "nova", "novos", "novas"],
  ["usuario", "funcionario", "funcionaria", "colaborador", "colaboradora"],
  ["parcela", "divida", "debito", "mensalidade"],
  ["senha", "password"],
  ["imprimir", "impressao", "imprimo"],
  ["exportar", "exportacao"],
  ["turma", "grupo", "classe", "turmma"],
  ["evento", "workshop", "aulao"],
  ["planilha", "excel"],
  ["fila", "espera"],
  ["profissional", "instrutora", "instrutor", "prof", "professor"],
  ["finalizar", "terminei", "encerra", "terminar", "finalize"],
  ["aniversariante", "aniversario"],
  ["renovar", "renove", "renovacao"],
  ["automatico", "automaticamente", "sozinho", "sozinha"],
  ["notificacao", "sininho", "aviso", "alerta"],
  ["unidade", "filial"],
  ["pausar", "congelar", "pausa"],
  ["plano", "pacote"],
  ["parcial", "metade", "pedaco"],
  ["desconto", "abatimento"],
  ["lotada", "lotou", "cheia", "lotado", "cheio"],
  ["reposicao", "repor", "compensar"],
  ["assinatura", "assinou", "assinada", "assinado"],
  ["frequencia", "chamada"],
  ["recorrente", "repetir", "repete"],
  ["substituta", "substituto", "substituir"],
  ["telefone", "fone"],
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
// Ações que desfazem ou trocam algo: guia com uma delas no título só serve se a consulta pedir
// alguma das ações do título ("Importar ou excluir feriados" serve para "importar feriados").
const reversals = [
  "estornar",
  "cancelar",
  "excluir",
  "inativar",
  "reativar",
  "remarcar",
];
// Palavra que inverte o sentido ("turma sem vaga" não é "turma com vaga"). "Não" fica de fora:
// aparece em queixas ("não consigo entrar") que não invertem a tarefa.
const polarity = new Set(["sem"]);

// Verbo conjugado ("cancelei", "agendou", "consulto") vira o infinitivo, mas só quando o
// infinitivo é um termo conhecido: "plano" não vira "planar".
const conjugations: Array<[RegExp, string]> = [
  [/quei$/, "car"],
  [/guei$/, "gar"],
  [/cei$/, "car"],
  [/ei$/, "ar"],
  [/ou$/, "ar"],
  [/o$/, "ar"],
  [/i$/, "ir"],
];
function infinitive(word: string) {
  for (const [ending, replacement] of conjugations) {
    if (!ending.test(word)) continue;
    const verb = word.replace(ending, replacement);
    const known = canonical.get(verb) ?? (actions.has(verb) ? verb : undefined);
    if (known) return known;
  }
  return undefined;
}

function stem(word: string) {
  const known = canonical.get(word);
  if (known) return known;
  let w = word;
  if (w.endsWith("oes") || w.endsWith("aes")) w = w.slice(0, -3) + "ao";
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return canonical.get(w) ?? infinitive(w) ?? w;
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function phrase(text: string) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(text: string) {
  return (
    (
      normalize(text)
        // "Cancelei sem querer" não pede um guia "sem" alguma coisa.
        .replace(/\b(sem querer|por engano|por erro)\b/g, " ")
        .match(/[a-z0-9]+/g) ?? []
    ).filter((word) => !stop.has(word))
  );
}
function tokens(text: string) {
  // "Conta a pagar" e "conta a receber" identificam lados diferentes do financeiro.
  const normalized = normalize(text)
    .replace(/\b(?:deu (?:um )?bolo|nao (?:veio|compareceu))\b/g, "falta")
    .replace(/\b(?:conta de (?:luz|agua)|aluguel)\b/g, "despesa")
    .replace(/\b(?:aula coletiva|aula em grupo)\b/g, "aula turma")
    .replace(/\b(?:voltar|volto) atras\b/g, "desfazer")
    .replace(/\b(?:horarios?|datas?) anteriores\b/g, "historico remarcacao")
    .replace(/\bvirar cliente\b/g, "converter cliente")
    .replace(/\b(?:fechou|fechar) comigo\b/g, "converter lead")
    .replace(/\bcontas? a pagar\b/g, "despesa")
    .replace(/\bcontas? a receber\b/g, "recebimento");
  return [...new Set(words(normalized).map(stem))];
}
/** Sem sinônimos: "onde vejo" e "como buscar" são perguntas diferentes. */
function literal(text: string) {
  return [...new Set(words(text).map((word) => word.replace(/s$/, "")))];
}

const prepositions = new Set(["de", "do", "da", "dos", "das"]);
const articles = new Set(["um", "uma", "uns", "umas", "o", "a", "os", "as"]);
/**
 * Palavras que são o assunto da frase, e não complemento: em "excluir uma etiqueta de
 * cliente" o assunto é a etiqueta; "cliente" só vem depois de "de".
 */
function heads(text: string) {
  const all = normalize(text).match(/[a-z0-9]+/g) ?? [];
  const result = new Set<string>();
  let afterPreposition = false;
  for (const word of all) {
    if (prepositions.has(word)) {
      afterPreposition = true;
      continue;
    }
    if (articles.has(word)) continue;
    if (!afterPreposition && !stop.has(word)) result.add(stem(word));
    afterPreposition = false;
  }
  return result;
}

function queryKey(words: string[]) {
  return [...words].sort().join(" ");
}

// Para pedidos curtos que omitem o objeto da ação, ofereça apenas os caminhos pertinentes.
// A chave inclui todos os termos da consulta: especificar "contrato" ou "turma" sai da regra.
function clarificationKey(text: string) {
  const key = queryKey(
    tokens(text).filter((word) => !["celular", "whatsapp"].includes(word)),
  );
  return /\bnao\b/.test(normalize(text)) ? `nao ${key}` : key;
}

const clarificationKeys = new Map<
  string,
  { question: string; ids: string[] }
>();
for (const [examples, question, ids] of [
  [
    [
      "mandar link para assinatura",
      "enviar link para assinar",
      "compartilhar link de assinatura",
    ],
    "Qual documento você quer enviar para assinatura: contrato ou recibo?",
    ["CT08", "FI09"],
  ],
  [
    ["link de assinatura"],
    "Você quer enviar um documento ou assinar um link que recebeu? É um contrato ou um recibo?",
    ["CT08", "FI09", "AS01", "AS02"],
  ],
  [
    [
      "subo planilha",
      "subir planilha",
      "importar planilha",
      "importo planilha",
      "carregar planilha",
    ],
    "A planilha tem clientes, leads ou participantes de um evento?",
    ["CL10", "CM13", "EV07"],
  ],
  [
    [
      "marcar falta",
      "registrar falta",
      "lançar falta",
      "marco falta",
      "cliente faltou como marco a falta",
      "marcar falta da aluna",
      "registrar falta de aluno",
      "marco falta do aluno",
    ],
    "A falta foi em um atendimento individual ou em uma aula de turma?",
    ["AG10", "GR07"],
  ],
  [
    ["agenda não aparece", "agenda sumiu", "agenda desapareceu"],
    "O que está faltando: o menu Agenda, a agenda de outro profissional ou um evento comercial?",
    ["AC03", "AG01", "AG25"],
  ],
  [
    ["mudar turma"],
    "Você quer transferir um aluno para outra turma ou alterar os dados da própria turma?",
    ["GR13", "GR03"],
  ],
  [
    ["estornar pagamento"],
    "O valor foi pago a um fornecedor ou recebido de um cliente?",
    ["FI20", "FI06"],
  ],
] satisfies [string[], string, string[]][]) {
  for (const example of examples)
    clarificationKeys.set(clarificationKey(example), { question, ids });
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
// Tutoriais anteriores aos guias verificados não têm sigla: o id vem do título.
const legacyAreas: Record<string, string> = {
  "cadastrar-cliente": "CL",
  "cancelar-um-atendimento-agendado": "AG",
  "cadastrar-uma-pessoa-interessada": "CM",
  "transformar-uma-pessoa-interessada-em-cliente": "CM",
  "criar-uma-turma": "GR",
  "abrir-os-dados-e-a-frequencia-de-uma-turma": "GR",
  "colocar-um-cliente-na-espera-de-uma-turma-cheia": "LE",
  "contratar-um-pacote-ja-cadastrado-para-um-cliente": "PL",
  "colocar-um-cliente-na-fila-por-um-servico": "LE",
  "registrar-o-pagamento-de-uma-parcela-ja-recebida": "FI",
};
function areaOf(chapter: Chapter) {
  const prefix = /^([A-Z]{2})\d{2}$/.exec(chapter.id)?.[1];
  return prefix ?? legacyAreas[chapter.id] ?? "OU";
}

export function createManualCatalog(
  data: Pick<typeof material, "capitulos" | "material" | "revisao">,
) {
  const index = data.capitulos.map((chapter) => {
    const aliases =
      chapter.trecho.match(/\*\*Também perguntam:\*\*([^\n]+)/)?.[1] ?? "";
    const questions = "perguntas" in chapter ? chapter.perguntas : [];
    const intentText = [chapter.titulo, aliases, ...questions].join(" ");
    return {
      chapter,
      title: new Set(tokens(chapter.titulo)),
      // Verbos no infinitivo do título: "baixa" e "paga" não contam como ação.
      titleVerbs: new Set(
        words(chapter.titulo)
          .filter((word) => /(ar|er|ir)$/.test(word))
          .map(stem),
      ),
      intent: new Set(tokens(intentText)),
      heads: new Set(
        [chapter.titulo, aliases, ...questions].flatMap((text) => [
          ...heads(text),
        ]),
      ),
      body: new Set(tokens(chapter.trecho)),
      phrases: new Set([chapter.titulo, ...questions].map(phrase)),
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
        let intentMatches = 0;
        let distinctive = false;
        for (const word of words) {
          if (entry.intent.has(word)) {
            intentMatches++;
            if ((documentFrequency.get(word) ?? index.length) <= 3)
              distinctive = true;
            // Complemento ("etiqueta de cliente") pesa metade do assunto.
            score +=
              idf(word) *
              (entry.title.has(word) ? 4 : 3) *
              (entry.heads.has(word) ? 1 : 0.5);
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
          (!words.includes("estornar") ||
            !words.includes("despesa") ||
            entry.intent.has("despesa")) &&
          words.every(
            (word) =>
              !(actions.has(word) || polarity.has(word)) ||
              entry.intent.has(word),
          ) &&
          (!reversals.some((action) => entry.titleVerbs.has(action)) ||
            [...entry.titleVerbs].some((verb) => words.includes(verb)));
        return {
          entry,
          score,
          coverage: total ? matched / total : 0,
          fits,
          intentMatches,
          distinctive,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /** Índice do manual: áreas com a quantidade de guias, ou os guias de uma área. */
  function listGuides(area?: string) {
    const revisao = {
      fontes: data.revisao,
      material: `sha256:${data.material}`,
    };
    if (!area)
      return {
        revisao,
        orientacao:
          "Escolha a área e chame listar_guias de novo com ela. Depois leia os guias com ler_guias.",
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
        "Para ler um guia, chame ler_guias com o id dele. Os títulos não substituem os passos do guia.",
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

  const revision = () => ({
    fontes: data.revisao,
    material: `sha256:${data.material}`,
  });

  /**
   * Guias mais próximos da consulta, para o agente escolher o que ler. Não decide sozinho se o
   * guia responde: marca a aderência ("alta" quando cobre a tarefa e a ação pedidas).
   */
  function searchGuides(consulta: string, limite = 8) {
    const byId = index.find(
      (entry) =>
        entry.chapter.id.toLowerCase() === consulta.trim().toLowerCase(),
    );
    const words = tokens(consulta);
    // Pergunta igual a uma cadastrada (sem sinônimos) vai para o topo.
    const key = queryKey(literal(consulta));
    const clarification = byId
      ? undefined
      : clarificationKeys.get(clarificationKey(consulta));
    const exact = phrase(consulta);
    const ranked = byId
      ? [{ entry: byId, score: 1, coverage: 1, fits: true }]
      : clarification
        ? clarification.ids.flatMap((id) => {
            const entry = index.find((item) => item.chapter.id === id);
            return entry ? [{ entry, score: 0, coverage: 0, fits: false }] : [];
          })
        : words.length
          ? rank(words)
              .map((item) =>
                item.entry.phrases.has(exact)
                  ? {
                      ...item,
                      fits: true,
                      coverage: 1,
                      score: item.score + 2000,
                    }
                  : item,
              )
              // Em frases longas, vocabulário desconhecido reduz a confiança. Ainda vale
              // mostrar um guia parcial quando vários termos da tarefa coincidem.
              .filter(
                (item) =>
                  item.coverage >= 0.3 ||
                  item.intentMatches >= 2 ||
                  item.distinctive,
              )
              // Ação diferente da pedida continua na lista, mas atrás das que servem.
              .map((item) => ({
                ...item,
                score:
                  (item.fits ? item.score : item.score / 2) +
                  (key && item.entry.keys.has(key) ? 1000 : 0),
              }))
              .sort((a, b) => b.score - a.score)
          : [];
    // "Alta": cobre a tarefa e a ação pedidas e pontua perto do melhor desses guias.
    const best = ranked.find(
      (item) => item.fits && item.coverage >= 0.75,
    )?.score;
    const isStrong = (item: (typeof ranked)[number]) =>
      best !== undefined &&
      item.fits &&
      item.coverage >= 0.75 &&
      item.score >= best * 0.85;
    // Uma correspondência parcial não deve esconder um guia forte mais abaixo na lista.
    const candidates = ranked
      .sort((a, b) => Number(isStrong(b)) - Number(isStrong(a)))
      .slice(0, limite)
      .map((item) => ({
        id: item.entry.chapter.id,
        titulo: item.entry.chapter.titulo,
        area: areaOf(item.entry.chapter),
        aderencia: isStrong(item) ? ("alta" as const) : ("parcial" as const),
        perguntas: (
          ("perguntas" in item.entry.chapter
            ? item.entry.chapter.perguntas
            : []) as string[]
        ).slice(0, 3),
      }));
    const strongOnes = candidates.filter((item) => item.aderencia === "alta");
    const status = strongOnes.length
      ? "guias_relacionados"
      : candidates.length
        ? "so_guias_parciais"
        : "nenhum_guia";
    const termosDesconhecidos = byId ? [] : unknownWords(consulta);
    // Além das ambiguidades conhecidas, confirme quando houver guias fortes em áreas distintas.
    const motivo =
      status === "nenhum_guia"
        ? ("nenhum_guia" as const)
        : clarification
          ? ("varias_interpretacoes" as const)
          : status === "so_guias_parciais"
            ? ("sem_guia_exato" as const)
            : new Set(strongOnes.map((item) => item.area)).size > 1
              ? ("varias_interpretacoes" as const)
              : undefined;
    const options = (strongOnes.length > 1 ? strongOnes : candidates).slice(
      0,
      4,
    );
    return {
      status,
      revisao: revision(),
      orientacao:
        motivo === "varias_interpretacoes"
          ? "A consulta tem mais de uma interpretação no CRM. Antes de dar os passos, pergunte à pessoa qual delas ela quis dizer, usando as opções de confirmacao."
          : status === "guias_relacionados"
            ? "Leia com ler_guias os guias pertinentes (os de aderência alta e os relacionados que completem a resposta) e adapte os passos à pergunta."
            : status === "so_guias_parciais"
              ? "Nenhum guia trata exatamente desta tarefa. Reformule os termos desconhecidos com o vocabulário do CRM e busque de novo. Se ainda assim só houver parciais, não suponha em silêncio: pergunte à pessoa se ela quis dizer uma das opções de confirmacao; se nenhuma servir, diga claramente que os guias não cobrem o assunto."
              : "Os guias não têm nada sobre esta consulta. Reformule os termos desconhecidos com o vocabulário do CRM (visao_geral_crm) e busque de novo; se continuar sem resultado, pergunte à pessoa o que ela quer fazer ou diga claramente que o manual não cobre o assunto, sem inventar passos.",
      entendimento: { termosDesconhecidos },
      confirmacao: motivo
        ? {
            necessaria: true,
            motivo,
            ...(clarification ? { pergunta: clarification.question } : {}),
            opcoes:
              motivo === "nenhum_guia"
                ? []
                : options.map((item) => ({
                    id: item.id,
                    titulo: item.titulo,
                    pergunta: `Você quer ${item.titulo.charAt(0).toLowerCase()}${item.titulo.slice(1)}?`,
                  })),
          }
        : { necessaria: false },
      guias: candidates,
    };
  }

  /** Palavras da consulta que não aparecem em nenhum guia: o agente deve reformulá-las. */
  function unknownWords(consulta: string) {
    return [
      ...new Set(
        words(consulta).filter((word) => !documentFrequency.has(stem(word))),
      ),
    ];
  }

  /** Texto completo dos guias pedidos, com as referências ao código conferido. */
  function readGuides(ids: readonly string[]) {
    const wanted = [...new Set(ids.map((id) => id.trim().toLowerCase()))];
    const found = wanted
      .map((id) => index.find((entry) => entry.chapter.id.toLowerCase() === id))
      .filter((entry) => entry !== undefined);
    return {
      revisao: revision(),
      orientacao:
        "Responda em português do Brasil adaptando estes passos à pergunta. Use os nomes exatos de telas, botões e campos que aparecem aqui. O que não estiver nos guias não foi confirmado: diga isso em vez de supor.",
      guias: found.map(({ chapter }) => ({
        id: chapter.id,
        titulo: chapter.titulo,
        area: areaOf(chapter),
        trecho: chapter.trecho,
        referencias: chapter.referencias,
      })),
      naoEncontrados: wanted.filter(
        (id) => !found.some((entry) => entry.chapter.id.toLowerCase() === id),
      ),
    };
  }

  function guideCountByArea() {
    const counts: Record<string, number> = {};
    for (const chapter of data.capitulos)
      counts[areaOf(chapter)] = (counts[areaOf(chapter)] ?? 0) + 1;
    return counts;
  }

  return { listGuides, searchGuides, readGuides, guideCountByArea };
}
