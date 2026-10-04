// Auditoria de layout: todo filho direto de um elemento com a classe `panel` precisa ter
// espaçamento horizontal próprio (padding/margin lateral no styles.css), a menos que o
// próprio painel tenha padding. Sem isso, o texto fica colado na borda do painel.
// Uso: node apps/web/scripts/audit-panels.cjs  (sai com código 1 se encontrar problemas)
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const webSrc = path.join(__dirname, "..", "src");
const css = fs.readFileSync(path.join(webSrc, "styles.css"), "utf8");
// AUDIT_APP_TSX aponta para outro arquivo .tsx (testes sintéticos da auditoria sem mexer no App.tsx).
const appPath = process.env.AUDIT_APP_TSX || path.join(webSrc, "App.tsx");
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

// Terceira verificação (cartões na borda): filho direto de `.panel` (sem padding próprio) que tem
// caixa visível — borda, fundo ou sombra no próprio elemento, ou filhos imediatos que são cartões
// com borda/fundo/sombra — precisa ficar a pelo menos 8px das bordas laterais do painel. Conta só
// regra cujo último seletor composto contém a classe: `margin` lateral no próprio bloco ou, no caso
// de cartões internos, `margin`/`padding` lateral no contêiner. Tokens `var(--x)` e `calc()` simples
// são resolvidos a partir do `:root`.
const MIN_GAP = 8;
const tokens = {};
for (const rule of cssRules) {
  if (rule.prelude !== ":root") continue;
  for (const decl of rule.body.split(";")) {
    const idx = decl.indexOf(":");
    if (idx !== -1 && decl.slice(0, idx).trim().startsWith("--")) tokens[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
}
const toPx = (raw) => {
  let value = raw.replace(/!important/, "").trim();
  for (let n = 0; n < 5 && /var\(/.test(value); n += 1) {
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, name) => tokens[name] ?? "NaN");
  }
  if (value === "0") return 0;
  const expr = value.replace(/^calc/, "").replace(/(-?\d*\.?\d+)px/g, "$1");
  if (!/^[\d\s.+\-*/()]+$/.test(expr)) return NaN;
  try {
    return Number(Function(`"use strict"; return (${expr});`)());
  } catch {
    return NaN;
  }
};
const declsOf = (body) =>
  body
    .split(";")
    .map((decl) => {
      const idx = decl.indexOf(":");
      return idx === -1 ? null : [decl.slice(0, idx).trim(), decl.slice(idx + 1).trim()];
    })
    .filter(Boolean);
// Lados esquerdo e direito de um shorthand margin/padding (1 a 4 valores).
const sidesOf = (value) => {
  const parts = splitTopLevel(value.replace(/!important/, ""), " ");
  if (parts.length === 1) return [parts[0], parts[0]];
  if (parts.length === 2 || parts.length === 3) return [parts[1], parts[1]];
  return [parts[3], parts[1]];
};
const lateralOf = (body, props) => {
  let left;
  let right;
  for (const [prop, value] of declsOf(body)) {
    if (props.includes(prop)) [left, right] = sidesOf(value).map(toPx);
    else if (props.some((p) => prop === `${p}-inline`)) {
      const parts = splitTopLevel(value, " ");
      [left, right] = [parts[0], parts[1] ?? parts[0]].map(toPx);
    } else if (props.some((p) => prop === `${p}-left` || prop === `${p}-inline-start`)) left = toPx(value);
    else if (props.some((p) => prop === `${p}-right` || prop === `${p}-inline-end`)) right = toPx(value);
  }
  return { left, right };
};
// Caixa = borda completa, sombra, ou fundo com cantos arredondados. Faixas de largura total
// (fundo sem raio, como barras de filtro) e divisórias de um lado só não contam.
const hasBox = (rules) => {
  const decls = rules.flatMap((r) => declsOf(r.body)).map(([prop, value]) => [prop, value.replace(/!important/, "").trim()]);
  const rounded = decls.some(([prop, v]) => prop === "border-radius" && !/^0(px)?$/.test(v));
  return decls.some(([prop, v]) => {
    if (prop === "border" || prop === "border-inline" || prop === "outline") return !/^(none|0(px)?)\b/.test(v);
    if (prop === "box-shadow") return v !== "none";
    if (prop === "background" || prop === "background-color") return rounded && !/^(none|transparent|inherit|unset|initial)$/.test(v);
    return false;
  });
};
const compounds = (selector) => selector.split(/[\s>+~]+/).filter(Boolean);
const hasClass = (compound, cls) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound);
const screenRules = cssRules
  .filter((r) => !isPrint(r.media) && !r.prelude.startsWith(":root"))
  .map((r) => ({ ...r, selectors: splitTopLevel(r.prelude, ",").map(normalizeSelector) }));
// Regras cujo último composto é o próprio elemento (a classe está nele).
const ownRules = (cls) => screenRules.filter((r) => r.selectors.some((s) => { const c = compounds(s); return c.length && hasClass(c[c.length - 1], cls) && !/:{1,2}(before|after|hover|focus|active|disabled)/.test(c[c.length - 1]); }));
// Regras que miram filhos imediatos genéricos do elemento (`.x article`, `.x > div`).
const childCardRules = (cls) => screenRules.filter((r) => r.selectors.some((s) => { const c = compounds(s); return c.length >= 2 && hasClass(c[c.length - 2], cls) && /^[a-z]+$/.test(c[c.length - 1]); }));
const lateralOk = (rules, props) => {
  let left = 0;
  let right = 0;
  for (const r of rules) {
    const side = lateralOf(r.body, props);
    if (side.left !== undefined && side.left > left) left = side.left;
    if (side.right !== undefined && side.right > right) right = side.right;
  }
  return left >= MIN_GAP && right >= MIN_GAP;
};

const cardProblems = [];
const inspectCard = (panelClasses, child) => {
  if (ts.isJsxExpression(child)) {
    const visitExpr = (n) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return inspectCard(panelClasses, n);
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
      ts.forEachChild(n, visitExpr);
    };
    if (child.expression) visitExpr(child.expression);
    return;
  }
  if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) return;
  const tag = tagOf(child);
  if (/^[A-Z]/.test(tag) || tag.includes(".")) return;
  const cls = classesOf(child);
  if (!cls.length || cls.some((c) => fullBleed.has(c))) return;
  const own = cls.flatMap(ownRules);
  if (hasBox(own)) {
    if (!lateralOk(own, ["margin"])) cardProblems.push(`App.tsx:${lineOf(child)} <${tag} .${cls.join(".")}> tem borda/fundo/sombra e fica a menos de ${MIN_GAP}px da borda lateral de .${panelClasses.join(".")}`);
    return;
  }
  if (hasBox(cls.flatMap(childCardRules)) &&!lateralOk(own, ["margin", "padding"])) {
    cardProblems.push(`App.tsx:${lineOf(child)} <${tag} .${cls.join(".")}> tem cartões com borda/fundo a menos de ${MIN_GAP}px da borda lateral de .${panelClasses.join(".")}`);
  }
};
const visitCards = (node) => {
  if (ts.isJsxElement(node)) {
    const cls = classesOf(node);
    if (cls.includes("panel")) {
      const own = cls.filter((c) => c !== "panel");
      const padded = own.some((c) => lateralOk(ownRules(c), ["padding"]) || paddedByParent.has(c));
      if (!padded) for (const child of node.children) inspectCard(cls, child);
    }
  }
  ts.forEachChild(node, visitCards);
};
visitCards(sf);

if (cardProblems.length) {
  console.error(`${cardProblems.length} cartão(ões) encostado(s) na borda do painel:\n` + cardProblems.join("\n"));
  failed = true;
} else {
  console.log("Nenhum cartão encostado na borda lateral de .panel.");
}

// Quarta verificação (tipografia): os tamanhos de fonte vêm da escala `--text-*` declarada no
// `:root`. O `:root` precisa declarar pelo menos um token e nenhum token pode ficar abaixo de
// 12px (nos fluidos, o menor px do `clamp()`). Todo `var(--text-X)` usado no arquivo precisa estar
// declarado no `:root`. Fora do `:root`, `font-size` só aceita:
//   - `var(--text-*)`;
//   - `calc()` com token, sem subtração nem divisão, e multiplicações só por fatores ≥ 1;
//   - `clamp()` cujo mínimo é `var(--text-*)`, e `max()` com pelo menos um `var(--text-*)` —
//     ambos sem unidade absoluta (px, pt, pc, cm, mm, in, Q); `min()` é recusado;
//   - `inherit`, `initial`, `unset`, `revert`;
//   - `em`/`rem`/`%` relativos só a partir de 1 (1em / 100%), que nunca encolhem o texto;
//   - `0` (texto escondido de propósito, ex.: indicador em forma de bolinha).
// O atalho `font:` não pode trazer tamanho em unidade absoluta. Vale também dentro de `@media`.
const MIN_FONT = 12;
const ABSOLUTE = /\d(?:\.\d+)?(px|pt|pc|cm|mm|in|q)\b/i;
const TOKEN = /^var\(\s*--text-[\w-]+\s*\)$/;
const fontProblems = [];
const minPxOf = (value) => {
  const nums = [...value.matchAll(/(\d*\.?\d+)px/g)].map((x) => Number(x[1]));
  return nums.length ? Math.min(...nums) : NaN;
};
const declaredText = new Set();
for (const rule of cssRules) {
  if (rule.prelude !== ":root") continue;
  for (const [prop, value] of declsOf(rule.body)) {
    if (!/^--text-/.test(prop)) continue;
    declaredText.add(prop);
    if (!(minPxOf(value) >= MIN_FONT)) fontProblems.push(`styles.css:${rule.line} ${prop}: ${value} (token abaixo de ${MIN_FONT}px ou sem px)`);
  }
}
if (!declaredText.size) fontProblems.push("styles.css :root não declara nenhum token --text-*");
const innerOf = (value, fn) => value.slice(fn.length + 1, -1);
const fontSizeOk = (raw) => {
  const value = raw.replace(/!important/, "").trim();
  if (TOKEN.test(value)) return true;
  if (/^(inherit|initial|unset|revert)$/.test(value)) return true;
  if (value === "0") return true;
  const rel = value.match(/^(\d*\.?\d+)(em|rem|%)$/);
  if (rel) return rel[2] === "%" ? Number(rel[1]) >= 100 : Number(rel[1]) >= 1;
  if (!/\)$/.test(value) || ABSOLUTE.test(value)) return false;
  if (value.startsWith("calc(")) {
    const inner = innerOf(value, "calc");
    if (!/var\(\s*--text-/.test(inner) || /\//.test(inner) || /(^|[\s(])-(?!-)/.test(inner.replace(/var\([^)]*\)/g, "T"))) return false;
    const factors = [...inner.matchAll(/\*\s*(\d*\.?\d+)|(\d*\.?\d+)\s*\*/g)].map((x) => Number(x[1] ?? x[2]));
    return factors.every((n) => n >= 1);
  }
  if (value.startsWith("clamp(")) return TOKEN.test(splitTopLevel(innerOf(value, "clamp"), ",")[0] ?? "");
  if (value.startsWith("max(")) return splitTopLevel(innerOf(value, "max"), ",").some((a) => TOKEN.test(a));
  return false;
};
for (const rule of cssRules) {
  for (const [prop, value] of declsOf(rule.body)) {
    for (const used of value.matchAll(/var\(\s*(--text-[\w-]+)/g)) {
      if (!declaredText.has(used[1])) fontProblems.push(`styles.css:${rule.line} ${used[1]} usado sem declaração no :root`);
    }
    if (rule.prelude === ":root") continue;
    if (prop === "font-size" && !fontSizeOk(value)) {
      fontProblems.push(`styles.css:${rule.line} ${rule.prelude.replace(/\s+/g, " ")} { font-size: ${value} } fora da escala --text-* (ou abaixo de ${MIN_FONT}px)`);
    }
    if (prop === "font" && ABSOLUTE.test(value)) {
      fontProblems.push(`styles.css:${rule.line} ${rule.prelude.replace(/\s+/g, " ")} { font: ${value} } com tamanho em unidade absoluta`);
    }
  }
}

if (fontProblems.length) {
  console.error(`${fontProblems.length} tamanho(s) de fonte fora da escala tipográfica:\n` + fontProblems.join("\n"));
  failed = true;
} else {
  console.log("Nenhum tamanho de fonte fora da escala --text-* (mínimo 12px).");
}

// Quinta verificação (botões): todo `<button>` em App.tsx tem `className` não vazio — as
// variantes são `primary-button`, `secondary-button`, `text-button`, `danger-button` (e
// `icon-button` para botão só com ícone), com o modificador `button-sm` para ações de linha e de
// cartão; controles próprios (abas, filtros em pílula, células do calendário) têm classe própria.
// Sem classe, o botão cai no estilo nativo do navegador. Também reprova expressões que podem
// resultar em classe vazia: ternário ou `&&` com "", e template só com trechos condicionais
// (ex.: aba com `className={ativa ? "active" : ""}` fica sem classe quando inativa).
// Exceções: componentes (pelo nome da função que os declara) cujo `<button>` recebe a classe por
// prop, ex.: `<button {...props}>`. Hoje nenhum componente faz isso; inclua aqui o nome e o motivo.
const BUTTON_CLASS_BY_PROP = new Set([]);
const canBeEmpty = (e) => {
  if (!e) return true;
  if (ts.isParenthesizedExpression(e)) return canBeEmpty(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return !e.text.trim();
  if (ts.isConditionalExpression(e)) return canBeEmpty(e.whenTrue) || canBeEmpty(e.whenFalse);
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return true;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return canBeEmpty(e.right);
  }
  if (ts.isTemplateExpression(e)) {
    const fixed = e.head.text + e.templateSpans.map((span) => span.literal.text).join("");
    return !fixed.trim() && e.templateSpans.every((span) => canBeEmpty(span.expression));
  }
  return false;
};
const buttonProblems = [];
const enclosingFunction = (node) => {
  for (let n = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) return n.name.text;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
  }
  return "";
};
const visitButtons = (node) => {
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === "button") {
    const attr = node.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name && a.name.getText(sf) === "className");
    const init = attr && attr.initializer;
    const empty = attr && (!init || canBeEmpty(ts.isJsxExpression(init) ? init.expression : init));
    if ((!attr || empty) && !BUTTON_CLASS_BY_PROP.has(enclosingFunction(node))) {
      buttonProblems.push(`App.tsx:${lineOf(node)} <button> ${attr ? "com className que pode ficar vazio" : "sem className"} (use primary-button, secondary-button, text-button ou danger-button)`);
    }
  }
  ts.forEachChild(node, visitButtons);
};
visitButtons(sf);

if (buttonProblems.length) {
  console.error(`${buttonProblems.length} botão(ões) sem classe de variante:\n` + buttonProblems.join("\n"));
  failed = true;
} else {
  console.log("Nenhum <button> sem className em App.tsx.");
}
if (failed) process.exit(1);
