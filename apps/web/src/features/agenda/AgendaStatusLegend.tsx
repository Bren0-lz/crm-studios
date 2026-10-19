import { agendaStatusLegend } from "./model";

/** Legenda das cores de status da agenda (V4), igual em Dia, Semana, Mês e lista. */
export function AgendaStatusLegend() {
  return (
    <ul className="agenda-status-legend" aria-label="Legenda dos status">
      {agendaStatusLegend.map((item) => (
        <li key={item.status}>
          <i className={`appt-status-swatch appt-status-${item.status}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
