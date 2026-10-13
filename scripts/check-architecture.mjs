import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const graph = new Map();
const problems = [];
const normalize = (file) => path.resolve(file).replaceAll("\\", "/");
for (const workspace of ["packages/contracts", "apps/api", "apps/web"]) {
  const configPath = path.join(
    root,
    workspace,
    workspace.endsWith("web") ? "tsconfig.app.json" : "tsconfig.json",
  );
  const config = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, ts.sys.readFile).config,
    ts.sys,
    path.dirname(configPath),
  );
  for (const file of config.fileNames) {
    if (/\.test\.|\/test-support\//.test(normalize(file))) continue;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const edges = new Set();
    graph.set(normalize(file), edges);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
        continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
        continue;
      if (node.isTypeOnly || node.importClause?.isTypeOnly) continue;
      const bindings = node.importClause?.namedBindings ?? node.exportClause;
      if (
        bindings &&
        (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
        bindings.elements.length &&
        bindings.elements.every((item) => item.isTypeOnly)
      )
        continue;
      const target = ts.resolveModuleName(
        node.moduleSpecifier.text,
        file,
        config.options,
        ts.sys,
      ).resolvedModule?.resolvedFileName;
      if (!target || normalize(target).includes("/node_modules/")) continue;
      const from = normalize(file),
        to = normalize(target);
      edges.add(to);
      if (from.includes("/packages/contracts/") && to.includes("/apps/"))
        problems.push(`${from}: contratos dependem de uma aplicação`);
      if (
        from.includes("/apps/web/src/shared/") &&
        to.includes("/apps/web/src/features/")
      )
        problems.push(`${from}: shared depende de uma funcionalidade`);
      const sourceFeature = from.match(/\/features\/([^/]+)\//)?.[1];
      const targetFeature = to.match(/\/features\/([^/]+)\//)?.[1];
      if (
        sourceFeature &&
        targetFeature &&
        sourceFeature !== targetFeature &&
        !to.endsWith("/index.ts")
      )
        problems.push(
          `${from}: importe ${targetFeature} pela entrada pública index.ts`,
        );
    }
  }
}
const complete = new Set(),
  active = new Set();
function visit(file, chain) {
  if (active.has(file)) {
    problems.push(
      `Ciclo: ${[...chain.slice(chain.indexOf(file)), file].map((f) => path.relative(root, f)).join(" -> ")}`,
    );
    return;
  }
  if (complete.has(file)) return;
  active.add(file);
  for (const target of graph.get(file) ?? []) visit(target, [...chain, file]);
  active.delete(file);
  complete.add(file);
}
for (const file of graph.keys()) visit(file, []);
if (problems.length) {
  console.error([...new Set(problems)].join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Arquitetura verificada: ${graph.size} arquivos, sem ciclos de execução ou imports proibidos.`,
  );
