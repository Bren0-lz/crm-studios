import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_STAGE_COLOR,
  defaultLeadStageColors,
  leadStageColor,
  leadStageColorSchema,
  leadStagePalette,
  leadStagesInputSchema,
  resolveLeadStages,
} from "./stages.js";

describe("lead stage colors", () => {
  it("normalizes #RRGGBB colors to lowercase and rejects invalid values", () => {
    expect(leadStageColorSchema.parse(" #3F7CC0 ")).toBe("#3f7cc0");
    for (const invalid of ["3f7cc0", "#3f7", "#3f7cc00", "azul", ""])
      expect(leadStageColorSchema.safeParse(invalid).success).toBe(false);
    expect(leadStagePalette.every((item) => /^#[0-9a-f]{6}$/.test(item.color))).toBe(
      true,
    );
  });

  it("uses the chosen color or falls back to the stage default color", () => {
    expect(leadStageColor({ stage: "contacted", color: "#DB2777" })).toBe(
      "#db2777",
    );
    expect(leadStageColor({ stage: "contacted" })).toBe(
      defaultLeadStageColors.contacted,
    );
    expect(leadStageColor({ stage: "stage_custom123" })).toBe(
      DEFAULT_LEAD_STAGE_COLOR,
    );
    expect(leadStageColor({})).toBe(DEFAULT_LEAD_STAGE_COLOR);
  });

  it("preserves saved stage colors in resolveLeadStages and leadStagesInputSchema", () => {
    const resolved = resolveLeadStages([
      { stage: "new_contact", label: "Novos", color: "#123456" },
      { stage: "won", label: "Ganhos", color: null },
      { stage: "lost", label: "Perdidos" },
    ]);
    expect(resolved).toEqual([
      { stage: "new_contact", label: "Novos", kind: "open", color: "#123456" },
      { stage: "won", label: "Ganhos", kind: "won" },
      { stage: "lost", label: "Perdidos", kind: "lost" },
    ]);

    const parsed = leadStagesInputSchema.parse({
      stages: [
        { stage: "new_contact", label: "Novos", color: "#ABCDEF" },
        { stage: "won", label: "Ganhos" },
        { stage: "lost", label: "Perdidos" },
      ],
    });
    expect(parsed.stages[0]?.color).toBe("#abcdef");
  });
});
