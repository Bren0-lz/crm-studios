import { describe, expect, it } from "vitest";
import { productInputSchema, productUpdateSchema } from "../finance/model.js";
import { serviceBusinessLineLabels, serviceInputSchema } from "./model.js";
import { administrativeRegistryInputSchema } from "./registry.js";

const service = { name: "Pilates", durationMinutes: 50 };

describe("linha do serviço no painel", () => {
  it("aceita ausente, null, studio e aesthetics e recusa outra linha", () => {
    expect(serviceInputSchema.parse(service)).not.toHaveProperty(
      "businessLine",
    );
    expect(
      serviceInputSchema.parse({ ...service, businessLine: null }).businessLine,
    ).toBeNull();
    for (const line of ["studio", "aesthetics"] as const)
      expect(
        serviceInputSchema.parse({ ...service, businessLine: line })
          .businessLine,
      ).toBe(line);
    expect(
      serviceInputSchema.safeParse({ ...service, businessLine: "dance" })
        .success,
    ).toBe(false);
  });

  it("no PUT, ausente fica ausente (mantém) e null explícito chega como null (limpa)", () => {
    const parse = (extra: object) =>
      administrativeRegistryInputSchema.parse({
        kind: "service",
        data: { ...service, active: true, ...extra },
      }).data;
    expect(parse({})).not.toHaveProperty("businessLine");
    expect(parse({ businessLine: null })).toHaveProperty("businessLine", null);
  });

  it("usa os rótulos Studio e Estética", () => {
    expect(serviceBusinessLineLabels).toEqual({
      studio: "Studio",
      aesthetics: "Estética",
    });
  });

  it("vale também para o produto: ausente fica ausente, null limpa e outra linha é recusada", () => {
    const product = { name: "Creme", costInCents: 100, salePriceInCents: 200 };
    expect(productInputSchema.parse(product)).not.toHaveProperty(
      "businessLine",
    );
    expect(
      productInputSchema.parse({ ...product, businessLine: "aesthetics" })
        .businessLine,
    ).toBe("aesthetics");
    expect(
      productInputSchema.safeParse({ ...product, businessLine: "dance" })
        .success,
    ).toBe(false);
    expect(productUpdateSchema.parse(product)).not.toHaveProperty(
      "businessLine",
    );
    expect(
      productUpdateSchema.parse({ ...product, businessLine: null }),
    ).toHaveProperty("businessLine", null);
  });
});
