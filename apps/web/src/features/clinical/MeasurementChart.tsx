import { shortDate } from "../../shared/lib/formatting";
import type { MeasurementSeries } from "./model";

const WIDTH = 320;
const HEIGHT = 120;
const PAD_X = 12;
const PAD_Y = 14;

const numberLabel = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

/** Gráfico de linha simples (SVG) de uma medição ao longo das sessões. */
export function MeasurementChart({
  series,
  target,
}: {
  series: MeasurementSeries;
  /** Meta do objetivo ligado, desenhada como linha tracejada. */
  target?: number | undefined;
}) {
  const values = series.points.map((point) => point.value);
  const first = series.points[0];
  const last = series.points.at(-1);
  if (!first || !last) return null;
  const all = target === undefined ? values : [...values, target];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (index: number) =>
    series.points.length === 1
      ? WIDTH / 2
      : PAD_X + (index / (series.points.length - 1)) * (WIDTH - PAD_X * 2);
  const y = (value: number) =>
    HEIGHT - PAD_Y - ((value - min) / span) * (HEIGHT - PAD_Y * 2);
  const path = series.points
    .map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`)
    .join(" ");
  const delta = last.value - first.value;

  return (
    <figure className="measurement-chart">
      <figcaption>
        <strong>{series.name}</strong>
        <span>
          {numberLabel.format(last.value)} {series.unit}
          {series.points.length > 1 && (
            <em className={delta === 0 ? "" : delta > 0 ? "up" : "down"}>
              {delta > 0 ? "+" : ""}
              {numberLabel.format(delta)} desde{" "}
              {shortDate.format(new Date(first.measuredAt))}
            </em>
          )}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${series.name}: ${series.points
          .map(
            (point) =>
              `${numberLabel.format(point.value)} ${series.unit} em ${shortDate.format(new Date(point.measuredAt))}`,
          )
          .join("; ")}`}
      >
        {target !== undefined && (
          <line
            className="measurement-chart-target"
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={y(target)}
            y2={y(target)}
          />
        )}
        <path className="measurement-chart-line" d={path} />
        {series.points.map((point, index) => (
          <circle
            key={point.id}
            className="measurement-chart-point"
            cx={x(index)}
            cy={y(point.value)}
            r={3.5}
          >
            <title>
              {numberLabel.format(point.value)} {series.unit} ·{" "}
              {shortDate.format(new Date(point.measuredAt))}
            </title>
          </circle>
        ))}
      </svg>
      <div className="measurement-chart-axis">
        <span>{shortDate.format(new Date(first.measuredAt))}</span>
        {series.points.length > 1 && (
          <span>{shortDate.format(new Date(last.measuredAt))}</span>
        )}
      </div>
    </figure>
  );
}
