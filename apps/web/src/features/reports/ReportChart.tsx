import { useId, useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";

type Series = { label: string; format?: (value: number) => string };
export type ChartPoint = { label: string; values: (number | null)[] };
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
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const extent = max - min || 1;
  const y = (v: number) => 12 + ((max - v) / extent) * 170;
  const x = (i: number) => 28 + ((i + 0.5) / points.length) * 744;
  const barStep = Math.min(48, 600 / points.length / series.length);
  const barWidth = barStep * 0.75;
  const format = (v: number, index: number) =>
    series[index]?.format?.(v) ?? String(v);
  const description = (point: ChartPoint) =>
    `${point.label}: ${point.values.map((v, i) => `${series[i]?.label}: ${v === null ? "Sem base de cálculo" : format(v, i)}`).join(" · ")}`;
  const highlighted = focused === null ? null : points[focused];
  return (
    <div className="report-chart">
      <ul className="report-chart-legend" aria-label="Legenda">
        {series.map((s, i) => (
          <li key={s.label} data-series={i}>
            <span aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="report-chart-readout" aria-live="polite">
        {highlighted
          ? description(highlighted)
          : "Passe sobre o gráfico ou navegue pelos pontos com Tab para consultar os valores."}
      </div>
      <svg
        className="report-chart-plot"
        viewBox="0 0 800 200"
        preserveAspectRatio="none"
        role="group"
        aria-labelledby={id}
      >
        <title id={id}>{title}</title>
        {[0, 0.5, 1].map((tick) => (
          <line
            key={tick}
            x1="12"
            x2="788"
            y1={12 + tick * 170}
            y2={12 + tick * 170}
            className="report-chart-grid"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1="12"
          x2="788"
          y1={y(0)}
          y2={y(0)}
          className="report-chart-zero"
          vectorEffect="non-scaling-stroke"
        />
        {!bars &&
          series.map((s, si) => (
            <path
              key={s.label}
              data-series={si}
              className="report-chart-line"
              vectorEffect="non-scaling-stroke"
              d={points
                .map((p, i) =>
                  p.values[si] === null
                    ? ""
                    : `${i === 0 || points[i - 1]!.values[si] === null ? "M" : "L"}${x(i)},${y(p.values[si]!)}`,
                )
                .join(" ")}
            />
          ))}
        {points.map((point, i) => (
          <g
            key={point.label}
            tabIndex={0}
            role="img"
            aria-label={description(point)}
            className="report-chart-point"
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            onMouseEnter={() => setFocused(i)}
            onMouseLeave={() => setFocused(null)}
          >
            <title>{description(point)}</title>
            <rect
              x={x(i) - Math.min(24, 350 / points.length)}
              y="0"
              width={Math.min(48, 700 / points.length)}
              height="200"
              className="report-chart-hit"
            />
            {point.values.map((v, si) =>
              v === null ? null : bars ? (
                <rect
                  key={si}
                  data-series={si}
                  className="report-chart-bar"
                  x={
                    x(i) +
                    (si - (series.length - 1) / 2) * barStep -
                    barWidth / 2
                  }
                  width={barWidth}
                  y={Math.min(y(v), y(0))}
                  height={Math.abs(y(v) - y(0))}
                />
              ) : (
                <circle
                  key={si}
                  data-series={si}
                  className="report-chart-dot"
                  cx={x(i)}
                  cy={y(v)}
                  r="4"
                />
              ),
            )}
          </g>
        ))}
      </svg>
      <div className="report-chart-axis">
        <span>{points[0]?.label}</span>
        {points.length > 2 && (
          <span>{points[Math.floor(points.length / 2)]?.label}</span>
        )}
        <span>{points.length > 1 ? points[points.length - 1]?.label : ""}</span>
      </div>
      <p className="report-chart-scale">
        Escala: {format(min, 0)} a {format(max, 0)}
      </p>
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
