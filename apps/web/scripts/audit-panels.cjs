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

let failed = false;
if (problems.length) {
  console.error(`${problems.length} problema(s) de espaçamento em painéis:\n` + problems.join("\n"));
  failed = true;
} else {
  console.log("Nenhum filho de .panel sem espaçamento lateral.");
}

// Segunda verificação (celular): toda regra com `grid-template-columns` de 2 ou mais trilhas fixas
// precisa de uma regra para o mesmo seletor dentro de `@media (max-width: X)` com X ≤ 760px que
// reduza para 1 trilha, `none` ou use `auto-fit`/`auto-fill`. Grids `repeat(auto-fit|auto-fill, …)`
// já são responsivos. Regras em `@media print` ficam de fora. Exceção explícita: comentário
// `/* audit: mobile-ok <motivo> */` logo acima da regra (as colunas cabem em 390px).
const MOBILE_MAX = 760;
const lineAt = (index) => css.slice(0, index).split("\n").length;
const cssRules = [];
{
  const stack = [];
  let buf = "";
  let bufStart = -1;
  let annotated = false;
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const text = css.slice(i + 2, end === -1 ? css.length : end);
      if (/audit:\s*mobile-ok\s+\S/.test(text)) annotated = true;
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    const ch = css[i];
    if (ch === "{") {
      const prelude = buf.trim();
      if (prelude.startsWith("@")) {
        stack.push(prelude);
      } else {
        let depth = 1;
        let j = i + 1;
        let body = "";
        while (j < css.length && depth > 0) {
          if (css.startsWith("/*", j)) {
            const end = css.indexOf("*/", j + 2);
            j = end === -1 ? css.length : end + 2;
            continue;
          }
          if (css[j] === "{") depth += 1;
          else if (css[j] === "}") depth -= 1;
          if (depth > 0) body += css[j];
          j += 1;
        }
        cssRules.push({ prelude, body, line: lineAt(bufStart), media: [...stack], annotated });
        annotated = false;
        i = j;
        buf = "";
        bufStart = -1;
        continue;
      }
      buf = "";
      bufStart = -1;
    } else if (ch === "}") {
      stack.pop();
      buf = "";
      bufStart = -1;
    } else if (ch === ";") {
      buf = "";
      bufStart = -1;
    } else {
      if (bufStart === -1 && !/\s/.test(ch)) bufStart = i;
      buf += ch;
    }
    i += 1;
  }
}

const normalizeSelector = (s) => s.trim().replace(/\s*([>+~])\s*/g, "$1").replace(/\s+/g, " ");
const splitTopLevel = (value, sep) => {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch))) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const gridColumnsOf = (body) => {
  let value;
  for (const decl of body.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    if (decl.slice(0, idx).trim() === "grid-template-columns") value = decl.slice(idx + 1).replace(/!important/, "").trim();
  }
  return value;
};
// Retorna "responsive" para auto-fit/auto-fill, ou o número de trilhas.
const trackCount = (value) => {
  if (/auto-fit|auto-fill/.test(value)) return "responsive";
  if (value === "none" || value === "subgrid") return 1;
  let count = 0;
  for (const token of splitTopLevel(value, " ")) {
    if (token.startsWith("[")) continue; // nome de linha
    const rep = token.match(/^repeat\(\s*(\d+)\s*,(.*)\)$/s);
    if (rep) count += Number(rep[1]) * Math.max(1, splitTopLevel(rep[2], " ").filter((t) => !t.startsWith("[")).length);
    else count += 1;
  }
  return count;
};
const maxWidthOf = (media) => {
  let width = Infinity;
  for (const at of media) {
    const mw = at.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/);
    if (mw) width = Math.min(width, Number(mw[1]));
  }
  return width;
};
const isPrint = (media) => media.some((at) => /^@media\s+print\b/.test(at));

const gridRules = cssRules
  .filter((r) => !isPrint(r.media))
  .map((r) => ({ ...r, columns: gridColumnsOf(r.body), selectors: splitTopLevel(r.prelude, ",").map(normalizeSelector) }))
  .filter((r) => r.columns !== undefined);

const gridProblems = [];
for (const rule of gridRules) {
  const tracks = trackCount(rule.columns);
  if (tracks === "responsive" || tracks < 2 || rule.annotated) continue;
  const limit = Math.min(MOBILE_MAX, maxWidthOf(rule.media));
  for (const selector of rule.selectors) {
    const covered = gridRules.some((other) => {
      if (other === rule || !other.selectors.includes(selector)) return false;
      if (maxWidthOf(other.media) > limit) return false;
      // A regra de celular pode manter várias colunas se estiver anotada com `mobile-ok`.
      const t = trackCount(other.columns);
      return t === "responsive" || t <= 1 || other.annotated;
    });
    if (!covered) gridProblems.push(`styles.css:${rule.line} ${selector} { grid-template-columns: ${rule.columns.replace(/\s+/g, " ")} } sem regra de celular (≤ ${MOBILE_MAX}px)`);
  }
}

if (gridProblems.length) {
  console.error(`${gridProblems.length} grid(s) de várias colunas sem regra para celular:\n` + gridProblems.join("\n"));
  failed = true;
} else {
  console.log("Nenhum grid de várias colunas sem regra para celular.");
}
if (failed) process.exit(1);
