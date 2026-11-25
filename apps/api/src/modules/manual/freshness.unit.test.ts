import { describe, expect, it } from "vitest";
import {
  checkManual,
  sha,
  staleWarning,
} from "../../../../../scripts/mcp-manual-freshness.mjs";

const files: Record<string, string> = {
  "docs/manual.md": "manual",
  "docs/guias.md": "guias",
  "apps/web/Agenda.tsx": "agenda v1",
  "apps/web/Dre.tsx": "dre v1",
};
function material(current: Record<string, string> = files) {
  const capitulos = [
    { id: "AG02", titulo: "Agendar", fontes: ["apps/web/Agenda.tsx"] },
    { id: "RL07", titulo: "DRE", fontes: ["apps/web/Dre.tsx"] },
  ];
  return {
    data: {
      material: sha(JSON.stringify(capitulos)),
      manualPath: "docs/manual.md",
      manualSha256: sha(files["docs/manual.md"]!),
      sourceHashes: Object.fromEntries(
        ["docs/guias.md", "apps/web/Agenda.tsx", "apps/web/Dre.tsx"].map(
          (path) => [path, sha(files[path]!)],
        ),
      ),
      capitulos,
    },
    read: (path: string) => current[path],
  };
}

describe("conferência do material do MCP", () => {
  it("mantém todos os guias quando as fontes conferem", () => {
    const { data, read } = material();
    const check = checkManual(data, read);
    expect(check.stale).toEqual([]);
    expect(check.fresh).toBe(data);
  });
  it("tira do pacote só o guia cuja fonte mudou ou sumiu e recalcula o hash", () => {
    for (const current of [
      { ...files, "apps/web/Dre.tsx": "dre v2" },
      Object.fromEntries(
        Object.entries(files).filter(([path]) => path !== "apps/web/Dre.tsx"),
      ),
    ]) {
      const { data, read } = material(current);
      const check = checkManual(data, read);
      expect(check.changed).toEqual(["apps/web/Dre.tsx"]);
      expect(check.stale).toEqual([{ id: "RL07", titulo: "DRE" }]);
      expect(check.fresh.capitulos.map((chapter) => chapter.id)).toEqual([
        "AG02",
      ]);
      expect(check.fresh.material).toBe(
        sha(JSON.stringify(check.fresh.capitulos)),
      );
      expect(staleWarning(check)).toContain("RL07");
    }
  });
  it("recusa material editado à mão ou guia em Markdown alterado sem regenerar", () => {
    const edited = material();
    edited.data.capitulos[0]!.titulo = "Outro";
    expect(() => checkManual(edited.data, edited.read)).toThrow(
      /editado à mão/,
    );
    const guides = material({ ...files, "docs/guias.md": "guias v2" });
    expect(() => checkManual(guides.data, guides.read)).toThrow(
      /docs\/guias\.md mudou/,
    );
  });
});
