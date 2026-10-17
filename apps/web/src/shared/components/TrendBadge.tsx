import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import { formatTrendPercent, trendDirection } from "../lib/trend";

/**
 * Selo de variação com seta, sinal e cor: verde quando melhora, vermelho quando piora e cinza
 * quando fica estável. `higherIsBetter` inverte as cores para métricas em que subir é ruim.
 */
export function TrendBadge({
  changePercent,
  hasCurrentValue,
  comparison,
  higherIsBetter = true,
}: {
  changePercent: number | null;
  hasCurrentValue: boolean;
  comparison: string;
  higherIsBetter?: boolean;
}) {
  const direction = trendDirection(changePercent, hasCurrentValue);
  if (changePercent === null) {
    return (
      <span className={`trend-badge ${direction}`}>
        {direction === "new" ? (
          <>
            <Sparkles size={14} aria-hidden="true" />
            Novo · sem base anterior
          </>
        ) : (
          "Sem movimento nos dois períodos"
        )}
      </span>
    );
  }
  const better =
    direction === "stable"
      ? "stable"
      : (direction === "up") === higherIsBetter
        ? "better"
        : "worse";
  const Icon =
    direction === "up"
      ? ArrowUp
      : direction === "down"
        ? ArrowDown
        : ArrowRight;
  return (
    <span className={`trend-badge ${better}`}>
      <Icon size={14} aria-hidden="true" />
      {formatTrendPercent(changePercent)} {comparison}
    </span>
  );
}
