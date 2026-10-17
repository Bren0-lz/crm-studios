const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export type TrendDirection = "up" | "down" | "stable" | "new" | "none";

/**
 * Classifica a variação. Sem base anterior (`changePercent` nulo) é "novo" quando há valor
 * agora, ou "none" quando os dois períodos estão zerados.
 */
export function trendDirection(
  changePercent: number | null,
  hasCurrentValue: boolean,
): TrendDirection {
  if (changePercent === null) return hasCurrentValue ? "new" : "none";
  if (Math.abs(changePercent) < 0.05) return "stable";
  return changePercent > 0 ? "up" : "down";
}

/** "+12,5%", "−8%" ou "0%" — vírgula decimal e sinal explícito. */
export function formatTrendPercent(changePercent: number): string {
  const text = percentFormat.format(Math.abs(changePercent));
  if (Math.abs(changePercent) < 0.05) return "0%";
  return `${changePercent > 0 ? "+" : "−"}${text}%`;
}
