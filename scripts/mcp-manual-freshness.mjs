// Quais guias do MCP ainda conferem com o código deste checkout. Sem Git: só compara hashes.
import { createHash } from "node:crypto";

export const sha = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Separa os guias cujas fontes mudaram desde a geração do material. `readSource` devolve o
 * conteúdo atual do arquivo ou `undefined` se ele não existe mais. Lança erro só quando o próprio
 * material foi editado sem `--write` (problema do PR do MCP, não de um PR que mexeu no código).
 */
export function checkManual(data, readSource) {
  const problems = [];
  if (sha(JSON.stringify(data.capitulos)) !== data.material)
    problems.push("manual-data.json foi editado à mão");
  if (sha(readSource(data.manualPath) ?? "") !== data.manualSha256)
    problems.push(`${data.manualPath} mudou sem regenerar o material`);
  const changed = Object.entries(data.sourceHashes)
    .filter(([path, hash]) => sha(readSource(path) ?? "") !== hash)
    .map(([path]) => path);
  for (const path of changed.filter((path) => path.endsWith(".md")))
    problems.push(`${path} mudou sem regenerar o material`);
  if (problems.length)
    throw new Error(
      `Material MCP inconsistente (${problems.join("; ")}). Execute node scripts/prepare-mcp-manual.mjs --write.`,
    );
  const changedSet = new Set(changed);
  const stale = data.capitulos.filter((chapter) =>
    (chapter.fontes ?? changed).some((path) => changedSet.has(path)),
  );
  const staleIds = new Set(stale.map((chapter) => chapter.id));
  const capitulos = data.capitulos.filter(
    (chapter) => !staleIds.has(chapter.id),
  );
  return {
    changed,
    stale: stale.map(({ id, titulo }) => ({ id, titulo })),
    /** Material sem os guias desatualizados, com o hash recalculado. */
    fresh: stale.length
      ? { ...data, capitulos, material: sha(JSON.stringify(capitulos)) }
      : data,
  };
}

export function staleWarning({ changed, stale }) {
  return [
    `Manual MCP: ${stale.length} guia(s) fora do pacote porque a fonte mudou: ${stale.map((chapter) => chapter.id).join(", ")}.`,
    `Fontes alteradas: ${changed.join(", ")}.`,
    "Revise esses guias e execute node scripts/prepare-mcp-manual.mjs --write.",
  ].join("\n");
}
