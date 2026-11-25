import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkManual,
  staleWarning,
} from "../../../../../scripts/mcp-manual-freshness.mjs";
import raw from "./manual-data.json" with { type: "json" };

/**
 * Material servido pelo MCP. No pacote da Hostinger o JSON já chega sem os guias cuja fonte
 * mudou (plugin do hostinger-build). Rodando do código-fonte (`npm run dev`), o mesmo filtro é
 * aplicado aqui, para homologação não ensinar passo desatualizado. Os testes usam o material
 * inteiro: um PR do CRM que muda uma fonte citada não pode reprovar os testes do manual.
 */
function load() {
  if (!import.meta.url.includes("/src/modules/manual/") || process.env.VITEST)
    return raw;
  const root = fileURLToPath(new URL("../../../../../", import.meta.url));
  try {
    const check = checkManual(raw, (path) =>
      existsSync(root + path) ? readFileSync(root + path, "utf8") : undefined,
    );
    if (check.stale.length) console.warn(`⚠ ${staleWarning(check)}`);
    return check.fresh;
  } catch (error) {
    console.warn(`⚠ ${(error as Error).message}`);
    return raw;
  }
}

export const data = load();
