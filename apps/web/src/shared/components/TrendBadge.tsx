import { ArrowDown, ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import {
  formatTrendCurrency,
  formatTrendPercent,
  trendDirection,
} from "../lib/trend";

/**
 * Selo de variação com seta, sinal e cor: verde quando melhora, vermelho quando piora e cinza
 * quando fica estável. `higherIsBetter` inverte as cores para métricas em que subir é ruim.
 *
 * Com `changeInCents`, a seta e a cor seguem o sinal da diferença em reais; sem percentual
 * (base anterior zero ou negativa) o selo mostra "Sem base de comparação" e a diferença em R$.
 */
export function TrendBadge({
  changePercent,
  changeInCents,
  hasCurrentValue,
  comparison,
  higherIsBetter = true,
}: {
  changePercent: number | null;
  changeInCents?: number;
  hasCurrentValue: boolean;
  comparison: string;
  higherIsBetter?: boolean;
}) {
  const hasDelta = changeInCents !== undefined;
  if (changePercent === null && !(hasDelta && changeInCents !== 0)) {
    const direction = trendDirection(null, hasCurrentValue);
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
  // Com percentual (base positiva) o sinal é o mesmo da diferença; vale a faixa de estável.
  const direction =
    hasDelta && changePercent === null
      ? changeInCents === 0
        ? "stable"
        : changeInCents > 0
          ? "up"
          : "down"
      : trendDirection(changePercent, hasCurrentValue);
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
      {changePercent === null
        ? `Sem base de comparação · ${formatTrendCurrency(changeInCents ?? 0)}`
        : `${formatTrendPercent(changePercent)} ${comparison}`}
    </span>
  );
}
