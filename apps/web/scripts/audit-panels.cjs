// Auditoria de layout: todo filho direto de um elemento com a classe `panel` precisa ter
// espaçamento horizontal próprio (padding/margin lateral no styles.css), a menos que o
// próprio painel tenha padding. Sem isso, o texto fica colado na borda do painel.
// Uso: node apps/web/scripts/audit-panels.cjs  (sai com código 1 se encontrar problemas)
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const webSrc = path.join(__dirname, "..", "src");
const css = fs.readFileSync(path.join(webSrc, "styles.css"), "utf8");
const appPath = path.join(webSrc, "App.tsx");
const sf = ts.createSourceFile(appPath, fs.readFileSync(appPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Painéis que recebem padding do contêiner pai (seletor contextual no CSS).
const paddedByParent = new Set(["admin-settings", "admin-users", "admin-matrix", "admin-audit", "groups-wide"]);
// Filhos que ocupam a largura toda de propósito (cabeçalhos, tabelas, listas com linhas próprias).
const fullBleed = new Set(["panel-head", "list-toolbar", "agenda-toolbar", "table-row", "table-head"]);

const horizontal = (value) => {
  const parts = value.trim().split(/\s+/).filter((v) => !v.startsWith("!"));
  const side = parts.length >= 2 ? parts[1] : parts[0];
  return side !== undefined && !/^0(px|rem|em)?$/.test(side) && side !== "auto";
};
const spacedX = new Set();
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = ruleRe.exec(css))) {
  const decls = m[2].split(";").map((d) => d.split(":").map((s) => s.trim()));
  const hasX = decls.some(([prop, value]) => {
    if (!prop || value === undefined) return false;
    if (/^(padding|margin)-(left|right|inline|inline-start|inline-end)$/.test(prop)) return !/^0(px)?$/.test(value);
    if (prop === "padding" || prop === "margin" || prop === "padding-inline" || prop === "margin-inline") return horizontal(value);
    return false;
  });
  if (!hasX) continue;
  // A classe conta como espaçada se ela mesma recebe o espaçamento lateral ou se os seus
  // descendentes recebem (ex.: `.message-list article { padding: 14px 20px }` — as linhas têm respiro).
  for (const selector of m[1].split(",")) {
    for (const cls of selector.match(/\.[a-zA-Z0-9_-]+/g) || []) spacedX.add(cls.slice(1));
  }
}

const classesOf = (el) => {
  for (const a of (el.openingElement || el).attributes.properties) {
    if (!a.name || a.name.text !== "className" || !a.initializer) continue;
    const text = ts.isStringLiteral(a.initializer) ? a.initializer.text : a.initializer.getText(sf);
    return text.replace(/[`{}$"'?:()|&]/g, " ").split(/\s+/).filter((c) => /^[a-z][a-z0-9-]*$/.test(c));
  }
  return [];
};
const tagOf = (el) => (el.openingElement || el).tagName.getText(sf);
const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const problems = [];
const inspectChild = (panel, panelClasses, child) => {
  if (ts.isJsxText(child)) {
    if (child.text.trim()) problems.push(`App.tsx:${lineOf(child)} texto solto dentro de .${panelClasses.join(".")}`);
    return;
  }
  if (ts.isJsxExpression(child)) {
    // {cond && <el/>} ou {cond ? <a/> : <b/>}: inspeciona os elementos JSX dentro da expressão.
    const visitExpr = (n) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return inspectChild(panel, panelClasses, n);
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return; // .map(...) renderiza listas; o contêiner da lista é que conta
      ts.forEachChild(n, visitExpr);
    };
    if (child.expression) visitExpr(child.expression);
    return;
  }
  if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return;
  const tag = tagOf(child);
  if (/^[A-Z]/.test(tag) || tag.includes(".")) return; // componentes têm estilo próprio
  const cls = classesOf(child);
  if (cls.some((c) => spacedX.has(c) || fullBleed.has(c))) return;
  // Listas de largura total são aceitas quando as linhas (filhos, inclusive os gerados por .map) têm respiro próprio.
  const rowsSpaced = (() => {
    let found = false;
    const walk = (n, depth) => {
      if (found || depth > 3) return;
      if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && n !== child) {
        const rowTag = tagOf(n);
        if (/^[A-Z]/.test(rowTag) || classesOf(n).some((c) => spacedX.has(c) || fullBleed.has(c))) { found = true; return; }
        depth += 1;
      }
      ts.forEachChild(n, (c) => walk(c, depth));
    };
    ts.forEachChild(child, (c) => walk(c, 0));
    return found;
  })();
  // Texto direto no bloco (rótulo, parágrafo) fica colado mesmo que as linhas tenham respiro.
  const textish = ["p", "span", "small", "strong", "label", "h2", "h3"];
  const bareText = ts.isJsxElement(child) && child.children.some((c) => {
    if (ts.isJsxText(c)) return c.text.trim() !== "";
    if (!ts.isJsxElement(c) && !ts.isJsxSelfClosingElement(c)) return false;
    return textish.includes(tagOf(c)) && !classesOf(c).some((k) => spacedX.has(k));
  });
  if (rowsSpaced && !bareText && !textish.includes(tag)) return;
  problems.push(`App.tsx:${lineOf(child)} <${tag}${cls.length ? " ." + cls.join(".") : ""}> sem espaçamento lateral dentro de .${panelClasses.join(".")}`);
};
const visit = (node) => {
  if (ts.isJsxElement(node)) {
    const cls = classesOf(node);
    if (cls.includes("panel")) {
      const own = cls.filter((c) => c !== "panel");
      const padded = own.some((c) => spacedX.has(c) || paddedByParent.has(c));
      if (!padded) for (const child of node.children) inspectChild(node, cls, child);
    }
  }
  ts.forEachChild(node, visit);
};
visit(sf);

if (problems.length) {
  console.error(`${problems.length} problema(s) de espaçamento em painéis:\n` + problems.join("\n"));
  process.exit(1);
}
console.log("Nenhum filho de .panel sem espaçamento lateral.");
