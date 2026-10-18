import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  formatTrendCurrency,
  formatTrendPercent,
  trendDirection,
} from "../lib/trend";
import { TrendBadge } from "./TrendBadge";

describe("TrendBadge", () => {
  it("formata com vírgula, sinal e sem til", () => {
    expect(formatTrendPercent(102.1)).toBe("+102,1%");
    expect(formatTrendPercent(-8)).toBe("−8%");
    expect(formatTrendPercent(0.01)).toBe("0%");
  });

  it("classifica a direção e o caso sem base anterior", () => {
    expect(trendDirection(5, true)).toBe("up");
    expect(trendDirection(-5, true)).toBe("down");
    expect(trendDirection(0, true)).toBe("stable");
    expect(trendDirection(null, true)).toBe("new");
    expect(trendDirection(null, false)).toBe("none");
  });

  it("pinta melhora de verde e piora de vermelho, invertendo quando subir é ruim", () => {
    const { rerender } = render(
      <TrendBadge changePercent={12.5} hasCurrentValue comparison="vs. mês" />,
    );
    expect(screen.getByText("+12,5% vs. mês")).toHaveClass(
      "trend-badge",
      "better",
    );
    rerender(
      <TrendBadge changePercent={-3} hasCurrentValue comparison="vs. mês" />,
    );
    expect(screen.getByText("−3% vs. mês")).toHaveClass("worse");
    rerender(
      <TrendBadge
        changePercent={12.5}
        hasCurrentValue
        comparison="vs. mês"
        higherIsBetter={false}
      />,
    );
    expect(screen.getByText("+12,5% vs. mês")).toHaveClass("worse");
    rerender(
      <TrendBadge changePercent={0} hasCurrentValue comparison="vs. mês" />,
    );
    expect(screen.getByText("0% vs. mês")).toHaveClass("stable");
  });

  it("mostra 'novo' quando não há base anterior", () => {
    const { rerender } = render(
      <TrendBadge
        changePercent={null}
        hasCurrentValue
        comparison="no mês anterior"
      />,
    );
    expect(screen.getByText("Novo · sem base anterior")).toHaveClass("new");
    rerender(
      <TrendBadge
        changePercent={null}
        hasCurrentValue={false}
        comparison="no mês anterior"
      />,
    );
    expect(screen.getByText("Sem movimento nos dois períodos")).toHaveClass(
      "none",
    );
  });

  it("usa o sinal da diferença em reais e mostra R$ quando não há base de comparação", () => {
    expect(formatTrendCurrency(749000)).toBe("+R$ 7.490,00");
    expect(formatTrendCurrency(-5000)).toBe("−R$ 50,00");
    const { container, rerender } = render(
      <TrendBadge
        changePercent={null}
        changeInCents={749000}
        hasCurrentValue
        comparison="vs. mês"
      />,
    );
    const badge = screen.getByText("Sem base de comparação · +R$ 7.490,00");
    expect(badge).toHaveClass("trend-badge", "better");
    expect(container.querySelector(".lucide-arrow-up")).not.toBeNull();
    rerender(
      <TrendBadge
        changePercent={null}
        changeInCents={-5000}
        hasCurrentValue
        comparison="vs. mês"
      />,
    );
    expect(screen.getByText("Sem base de comparação · −R$ 50,00")).toHaveClass(
      "worse",
    );
    rerender(
      <TrendBadge
        changePercent={null}
        changeInCents={0}
        hasCurrentValue={false}
        comparison="vs. mês"
      />,
    );
    expect(screen.getByText("Sem movimento nos dois períodos")).toHaveClass(
      "none",
    );
  });
});
