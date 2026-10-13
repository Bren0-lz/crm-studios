import type {
  Appointment,
  GroupSession,
  Holiday,
  ScheduleBlock,
} from "@crm/contracts";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api } from "../../api";

type Props = {
  value: string;
  onChange: (value: string) => void;
  professionalId: string;
  roomId: string;
  excludeAppointmentId?: string;
  disabled?: boolean;
  label?: string;
};

type CalendarData = {
  appointments: Appointment[];
  groups: GroupSession[];
  blocks: ScheduleBlock[];
  holidays: Holiday[];
};

const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fullDateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthLabel = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const summaryDateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeLabel = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function firstOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function AppointmentDateTimePicker({
  value,
  onChange,
  professionalId,
  roomId,
  excludeAppointmentId,
  disabled = false,
  label = "Data e horário",
}: Props) {
  const id = useId();
  const date = value.split("T")[0] ?? "";
  const time = value.split("T")[1] ?? "";
  const today = dateKey(new Date());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    firstOfMonth(localDate(date || today)),
  );
  const [focusedDate, setFocusedDate] = useState(date || today);
  const [result, setResult] = useState<{
    key: string;
    data: CalendarData | null;
    error: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const expanded = open && !disabled;

  const gridStart = new Date(month);
  gridStart.setDate(1 - ((month.getDay() + 6) % 7));
  gridStart.setHours(0, 0, 0, 0);
  const gridLength =
    Math.ceil(
      (((month.getDay() + 6) % 7) +
        new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  const days = Array.from({ length: gridLength }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + index);
    return day;
  });
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + gridLength);
  const from = gridStart.toISOString();
  const to = gridEnd.toISOString();
  const holidayFrom = dateKey(gridStart);
  const holidayTo = dateKey(days[days.length - 1]!);
  const requestKey = `${from}/${to}/${retry}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : "";

  // The date is chosen with buttons, so the editable time field owns native form validation.
  useEffect(() => {
    timeRef.current?.setCustomValidity(
      date ? "" : "Selecione uma data para o atendimento.",
    );
  }, [date]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    Promise.all([
      api.appointments(from, to),
      api.groupSessions(from, to),
      api.scheduleBlocks(from, to),
      api.holidays(holidayFrom, holidayTo),
    ])
      .then(([appointments, groups, blocks, holidays]) => {
        if (active)
          setResult({
            key: requestKey,
            data: { appointments, groups, blocks, holidays },
            error: "",
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            key: requestKey,
            data: null,
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível consultar a agenda.",
          });
      });
    return () => {
      active = false;
    };
  }, [expanded, from, to, holidayFrom, holidayTo, requestKey]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!expanded || !panel || !trigger) return;

    // The native top layer escapes the modal's scrolling area without moving the
    // panel out of its DOM subtree (and therefore out of the modal's focus trap).
    panel.showPopover?.();

    function positionPanel() {
      if (!panel || !trigger) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth =
        viewport?.width ??
        (document.documentElement.clientWidth || window.innerWidth);
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const margin = 12;
      const gap = 8;
      const width = Math.max(0, Math.min(340, viewportWidth - margin * 2));
      const maxHeight = Math.max(0, viewportHeight - margin * 2);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${maxHeight}px`;

      const anchor = trigger.getBoundingClientRect();
      const height = panel.getBoundingClientRect().height;
      const below = viewportTop + viewportHeight - margin - anchor.bottom - gap;
      const above = anchor.top - gap - viewportTop - margin;
      const placeAbove = height > below && above > below;
      const available = Math.max(
        0,
        Math.min(maxHeight, placeAbove ? above : below),
      );
      panel.style.maxHeight = `${available}px`;
      const panelHeight = Math.min(height, available);
      const top = placeAbove
        ? anchor.top - gap - panelHeight
        : anchor.bottom + gap;
      panel.style.left = `${Math.max(viewportLeft + margin, Math.min(anchor.left, viewportLeft + viewportWidth - margin - width))}px`;
      panel.style.top = `${Math.max(viewportTop + margin, Math.min(top, viewportTop + viewportHeight - margin - panelHeight))}px`;
    }

    function onScroll(event: Event) {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      positionPanel();
    }

    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      )
        setOpen(false);
    }

    positionPanel();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(positionPanel);
    observer?.observe(panel);
    observer?.observe(trigger);
    window.addEventListener("resize", positionPanel);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.visualViewport?.addEventListener("resize", positionPanel);
    window.visualViewport?.addEventListener("scroll", positionPanel);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", positionPanel);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.visualViewport?.removeEventListener("resize", positionPanel);
      window.visualViewport?.removeEventListener("scroll", positionPanel);
      if (panel.isConnected) panel.hidePopover?.();
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (expanded && focusDay.current) {
      panelRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)
        ?.focus();
      focusDay.current = false;
    }
  }, [expanded, focusedDate, month]);

  function showCalendar(focusCalendarDay = true) {
    const initial = date || today;
    setMonth(firstOfMonth(localDate(initial)));
    setFocusedDate(initial);
    setRetry((current) => current + 1);
    focusDay.current = focusCalendarDay;
    setOpen(true);
  }

  function closeCalendar() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveMonth(offset: number) {
    const next = new Date(
      month.getFullYear(),
      month.getMonth() + offset,
      1,
      12,
    );
    setMonth(next);
    setFocusedDate(dateKey(next));
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
    const next = new Date(day);
    const weekday = (day.getDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        next.setDate(day.getDate() - 1);
        break;
      case "ArrowRight":
        next.setDate(day.getDate() + 1);
        break;
      case "ArrowUp":
        next.setDate(day.getDate() - 7);
        break;
      case "ArrowDown":
        next.setDate(day.getDate() + 7);
        break;
      case "Home":
        next.setDate(day.getDate() - weekday);
        break;
      case "End":
        next.setDate(day.getDate() + 6 - weekday);
        break;
      case "PageUp":
      case "PageDown": {
        const target = new Date(
          day.getFullYear(),
          day.getMonth() + (event.key === "PageUp" ? -1 : 1),
          1,
          12,
        );
        target.setDate(
          Math.min(
            day.getDate(),
            new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
          ),
        );
        next.setTime(target.getTime());
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    focusDay.current = true;
    setFocusedDate(dateKey(next));
    if (
      next.getMonth() !== month.getMonth() ||
      next.getFullYear() !== month.getFullYear()
    )
      setMonth(firstOfMonth(next));
  }

  function matchesResource(item: {
    professionalId?: string | undefined;
    roomId?: string | undefined;
  }) {
    return (
      (!professionalId && !roomId) ||
      (!!professionalId && item.professionalId === professionalId) ||
      (!!roomId && item.roomId === roomId)
    );
  }

  const events = data
    ? [
        ...data.appointments
          .filter(
            (item) =>
              item.status !== "cancelled" &&
              item.id !== excludeAppointmentId &&
              matchesResource(item),
          )
          .map((item) => ({ ...item, kind: "Atendimento" })),
        ...data.groups
          .filter(
            (item) => item.status !== "cancelled" && matchesResource(item),
          )
          .map((item) => ({ ...item, kind: "Turma" })),
        ...data.blocks
          .filter((item) => item.status === "active" && matchesResource(item))
          .map((item) => ({ ...item, kind: "Bloqueio" })),
      ].sort(
        (a, b) =>
          a.startsAt.localeCompare(b.startsAt) || a.kind.localeCompare(b.kind),
      )
    : [];

  function eventsOnDay(day: Date) {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return events.filter(
      (item) => new Date(item.startsAt) < end && new Date(item.endsAt) > start,
    );
  }

  const holidayNames = new Map(
    data?.holidays.map((holiday) => [holiday.date, holiday.name]),
  );
  const selectedDay =
    date && date >= holidayFrom && date <= holidayTo ? localDate(date) : null;
  const selectedEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  return (
    <div
      ref={pickerRef}
      className="appointment-date-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          closeCalendar();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
    >
      <span className="appointment-date-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="appointment-date-fields">
        <div>
          <span id={`${id}-date-label`} className="sr-only">
            Data
          </span>
          <button
            ref={triggerRef}
            type="button"
            className="appointment-date-trigger"
            aria-labelledby={`${id}-date-label`}
            aria-describedby={`${id}-label`}
            aria-expanded={expanded}
            aria-controls={`${id}-panel`}
            disabled={disabled}
            onClick={() => (expanded ? closeCalendar() : showCalendar())}
          >
            <CalendarDays size={18} aria-hidden="true" />
            <span className={date ? "" : "appointment-date-placeholder"}>
              {date ? dateLabel.format(localDate(date)) : "Selecionar data"}
            </span>
          </button>
        </div>
        <label className="appointment-time-field">
          <span className="sr-only">Horário</span>
          <input
            ref={timeRef}
            type="time"
            required
            disabled={disabled}
            value={time}
            onFocus={() => {
              if (!expanded && !disabled) showCalendar(false);
            }}
            onChange={(event) => onChange(`${date}T${event.target.value}`)}
          />
        </label>
      </div>
      {expanded && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          popover="manual"
          className="appointment-calendar"
          role="region"
          aria-label="Calendário de agendamento"
        >
          <div className="appointment-calendar-head">
            <strong aria-live="polite">
              {capitalize(monthLabel.format(month))}
            </strong>
            <div className="appointment-calendar-nav">
              <button
                type="button"
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar calendário"
                onClick={closeCalendar}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <table
            className="appointment-calendar-grid"
            aria-label={monthLabel.format(month)}
          >
            <thead>
              <tr>
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                  (day) => (
                    <th key={day} scope="col">
                      {day}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: gridLength / 7 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const key = dateKey(day);
                    const count = eventsOnDay(day).length;
                    const holiday = holidayNames.get(key);
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          data-date={key}
                          className={`appointment-calendar-day${day.getMonth() !== month.getMonth() ? " outside" : ""}${key === today ? " today" : ""}${key === date ? " selected" : ""}`}
                          aria-label={`${fullDateLabel.format(day)}${count ? `, ${count} compromisso${count > 1 ? "s" : ""}` : ""}${holiday ? `, feriado: ${holiday}` : ""}`}
                          aria-current={key === today ? "date" : undefined}
                          aria-pressed={key === date}
                          tabIndex={key === focusedDate ? 0 : -1}
                          onFocus={() => setFocusedDate(key)}
                          onKeyDown={(event) => onDayKeyDown(event, day)}
                          onClick={() => {
                            setFocusedDate(key);
                            onChange(`${key}T${time}`);
                            if (day.getMonth() !== month.getMonth()) {
                              focusDay.current = true;
                              setMonth(firstOfMonth(day));
                            }
                          }}
                        >
                          <span className="appointment-calendar-day-number">
                            {day.getDate()}
                          </span>
                          <span
                            className="appointment-calendar-markers"
                            aria-hidden="true"
                          >
                            {count > 0 && <i />}
                            {holiday && <i className="holiday" />}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="appointment-calendar-legend">
            <span>
              <i /> Compromissos
            </span>
            <span>
              <i className="holiday" /> Feriado
            </span>
          </div>
          <div
            className="appointment-calendar-summary"
            aria-live="polite"
            aria-busy={!data && !error}
          >
            <strong>
              {selectedDay
                ? capitalize(
                    summaryDateLabel.format(selectedDay).replace("-feira", ""),
                  )
                : "Escolha uma data"}
            </strong>
            <small>
              {professionalId || roomId
                ? "Do profissional ou da sala selecionados"
                : "Resumo geral da agenda"}
            </small>
            <label className="appointment-calendar-time-field">
              <span>Horário do atendimento</span>
              <input
                type="time"
                required
                disabled={disabled}
                value={time}
                onChange={(event) => onChange(`${date}T${event.target.value}`)}
              />
            </label>
            {error ? (
              <div role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="secondary-button button-sm"
                  onClick={() => setRetry((current) => current + 1)}
                >
                  Tentar novamente
                </button>
              </div>
            ) : !data ? (
              <p role="status">Consultando agenda…</p>
            ) : (
              selectedDay && (
                <>
                  {holidayNames.get(date) && (
                    <p className="appointment-calendar-holiday">
                      Feriado: {holidayNames.get(date)}
                    </p>
                  )}
                  {selectedEvents.length === 0 ? (
                    <p>Nenhum compromisso registrado.</p>
                  ) : (
                    <ul tabIndex={0} aria-label="Horários ocupados">
                      {selectedEvents.map((item) => {
                        const start = new Date(item.startsAt);
                        const end = new Date(item.endsAt);
                        // Show the portion occupying this day, including overnight reservations.
                        const startsBefore = dateKey(start) < date;
                        const endsAfter = dateKey(end) > date;
                        return (
                          <li key={`${item.kind}-${item.id}`}>
                            <time>
                              {startsBefore ? "00:00" : timeLabel.format(start)}
                              –{endsAfter ? "24:00" : timeLabel.format(end)}
                            </time>
                            <span className="appointment-calendar-event-kind">
                              {item.kind}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
