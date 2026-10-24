import { useCallback, useId, useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";

type Series = {
  label: string;
  format?: (value: number) => string;
  /** Formato curto para o eixo vertical (ex.: "R$ 1,2 mil"). */
  axisFormat?: (value: number) => string;
};
export type ChartPoint = {
  label: string;
  /** Rótulo curto no eixo horizontal; o `label` completo fica na leitura. */
  axisLabel?: string;
  values: (number | null)[];
};

const PADDING = { top: 16, right: 16, bottom: 36 };
const BAR_MAX = 24;
const BAR_GAP = 2;
const RADIUS = 4;

/** Divisões "redondas" (1, 2, 2,5 ou 5 × 10ⁿ) cobrindo o intervalo. */
function niceTicks(min: number, max: number, count = 4) {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= raw) ??
    10 * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step)
    ticks.push(Math.round(v / step) * step);
  return ticks;
}

/** Barra com a ponta de dado arredondada e a base reta. */
function barPath(x: number, width: number, top: number, base: number) {
  const height = Math.abs(base - top);
  const r = Math.min(RADIUS, width / 2, height);
  if (top <= base)
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top - r}V${base}Z`;
}

export function ReportChart({
  title,
  points,
  series,
  bars = false,
  showTable = true,
}: {
  title: string;
  points: ChartPoint[];
  series: Series[];
  bars?: boolean;
  showTable?: boolean;
}) {
  const id = useId();
  const [focused, setFocused] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const update = () => {
      if (element.clientWidth) setWidth(element.clientWidth);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const values = points.flatMap((p) =>
    p.values.filter((v): v is number => v !== null),
  );
  if (!values.length)
    return (
      <EmptyState
        title="Sem dados para o gráfico"
        copy="Os valores estarão disponíveis quando houver dados no período."
      />
    );
  const format = (v: number, index: number) =>
    series[index]?.format?.(v) ?? String(v);
  const axisFormat = (v: number) => series[0]?.axisFormat?.(v) ?? format(v, 0);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const min = ticks[0]!,
    max = ticks[ticks.length - 1]!;
  const compact = width < 480;
  const height = compact ? 220 : 280;
  const left =
    Math.max(...ticks.map((tick) => axisFormat(tick).length)) * 7 + 12;
  const plotWidth = Math.max(width - left - PADDING.right, 40);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const band = plotWidth / points.length;
  const y = (v: number) =>
    PADDING.top + ((max - v) / (max - min || 1)) * plotHeight;
  const x = (i: number) => left + (i + 0.5) * band;
  const barWidth = Math.max(
    2,
    Math.min(
      BAR_MAX,
      (band * 0.72 - (series.length - 1) * BAR_GAP) / series.length,
    ),
  );
  const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);
  const labelEvery = Math.max(
    1,
    Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 96))),
  );
  const showDots = !bars && band >= 14;
  const description = (point: ChartPoint) =>
    `${point.label}: ${point.values.map((v, i) => `${series[i]?.label}: ${v === null ? "Sem base de cálculo" : format(v, i)}`).join(" · ")}`;
  const highlighted = focused === null ? null : points[focused];
  return (
    <div className="report-chart" data-kind={bars ? "bars" : "lines"}>
      {series.length > 1 && (
        <ul className="report-chart-legend" aria-label="Legenda">
          {series.map((s, i) => (
            <li key={s.label} data-series={i}>
              <span aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="report-chart-readout" aria-live="polite">
        {highlighted ? (
          <>
            <strong>{highlighted.label}</strong>
            <ul aria-label={description(highlighted)}>
              {highlighted.values.map((v, i) => (
                <li key={i} data-series={i}>
                  <span aria-hidden="true" />
                  <b>{v === null ? "Sem base de cálculo" : format(v, i)}</b>
                  {series[i]?.label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          "Passe sobre o gráfico ou navegue pelos pontos com Tab para consultar os valores."
        )}
      </div>
      <div className="report-chart-frame" ref={measure}>
        <svg
          className="report-chart-plot"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="group"
          aria-labelledby={id}
        >
          <title id={id}>{title}</title>
          {ticks.map((tick) => (
            <g key={tick} className="report-chart-tick">
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                className={
                  tick === 0 ? "report-chart-zero" : "report-chart-grid"
                }
              />
              <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {axisFormat(tick)}
              </text>
            </g>
          ))}
          {points.map((point, i) =>
            i % labelEvery === 0 ? (
              <text
                key={point.label}
                className="report-chart-xlabel"
                x={
                  points.length > 1 && i === 0
                    ? left + 4
                    : points.length > 1 && i === points.length - 1
                      ? left + plotWidth - 4
                      : x(i)
                }
                y={height - 12}
                textAnchor={
                  points.length === 1
                    ? "middle"
                    : i === 0
                      ? "start"
                      : i === points.length - 1
                        ? "end"
                        : "middle"
                }
              >
                {point.axisLabel ?? point.label}
              </text>
            ) : null,
          )}
          {focused !== null && !bars && (
            <line
              className="report-chart-crosshair"
              x1={x(focused)}
              x2={x(focused)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
            />
          )}
          {!bars &&
            series.map((s, si) => {
              const line = points
                .map((p, i) =>
                  p.values[si] === null
                    ? ""
                    : `${i === 0 || points[i - 1]!.values[si] === null ? "M" : "L"}${x(i)},${y(p.values[si]!)}`,
                )
                .join(" ");
              const defined = points
                .map((p, i) => (p.values[si] === null ? null : i))
                .filter((i): i is number => i !== null);
              const continuous =
                defined.length > 1 &&
                defined[defined.length - 1]! - defined[0]! ===
                  defined.length - 1;
              return (
                <g key={s.label}>
                  {series.length === 1 && continuous && (
                    <path
                      data-series={si}
                      className="report-chart-area"
                      d={`${line} L${x(defined[defined.length - 1]!)},${y(0)} L${x(defined[0]!)},${y(0)} Z`}
                    />
                  )}
                  <path
                    data-series={si}
                    className="report-chart-line"
                    d={line}
                  />
                </g>
              );
            })}
          {points.map((point, i) => (
            <g
              key={point.label}
              tabIndex={0}
              role="img"
              aria-label={description(point)}
              className="report-chart-point"
              data-active={focused === i || undefined}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
              onMouseEnter={() => setFocused(i)}
              onMouseLeave={() => setFocused(null)}
            >
              <title>{description(point)}</title>
              <rect
                x={left + i * band}
                y={PADDING.top}
                width={band}
                height={plotHeight}
                className="report-chart-hit"
              />
              {point.values.map((v, si) =>
                v === null ? null : bars ? (
                  <path
                    key={si}
                    data-series={si}
                    className="report-chart-bar"
                    d={barPath(
                      x(i) - groupWidth / 2 + si * (barWidth + BAR_GAP),
                      barWidth,
                      y(v),
                      y(0),
                    )}
                  />
                ) : showDots || focused === i ? (
                  <circle
                    key={si}
                    data-series={si}
                    className="report-chart-dot"
                    cx={x(i)}
                    cy={y(v)}
                    r={focused === i ? 5 : 4}
                  />
                ) : null,
              )}
            </g>
          ))}
        </svg>
      </div>
      {showTable && (
        <details className="report-data-disclosure">
          <summary>Ver dados do gráfico</summary>
          <div className="table-scroll">
            <table className="dre-table">
              <caption>{title}</caption>
              <thead>
                <tr>
                  <th scope="col">Período</th>
                  {series.map((s) => (
                    <th scope="col" className="numeric-value" key={s.label}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.label}>
                    <th scope="row">{p.label}</th>
                    {p.values.map((v, i) => (
                      <td className="numeric-value" key={i}>
                        {v === null ? "—" : format(v, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export function AgeChart({
  items,
  total,
}: {
  items: { band: string; label: string; clients: number }[];
  total: number;
}) {
  return (
    <div
      className="report-age-chart"
      role="list"
      aria-label="Distribuição por faixa etária"
    >
      {items.map((item) => (
        <div key={item.band} role="listitem" className="report-age-row">
          <div className="report-age-label">
            <strong>{item.label}</strong>
            <div>
              <span>{Math.round((item.clients / total) * 100)}%</span>
              <b>{item.clients}</b>
            </div>
          </div>
          <svg
            viewBox="0 0 100 8"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${item.clients} clientes, ${Math.round((item.clients / total) * 100)}%`}
          >
            <rect width="100" height="8" className="report-age-track" />
            <rect
              width={(item.clients / total) * 100}
              height="8"
              className="report-age-fill"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
