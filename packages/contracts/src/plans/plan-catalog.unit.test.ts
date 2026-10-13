import { describe, expect, it } from "vitest";
import { planCatalogInputSchema } from "../index.js";

describe("plan catalog input", () => {
  it("trims names and accepts prices in cents, including free plans", () => {
    expect(
      planCatalogInputSchema.parse({
        name: "  Pilates  ",
        totalValueInCents: 0,
      }),
    ).toEqual({ name: "Pilates", totalValueInCents: 0 });
    expect(
      planCatalogInputSchema.parse({
        name: "Pilates",
        totalValueInCents: 12345,
      }).totalValueInCents,
    ).toBe(12345);
  });
  it.each([
    { name: "   ", totalValueInCents: 100 },
    { name: "AB", totalValueInCents: 100 },
    { name: "A".repeat(121), totalValueInCents: 100 },
    { name: "Pilates", totalValueInCents: -1 },
    { name: "Pilates", totalValueInCents: 12.3 },
    { name: "Pilates", totalValueInCents: 2147483648 },
  ])("rejects invalid catalog input %j", (input) => {
    expect(planCatalogInputSchema.safeParse(input).success).toBe(false);
  });
});
