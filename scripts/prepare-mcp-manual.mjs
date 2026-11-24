// Material permitido explicitamente; nunca percorre o repositório nem copia testes para respostas.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const file = join(root, "apps/api/src/modules/manual/manual-data.json");
const manualPath = "docs/manual-crm-organiza-studios.md";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const read = (path) => readFileSync(join(root, path), "utf8");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (process.argv.includes("--write")) {
  const manual = read(manualPath);
  const originalRevision = manual.match(/\[`([a-f0-9]{40})`\]/)?.[1];
  if (!originalRevision) throw new Error("Manual sem revisão auditada");
  const revision = git("rev-parse", "HEAD");
  const sourceHashes = {};
  const excluded = [];
  const chapters = [];
  const tutorials = manual
    .split("## Tutoriais\n")[1]
    ?.split("## Pendências de verificação")[0];
  if (!tutorials) throw new Error("Tutoriais não encontrados");
  for (const block of tutorials.split(/^## /m).slice(1)) {
    const title = block.split("\n")[0].trim();
    const paths = [
      ...new Set(
        [
          ...block.matchAll(
            new RegExp(`/blob/${originalRevision}/([^\\s)]+)`, "g"),
          ),
        ].map((m) => m[1]),
      ),
    ];
    if (
      !paths.length ||
      paths.some(
        (path) =>
          read(path) !==
          execFileSync("git", ["show", `${originalRevision}:${path}`], {
            cwd: root,
            encoding: "utf8",
          }),
      )
    ) {
      excluded.push(title);
      continue;
    }
    for (const path of paths) sourceHashes[path] = sha(read(path));
    const text = `## ${block}`
      .replaceAll(originalRevision, revision)
      .replace(/<a id="[^"]+"><\/a>\s*/g, "")
      .trim();
    const references = [
      ...text.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g),
    ].map((m) => ({ titulo: m[1], url: m[2] }));
    chapters.push({
      id: `tutorial-${chapters.length + 1}`,
      titulo: title,
      trecho: text.split("**Fontes:**")[0].trim(),
      referencias: references,
    });
  }
  const curatedPath = "docs/ajuda-mcp-clientes.md";
  const curated = read(curatedPath);
  const reviewedRevision = curated.match(/`([a-f0-9]{40})`/)?.[1];
  if (!reviewedRevision) throw new Error("Ajuda de clientes sem revisão");
  const curatedPaths = [
    ...new Set(
      [
        ...curated.matchAll(
          new RegExp(`/blob/${reviewedRevision}/([^\\s)]+)`, "g"),
        ),
      ].map((m) => m[1]),
    ),
  ];
  if (
    !curatedPaths.length ||
    curatedPaths.some(
      (path) =>
        read(path) !==
        execFileSync("git", ["show", `${reviewedRevision}:${path}`], {
          cwd: root,
          encoding: "utf8",
        }),
    )
  )
    throw new Error(
      "Revise a ajuda de clientes contra o código deste deploy e atualize sua revisão.",
    );
  for (const path of curatedPaths) sourceHashes[path] = sha(read(path));
  const references = [
    ...curated.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g),
  ].map((m) => ({ titulo: m[1], url: m[2] }));
  chapters.unshift({
    id: "cadastrar-cliente",
    titulo: curated.split("\n")[0].replace(/^# /, ""),
    trecho: curated
      .split("**Fontes:**")[0]
      .replace(/^# .*\n\nRevisão[^\n]+\n/, "")
      .trim(),
    referencias: references,
  });
  sourceHashes[curatedPath] = sha(curated);
  const fieldGuidesPath = "docs/guias-mcp-fluxos-verificados.md";
  const fieldGuides = read(fieldGuidesPath);
  const fieldRevision = fieldGuides.match(
    /^Revisão das fontes: `([a-f0-9]{40})`/m,
  )?.[1];
  if (!fieldRevision)
    throw new Error("Guias verificados sem revisão das fontes");

  const fieldHeadings = /^## ([A-Z]{2}\d{2}) · (.+)$/gm;
  const entries = [...fieldGuides.matchAll(fieldHeadings)];
  if (!entries.length) throw new Error("Nenhum guia verificado encontrado");

  const fieldIds = new Set();
  for (const [index, entry] of entries.entries()) {
    const [heading, id, title] = entry;
    const body = fieldGuides.slice(
      entry.index + heading.length,
      entries[index + 1]?.index,
    );
    const [lesson, metadata] = body.split(/^\*\*Perguntas:\*\* /m);
    const [questionLine, sources] =
      metadata?.split(/^\*\*Fontes:\*\*\s*/m) ?? [];
    const questions = questionLine?.trim().split(" | ").filter(Boolean) ?? [];
    const references = [
      ...(sources ?? "").matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g),
    ].map(([, titulo, url]) => ({ titulo, url }));
    if (
      fieldIds.has(id) ||
      !lesson.trim() ||
      !questions.length ||
      !references.length
    ) {
      throw new Error(`Guia verificado incompleto ou duplicado: ${id}`);
    }
    fieldIds.add(id);
    const sourcePrefix = `https://github.com/Bren0-lz/crm-studios/blob/${fieldRevision}/`;
    for (const { url } of references) {
      if (!url.startsWith(sourcePrefix))
        throw new Error(`Fonte sem revisão fixa: ${id}`);
      const path = url.slice(sourcePrefix.length).split("#")[0];
      const contents = read(path);
      const reviewedContents = execFileSync(
        "git",
        ["show", `${fieldRevision}:${path}`],
        {
          cwd: root,
          encoding: "utf8",
        },
      );
      if (contents !== reviewedContents) {
        throw new Error(`Revise o guia ${id}: a fonte ${path} mudou.`);
      }
      sourceHashes[path] = sha(contents);
    }
    chapters.push({
      id,
      titulo: title,
      trecho: `## ${title}\n\n${lesson.trim()}`,
      referencias: references,
      perguntas: questions,
    });
  }
  sourceHashes[fieldGuidesPath] = sha(fieldGuides);
  if (!chapters.length)
    throw new Error("Nenhum tutorial com fontes iguais à revisão auditada");
  const material = sha(JSON.stringify(chapters));
  writeFileSync(
    file,
    `${JSON.stringify({ revisao: revision, material, manualPath, manualSha256: sha(manual), sourceHashes, excluidos: excluded, capitulos: chapters }, null, 2)}\n`,
  );
  console.log(
    `Manual MCP revisado: ${chapters.length} tutoriais; ${excluded.length} excluídos por alteração das fontes.`,
  );
} else {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (
    sha(JSON.stringify(data.capitulos)) !== data.material ||
    sha(read(data.manualPath)) !== data.manualSha256 ||
    Object.entries(data.sourceHashes).some(
      ([path, hash]) => sha(read(path)) !== hash,
    )
  ) {
    throw new Error(
      "Material MCP desatualizado. Revise os tutoriais e execute node scripts/prepare-mcp-manual.mjs --write antes do deploy.",
    );
  }
  console.log(
    `Manual MCP confere com este build: ${data.capitulos.length} tutoriais, revisão ${data.revisao}.`,
  );
}
