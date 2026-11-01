import { describe, expect, it } from "vitest";
import {
  isSinglePlanTemplate,
  serviceInputSchema,
  sessionValueInCents,
  singlePlanSessionPrices,
} from "../index.js";

const template = (
  id: string,
  createdAt: string,
  extra: Partial<Parameters<typeof singlePlanSessionPrices>[0][number]> = {},
) => ({
  id,
  active: true,
  createdAt,
  planType: "single" as const,
  kind: "single" as const,
  services: [{ serviceId: "s1", totalSessions: 2, totalValueInCents: 15001 }],
  ...extra,
});

describe("preço da sessão avulsa", () => {
  it("guarda o preço de tabela no cadastro do serviço", () => {
    const input = {
      name: "Pilates",
      durationMinutes: 50,
      color: "#547A6B",
      priceInCents: 9000,
    };
    expect(serviceInputSchema.parse(input)).toMatchObject({
      priceInCents: 9000,
    });
    expect(
      serviceInputSchema.safeParse({ ...input, priceInCents: -1 }).success,
    ).toBe(false);
  });

  it("reconhece o plano avulso pelo tipo ou, sem tipo, pelo modelo", () => {
    expect(isSinglePlanTemplate({ planType: "single" })).toBe(true);
    expect(isSinglePlanTemplate({ planType: null, kind: "single" })).toBe(true);
    expect(isSinglePlanTemplate({ planType: "monthly", kind: "single" })).toBe(
      false,
    );
  });

  it("usa a sessão do plano avulso ativo cadastrado primeiro", () => {
    const prices = singlePlanSessionPrices([
      template("b", "2026-02-01T00:00:00Z", {
        services: [
          { serviceId: "s1", totalSessions: 1, totalValueInCents: 9000 },
        ],
      }),
      template("a", "2026-01-01T00:00:00Z"),
      template("inativo", "2025-01-01T00:00:00Z", { active: false }),
      template("mensal", "2025-01-01T00:00:00Z", {
        planType: "monthly",
        kind: "recurring",
      }),
    ]);
    // 15001 ÷ 2 sessões, arredondado.
    expect(prices.get("s1")).toBe(7501);
    expect(prices.has("s2")).toBe(false);
  });

  it("prefere o valor da sessão no plano do cliente à referência avulsa", () => {
    expect(
      sessionValueInCents({ totalSessions: 4, totalValueInCents: 24000 }, 9000),
    ).toBe(6000);
    expect(sessionValueInCents(undefined, 9000)).toBe(9000);
  });
});
