import { describe, expect, it } from "vitest";
import { serviceBusinessLineLabels, serviceInputSchema } from "./model.js";
import { administrativeRegistryInputSchema } from "./registry.js";

const service = { name: "Pilates", durationMinutes: 50, priceInCents: 9000 };

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
});
