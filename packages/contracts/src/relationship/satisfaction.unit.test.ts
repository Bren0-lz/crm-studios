import { describe, expect, it } from "vitest";
import { satisfactionCategory, summarizeSatisfaction } from "./model.js";

describe("NPS summaries", () => {
  it("keeps an empty NPS distinct from a neutral result", () => {
    expect(summarizeSatisfaction([])).toEqual({
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      nps: null,
    });
    expect(summarizeSatisfaction([{ score: 9 }, { score: 0 }])).toEqual({
      total: 2,
      promoters: 1,
      passives: 0,
      detractors: 1,
      nps: 0,
    });
  });
  it.each([
    [0, "detractor"],
    [6, "detractor"],
    [7, "passive"],
    [8, "passive"],
    [9, "promoter"],
    [10, "promoter"],
  ] as const)("classifies score %i as %s", (score, category) =>
    expect(satisfactionCategory(score)).toBe(category),
  );
  it("counts every category and rounds the NPS percentage", () => {
    expect(
      summarizeSatisfaction([{ score: 9 }, { score: 10 }, { score: 7 }]),
    ).toEqual({ total: 3, promoters: 2, passives: 1, detractors: 0, nps: 67 });
    expect(
      summarizeSatisfaction([{ score: 0 }, { score: 6 }, { score: 8 }]).nps,
    ).toBe(-67);
  });
});
