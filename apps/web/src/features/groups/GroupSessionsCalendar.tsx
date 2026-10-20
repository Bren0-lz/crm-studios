import type { GroupSession } from "@crm/contracts";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { clinicIsoDate } from "../../shared/lib/formatting";
import {
  calendarMonthDays,
  groupSessionLabel,
  groupSessionStatusLabels,
  shiftIsoDate,
  shiftMonth,
} from "./model";

// Datas do calendário são dias puros ("AAAA-MM-DD"): formatadas em UTC ao meio-dia.
const monthTitle = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const dayTitle = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function noon(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function countLabel(count: number) {
  return `${count} ${count === 1 ? "aula" : "aulas"}`;
}

export function GroupSessionsCalendar({
  month,
  today,
  selectedDate,
  sessions,
  timezone,
  busy,
  loading,
  error,
  onRetry,
  onMonthChange,
  onSelectDate,
  onSelectSession,
}: {
  month: string;
  today: string;
  selectedDate: string;
  /** Encontros só da turma aberta (e do cliente em contexto, quando houver). */
  sessions: GroupSession[];
  timezone: string;
  busy: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onMonthChange: (month: string, selectedDate: string) => void;
  onSelectDate: (date: string) => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const id = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const focusPending = useRef(false);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const byDate = new Map<string, GroupSession[]>();
  for (const item of [...sessions].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )) {
    const date = clinicIsoDate(item.startsAt, timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), item]);
  }
  const days = calendarMonthDays(month);
  const monthCount = days
    .filter((day) => day.startsWith(month))
    .reduce((total, day) => total + (byDate.get(day)?.length ?? 0), 0);
  const selectedSessions = byDate.get(selectedDate) ?? [];
  const title = capitalize(monthTitle.format(noon(`${month}-01`)));
  const sessionName = (item: GroupSession) =>
    `${groupSessionLabel(item)} · ${groupSessionStatusLabels[item.status]}`;

  // Navegação por teclado entre meses: devolve o foco ao dia quando a grade volta a aparecer.
  useEffect(() => {
    if (!focusPending.current || loading) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${selectedDate}"]`,
    );
    if (!button) return;
    focusPending.current = false;
    button.focus();
  }, [selectedDate, loading, month]);

  function goToMonth(offset: number) {
    const next = shiftMonth(month, offset);
    onMonthChange(next, next === today.slice(0, 7) ? today : `${next}-01`);
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = (noon(day).getUTCDay() + 6) % 7;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    };
    let next: string;
    if (event.key in offsets) next = shiftIsoDate(day, offsets[event.key]!);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const target = shiftMonth(
        day.slice(0, 7),
        event.key === "PageUp" ? -1 : 1,
      );
      const last = calendarMonthDays(target).filter((item) =>
        item.startsWith(target),
      );
      next = last[Math.min(Number(day.slice(8)), last.length) - 1]!;
    } else return;
    event.preventDefault();
    focusPending.current = true;
    if (next.slice(0, 7) !== month) onMonthChange(next.slice(0, 7), next);
    else onSelectDate(next);
  }

  return (
    <section className="group-calendar" aria-labelledby={`${id}-title`}>
      <div className="group-calendar-head">
        <h3 id={`${id}-title`} aria-live="polite">
          {title}
        </h3>
        <div className="group-calendar-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Mês anterior"
            disabled={busy}
            onClick={() => goToMonth(-1)}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="secondary-button button-sm"
            disabled={busy}
            onClick={() => onMonthChange(today.slice(0, 7), today)}
          >
            Hoje
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Próximo mês"
            disabled={busy}
            onClick={() => goToMonth(1)}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error ? (
        <div className="group-calendar-feedback">
          <ErrorBanner error={`Não foi possível carregar ${title}: ${error}`} />
          <button type="button" className="secondary-button" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <div
          className="group-calendar-feedback"
          role="status"
          aria-label={`Carregando aulas de ${title}`}
        >
          <LoadingBlock />
        </div>
      ) : (
        <>
          <table
            ref={gridRef}
            className="group-calendar-grid"
            aria-label={`Aulas de ${title}`}
          >
            <thead>
              <tr>
                {weekDays.map((day) => (
                  <th key={day} scope="col">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const items = byDate.get(day) ?? [];
                    const outside = !day.startsWith(month);
                    return (
                      <td key={day}>
                        <div
                          className={`group-calendar-cell${outside ? " outside" : ""}${items.length ? " has-sessions" : ""}${day === today ? " today" : ""}${day === selectedDate ? " selected" : ""}`}
                        >
                          <button
                            type="button"
                            className="group-calendar-day"
                            data-date={day}
                            aria-label={`${capitalize(dayTitle.format(noon(day)))}${day === today ? ", hoje" : ""}, ${items.length ? countLabel(items.length) : "sem aulas"}`}
                            aria-current={day === today ? "date" : undefined}
                            aria-pressed={day === selectedDate}
                            tabIndex={day === selectedDate ? 0 : -1}
                            onKeyDown={(event) => onDayKeyDown(event, day)}
                            onClick={() =>
                              outside
                                ? onMonthChange(day.slice(0, 7), day)
                                : onSelectDate(day)
                            }
                          >
                            <span className="group-calendar-day-number">
                              {Number(day.slice(8))}
                            </span>
                            <span
                              className="group-calendar-markers"
                              aria-hidden="true"
                            >
                              {items.slice(0, 3).map((item) => (
                                <i key={item.id} className={item.status} />
                              ))}
                            </span>
                          </button>
                          {items.length > 0 && (
                            <ul className="group-calendar-events">
                              {items.map((item) => (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    className={`group-calendar-event ${item.status}`}
                                    aria-label={sessionName(item)}
                                    disabled={busy}
                                    onClick={() => onSelectSession(item.id)}
                                  >
                                    <strong>
                                      {time.format(new Date(item.startsAt))}
                                    </strong>
                                    <span>
                                      {groupSessionStatusLabels[item.status]}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {monthCount === 0 ? (
            <EmptyState
              title="Nenhum encontro no período"
              copy={`Esta turma não tem aulas em ${monthTitle.format(noon(`${month}-01`))}. Use os controles acima para ver outros meses.`}
            />
          ) : (
            <section
              className="group-calendar-day-list"
              aria-labelledby={`${id}-day`}
            >
              <h4 id={`${id}-day`}>
                {capitalize(dayTitle.format(noon(selectedDate)))}
                {selectedDate === today ? " · hoje" : ""}
              </h4>
              {selectedSessions.length ? (
                <div className="group-session-list">
                  {selectedSessions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => onSelectSession(item.id)}
                    >
                      {sessionName(item)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="group-session-empty">Nenhuma aula neste dia.</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
