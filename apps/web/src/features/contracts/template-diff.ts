export type TemplateDiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
};

/**
 * Comparação linha a linha entre duas versões do texto de um modelo (maior subsequência comum).
 * Linhas em branco nas pontas são ignoradas; a ordem segue o texto novo.
 */
export function diffTemplateLines(
  before: string,
  after: string,
): TemplateDiffLine[] {
  const a = before.trim() ? before.trim().split(/\r?\n/) : [];
  const b = after.trim() ? after.trim().split(/\r?\n/) : [];
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const lines: TemplateDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
      lines.push({ kind: "removed", text: a[i++]! });
    else lines.push({ kind: "added", text: b[j++]! });
  }
  while (i < a.length) lines.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) lines.push({ kind: "added", text: b[j++]! });
  return lines;
}

/** Resumo para a lista de versões: "2 linhas incluídas · 1 removida". */
export function templateDiffSummary(lines: TemplateDiffLine[]) {
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  if (!added && !removed) return "Mesmo texto da versão anterior";
  return [
    added && `${added} ${added === 1 ? "linha incluída" : "linhas incluídas"}`,
    removed &&
      `${removed} ${removed === 1 ? "linha removida" : "linhas removidas"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
