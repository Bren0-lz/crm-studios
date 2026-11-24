import data from "./manual-data.json" with { type: "json" };

const stop = new Set(
  "a o os as um uma uns umas como que de do da dos das no na nos nas para por e em com ao pelo pela meu minha novo nova crm organiza studios eu quero fazer faco posso onde qual se ja".split(
    " ",
  ),
);
function tokens(text: string) {
  return [
    ...new Set(
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((word) => !stop.has(word))
        .map((word) => {
          if (
            /^(cadastrar|cadastro|cadastre|cadastramento|cadastrando|registrar|registro|registre)$/.test(
              word,
            )
          )
            return "cadastrar";
          if (/^(client|alun)/.test(word)) return "cliente";
          if (
            /^(agendar|agendo|agendamento|agendamentos)$/.test(word) ||
            word === "marcar"
          )
            return "agendar";
          return word.replace(/s$/, "");
        }) ?? [],
    ),
  ];
}

const actions = new Set(
  "cadastrar agendar cancelar contratar criar consultar abrir mudar remarcar colocar estornar apagar excluir exportar importar emitir matricular localizar buscar encontrar editar acessar confirmar oferecer avisar".split(
    " ",
  ),
);

function rankLegacyChapters(words: string[]) {
  const ranked = data.capitulos
    .filter((chapter) => !("perguntas" in chapter))
    .map((chapter) => {
      const all = new Set(tokens(chapter.trecho));
      const heading = new Set(tokens(chapter.titulo));
      const aliases =
        chapter.trecho.match(/\*\*Também perguntam:\*\*([^\n]+)/)?.[1] ?? "";
      const intent = new Set(tokens(`${chapter.titulo} ${aliases}`));
      const matched = words.filter((word) => all.has(word));
      return {
        chapter,
        supportsAction: words.every(
          (word) => !actions.has(word) || intent.has(word),
        ),
        coverage: matched.length / Math.max(1, words.length),
        score:
          matched.length + words.filter((word) => heading.has(word)).length * 4,
      };
    })
    .filter(
      (item) =>
        words.length > 0 &&
        item.supportsAction &&
        item.coverage >= 0.75 &&
        item.score >= 2,
    )
    .sort((a, b) => b.score - a.score);
  return ranked
    .filter((item) => item.score >= (ranked[0]?.score ?? 0) * 0.8)
    .slice(0, 3)
    .map((item) => item.chapter);
}

function queryKey(words: string[]) {
  return [...words].sort().join(" ");
}

export function searchManual(consulta: string) {
  const words = tokens(consulta);
  const query = queryKey(words);
  const matches = data.capitulos.filter(
    (chapter) =>
      query &&
      "perguntas" in chapter &&
      [chapter.titulo, ...chapter.perguntas].some(
        (question) => queryKey(tokens(question)) === query,
      ),
  );
  const excerpts = matches.length === 1 ? matches : [];
  if (matches.length === 0) excerpts.push(...rankLegacyChapters(words));
  return {
    status: excerpts.length ? "evidencia_encontrada" : "evidencia_insuficiente",
    revisao: { fontes: data.revisao, material: `sha256:${data.material}` },
    cobertura:
      "Parcial. Somente tutoriais auditados cujas fontes conferem com o build. A revisão da URL publicada precisa ser conferida no deploy.",
    orientacao:
      "Responda em português do Brasil, com passos curtos e os nomes exatos dos botões e campos confirmados nos trechos. Use somente evidência pertinente. Se os trechos não responderem à pergunta ou faltarem passos, diga explicitamente o que não foi confirmado. Não peça dados pessoais.",
    mensagem: excerpts.length
      ? "Confira as condições e os limites dos trechos antes de orientar."
      : "Não encontrei evidência suficiente no conteúdo de ajuda disponível para esta consulta. Não invente passos. Peça uma descrição da tela, sem dados pessoais.",
    trechos: excerpts.map(({ id, titulo, trecho, referencias }) => ({
      id,
      titulo,
      trecho,
      referencias,
    })),
  };
}
