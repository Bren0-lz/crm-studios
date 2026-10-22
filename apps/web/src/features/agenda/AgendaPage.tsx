import { AppointmentAbsenceModal } from "./AppointmentAbsenceModal";
import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import type {
  Appointment,
  AppointmentStatus,
  GroupSession,
  Holiday,
  Patient,
  PatientOption,
  Professional,
  Room,
  ScheduleBlock,
  Service,
} from "@crm/contracts";
import {
  isAppointmentPendingFinalization,
  pendingFinalizationLabel,
} from "@crm/contracts";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { VisitTypeBadge } from "../../shared/components/VisitTypeBadge";
import {
  dateLabel,
  localIsoDate,
  shortDate,
  timeLabel,
  visitTypeBadgeText,
} from "../../shared/lib/formatting";
import { fetchAgendaPatients } from "../clinical/index";
import { AgendaCard } from "./AgendaCard";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";
import { AppointmentModal } from "./AppointmentModal";
import { AppointmentRescheduleHistoryModal } from "./AppointmentRescheduleHistoryModal";
import { AppointmentRescheduleModal } from "./AppointmentRescheduleModal";
import { CancelBlockModal } from "./CancelBlockModal";
import { DayEventsModal } from "./DayEventsModal";
import { GroupSessionCard } from "./GroupSessionCard";
import { ScheduleBlockCard } from "./ScheduleBlockCard";
import { ScheduleBlockModal } from "./ScheduleBlockModal";
import { useToast } from "../../shared/feedback/toast-context";
import {
  type AgendaView,
  appointmentStatusToast,
  type DayLayout,
  storeAgendaView,
  storeDayLayout,
  storedAgendaView,
  storedDayLayout,
  weekRangeLabel,
} from "./model";
import { DayScheduleGrid } from "./DayScheduleGrid";
import { sortAgendaEntries } from "./model";
import { appointmentStatusClass } from "./model";
import { professionalColorStyle } from "../../tag-colors";
import { AgendaStatusLegend } from "./AgendaStatusLegend";
import { PendingFinalizationBadge } from "./PendingFinalizationBadge";

export function AgendaPage() {
  const { can, canView, canEdit } = useAuthorization();
  const toast = useToast();
  const contextPatientId = usePatientContext();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setViewState] = useState<AgendaView>(storedAgendaView);
  const [dayLayout, setDayLayoutState] = useState<DayLayout>(storedDayLayout);
  function setDayLayout(next: DayLayout) {
    setDayLayoutState(next);
    storeDayLayout(next);
  }
  // Horário livre clicado na grade: abre o Novo atendimento já preenchido.
  const [newSlot, setNewSlot] = useState<{
    professionalId: string;
    startsAt: string;
  } | null>(null);
  function setView(next: AgendaView) {
    setViewState(next);
    storeAgendaView(next);
  }
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [cancellingBlock, setCancellingBlock] = useState<ScheduleBlock | null>(
    null,
  );
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  // Cadastro completo só para quem vê Clientes (dados do cliente nos detalhes do atendimento).
  const [patientRecords, setPatientRecords] = useState<Patient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canSchedule = canEdit("agenda");
  // Bloqueios exigem editar Agenda E Clientes (mesma regra da API).
  const canBlock = can("agenda.blocks_create");
  const canCreateAppointment = canSchedule && can("agenda.create");
  // "Novo atendimento" do Dashboard chega como /agenda?novo=1. A página é remontada quando a
  // busca muda (as rotas são chaveadas por pathname + search), então o pedido passa em duas
  // etapas, sempre com replace: o parâmetro vira um estado de navegação, e esse estado abre o
  // modal e é limpo em seguida. Assim recarregar ou voltar não reabre o modal.
  const location = useLocation();
  const navigate = useNavigate();
  const wantsNewAppointment =
    new URLSearchParams(location.search).get("novo") === "1";
  const newAppointmentRequested =
    (location.state as { newAppointment?: boolean } | null)?.newAppointment ===
    true;
  const [modalOpen, setModalOpen] = useState(
    () => newAppointmentRequested && canCreateAppointment,
  );
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  useEffect(() => {
    if (wantsNewAppointment) {
      const params = new URLSearchParams(location.search);
      params.delete("novo");
      const search = params.toString();
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : "" },
        { replace: true, state: { newAppointment: true } },
      );
    } else if (newAppointmentRequested) {
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null },
      );
    }
  }, [
    wantsNewAppointment,
    newAppointmentRequested,
    location.pathname,
    location.search,
    navigate,
  ]);
  const [absence, setAbsence] = useState<{
    appointment: Appointment;
    status: AppointmentStatus;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [historyAppointment, setHistoryAppointment] =
    useState<Appointment | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  // Menu "⋯" do cartão (QM7): abre os detalhes já em Editar ou no Cancelar com motivo.
  const [detailsMode, setDetailsMode] = useState<"view" | "edit" | "cancel">(
    "view",
  );
  function openAppointment(id: string, mode: "view" | "edit" | "cancel") {
    setDetailsMode(mode);
    setSelectedAppointmentId(id);
  }
  function closeAppointment() {
    setSelectedAppointmentId(null);
    setDetailsMode("view");
  }
  const [eventsDay, setEventsDay] = useState<Date | null>(null);
  // Atendimentos recém-salvos ficam destacados por 2 s depois que aparecem na tela.
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  useEffect(() => {
    if (highlightedIds.length === 0 || loading) return;
    const timer = setTimeout(() => setHighlightedIds([]), 2000);
    return () => clearTimeout(timer);
  }, [highlightedIds, loading]);
  const highlightClass = (id: string) =>
    highlightedIds.includes(id) ? " agenda-just-saved" : "";
  // Cancelados não ocupam horário: ficam fora das contagens e, por padrão, da agenda.
  const [showCancelled, setShowCancelled] = useState(false);
  // Filtro "Profissional": vazio mostra a agenda de todos.
  const [professionalFilter, setProfessionalFilter] = useState("");
  const byProfessional = <T extends { professionalId?: string | undefined }>(
    items: T[],
  ) =>
    professionalFilter
      ? items.filter((item) => item.professionalId === professionalFilter)
      : items;
  const shownAppointments = byProfessional(appointments);
  const shownGroupSessions = byProfessional(groupSessions);
  const shownBlocks = byProfessional(blocks);
  const visibleAppointments = showCancelled
    ? shownAppointments
    : shownAppointments.filter((item) => item.status !== "cancelled");
  const dayEventCount =
    shownAppointments.filter((item) => item.status !== "cancelled").length +
    shownGroupSessions.length +
    shownBlocks.length;
  const professionalColors = new Map(
    professionals.map((item) => [item.id, item.color]),
  );
  const selectedAppointment = appointments.find(
    (item) => item.id === selectedAppointmentId,
  );
  const date = localIsoDate(selectedDate);
  const weekStart = new Date(selectedDate);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    1,
    12,
  );
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(
    monthGridStart.getDate() - ((monthGridStart.getDay() + 6) % 7),
  );
  const monthGridLength =
    Math.ceil(
      (((monthStart.getDay() + 6) % 7) +
        new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth() + 1,
          0,
        ).getDate()) /
        7,
    ) * 7;
  const monthDays = Array.from({ length: monthGridLength }, (_, index) => {
    const item = new Date(monthGridStart);
    item.setDate(item.getDate() + index);
    return item;
  });
  const rangeStart =
    view === "day"
      ? new Date(selectedDate)
      : view === "week"
        ? weekStart
        : monthGridStart;
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(
    rangeEnd.getDate() +
      (view === "day" ? 1 : view === "week" ? 7 : monthGridLength),
  );
  const rangeFrom = rangeStart.toISOString();
  const rangeTo = rangeEnd.toISOString();
  // Feriados usam a data da clínica (aaaa-mm-dd), com início e fim inclusivos.
  const lastRangeDay = new Date(rangeEnd);
  lastRangeDay.setDate(lastRangeDay.getDate() - 1);
  const holidayFrom = localIsoDate(rangeStart);
  const holidayTo = localIsoDate(lastRangeDay);
  const holidayNames = new Map(holidays.map((item) => [item.date, item.name]));
  const selectedHoliday = holidayNames.get(date);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const item = new Date(weekStart);
    item.setDate(item.getDate() + index);
    return item;
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      api.appointments(rangeFrom, rangeTo),
      api.scheduleBlocks(rangeFrom, rangeTo),
      api.groupSessions(rangeFrom, rangeTo),
      api.holidays(holidayFrom, holidayTo),
      api.professionals(),
      api.rooms(),
      api.services(),
      fetchAgendaPatients(canView("patients")),
    ])
      .then(
        ([
          appointmentData,
          blockData,
          groupSessionData,
          holidayData,
          professionalData,
          roomData,
          serviceData,
          patientData,
        ]) => {
          if (!active) return;
          setAppointments(
            appointmentData.filter(
              (item) =>
                !contextPatientId || item.patientId === contextPatientId,
            ),
          );
          setBlocks(blockData);
          setGroupSessions(groupSessionData);
          setHolidays(holidayData);
          setProfessionals(professionalData);
          setRooms(roomData);
          setServices(serviceData);
          setPatients(patientData.options);
          setPatientRecords(patientData.records);
        },
      )
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contextPatientId, rangeFrom, rangeTo, holidayFrom, holidayTo, canView]);
  function moveDay(amount: number) {
    setLoading(true);
    setError("");
    setSelectedDate((current) => {
      const next = new Date(current);
      if (view === "month") {
        const day = current.getDate();
        next.setDate(1);
        next.setMonth(current.getMonth() + amount);
        next.setDate(
          Math.min(
            day,
            new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
          ),
        );
      } else {
        next.setDate(current.getDate() + amount * (view === "week" ? 7 : 1));
      }
      return next;
    });
  }
  // Período exibido (dia, semana ou mês) que contém a data, para saber se a busca muda.
  function periodKey(day: Date) {
    if (view === "month") return `${day.getFullYear()}-${day.getMonth()}`;
    const start = new Date(day);
    start.setHours(12, 0, 0, 0);
    if (view === "week")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return localIsoDate(start);
  }
  /** Leva a agenda à data do (primeiro) atendimento salvo e o destaca. */
  function showSaved(saved: Appointment[]) {
    const first = [...saved].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    )[0];
    if (!first) return;
    const target = new Date(first.startsAt);
    if (periodKey(target) !== periodKey(selectedDate)) {
      setLoading(true);
      setError("");
    }
    setSelectedDate(target);
    setHighlightedIds(saved.map((item) => item.id));
  }

  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        title="Agenda"
        description="Visualize atendimentos, turmas, profissionais e salas sem conflitos."
        action={
          (canBlock || canSchedule) && (
            <div className="page-actions">
              {canBlock && can("agenda.blocks_create") && (
                <button
                  className="secondary-button"
                  onClick={() => setBlockModalOpen(true)}
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  Bloquear horário
                </button>
              )}
              {canSchedule && can("agenda.create") && (
                <button
                  className="primary-button"
                  onClick={() => {
                    setNewSlot(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus size={18} />
                  Novo atendimento
                </button>
              )}
            </div>
          )
        }
      />
      {!canSchedule && <ReadOnlyNotice module="agenda" />}
      {error && <ErrorBanner error={error} />}
      <section className="panel agenda-panel">
        <div className="agenda-toolbar">
          <div className="date-navigator">
            <span className="agenda-calendar-icon" aria-hidden="true">
              <CalendarDays size={22} />
            </span>
            <button
              className="icon-button"
              onClick={() => moveDay(-1)}
              aria-label={
                view === "month"
                  ? "Mês anterior"
                  : view === "week"
                    ? "Semana anterior"
                    : "Dia anterior"
              }
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="date-button"
              onClick={() => setSelectedDate(new Date())}
            >
              <strong>
                {view === "month"
                  ? selectedDate.toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric",
                    })
                  : view === "week"
                    ? weekRangeLabel(weekStart, weekDays[6]!)
                    : dateLabel.format(selectedDate)}
              </strong>
              <small>
                {view === "month"
                  ? "Voltar para hoje"
                  : view === "week"
                    ? `${shortDate.format(weekStart)} — ${shortDate.format(weekDays[6]!)}`
                    : date === localIsoDate()
                      ? "Hoje"
                      : shortDate.format(selectedDate)}
              </small>
            </button>
            <button
              className="icon-button"
              onClick={() => moveDay(1)}
              aria-label={
                view === "month"
                  ? "Próximo mês"
                  : view === "week"
                    ? "Próxima semana"
                    : "Próximo dia"
              }
            >
              <ChevronRight size={19} />
            </button>
          </div>
          <div className="agenda-toolbar-end">
            <div
              className="view-toggle"
              role="group"
              aria-label="Visualização da agenda"
            >
              <button
                className={`tab-button ${view === "day" ? "active" : ""}`}
                aria-pressed={view === "day"}
                onClick={() => setView("day")}
              >
                Dia
              </button>
              <button
                className={`tab-button ${view === "week" ? "active" : ""}`}
                aria-pressed={view === "week"}
                onClick={() => setView("week")}
              >
                Semana
              </button>
              <button
                className={`tab-button ${view === "month" ? "active" : ""}`}
                aria-pressed={view === "month"}
                onClick={() => setView("month")}
              >
                Mês
              </button>
            </div>
            {view === "day" && (
              <div className="view-toggle" aria-label="Formato do dia">
                <button
                  className={`tab-button ${dayLayout === "grid" ? "active" : ""}`}
                  onClick={() => setDayLayout("grid")}
                >
                  Grade
                </button>
                <button
                  className={`tab-button ${dayLayout === "list" ? "active" : ""}`}
                  onClick={() => setDayLayout("list")}
                >
                  Lista
                </button>
              </div>
            )}
            <label className="checkbox-field agenda-cancelled-toggle">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(event) => setShowCancelled(event.target.checked)}
              />
              Mostrar cancelados
            </label>
            <AgendaStatusLegend />
          </div>
        </div>
        {professionals.length > 0 && (
          <div className="agenda-professionals">
            <span className="agenda-legend-label">Profissionais</span>
            <div className="legend" aria-label="Legenda dos profissionais">
              {professionals.map((professional) => (
                <span key={professional.id}>
                  <i
                    className="pro-dot"
                    style={professionalColorStyle(professional.color)}
                    aria-hidden="true"
                  />
                  {professional.fullName.replace(/Dra?\. /, "")}
                </span>
              ))}
            </div>
            <label className="agenda-professional-filter">
              Profissional
              <select
                value={professionalFilter}
                onChange={(event) => setProfessionalFilter(event.target.value)}
              >
                <option value="">Todos os profissionais</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <LoadingBlock />
        ) : view === "month" ? (
          <div className="month-agenda">
            <div className="month-weekdays" aria-hidden="true">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const dayKey = localIsoDate(day);
                const dayAppointments = visibleAppointments.filter(
                  (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
                );
                const activeCount = dayAppointments.filter(
                  (item) => item.status !== "cancelled",
                ).length;
                const dayBlocks = shownBlocks.filter(
                  (item) =>
                    localIsoDate(new Date(item.startsAt)) === dayKey &&
                    item.status === "active",
                );
                const dayGroups = shownGroupSessions.filter(
                  (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
                );
                const dayEvents = sortAgendaEntries({
                  appointments: dayAppointments,
                  groupSessions: dayGroups,
                });
                const dayHoliday = holidayNames.get(dayKey);
                return (
                  <div
                    className={`month-day ${day.getMonth() !== selectedDate.getMonth() ? "outside" : ""} ${dayKey === localIsoDate() ? "today" : ""} ${dayKey === date ? "selected" : ""}`}
                    key={dayKey}
                    onClick={(event) => {
                      // Botões internos (atendimento, "ver todos") têm ação própria.
                      if (!(event.target as HTMLElement).closest("button"))
                        setEventsDay(day);
                    }}
                  >
                    <button
                      type="button"
                      className="month-day-head"
                      onClick={() => setEventsDay(day)}
                      aria-label={`${day.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}: ${activeCount} atendimentos, ${dayGroups.length} aulas de turma, ${dayBlocks.length} bloqueios${dayHoliday ? `, feriado: ${dayHoliday}` : ""}`}
                    >
                      <strong>{day.getDate()}</strong>
                      {activeCount > 0 && (
                        <small>
                          {activeCount}{" "}
                          {activeCount === 1 ? "atendimento" : "atendimentos"}
                        </small>
                      )}
                    </button>
                    <span className="month-day-events">
                      {dayHoliday && (
                        <span
                          className="month-holiday"
                          title={`Feriado: ${dayHoliday}`}
                        >
                          {dayHoliday}
                        </span>
                      )}
                      {dayEvents.slice(0, 2).map((entry) =>
                        entry.kind === "appointment" ? (
                          <button
                            type="button"
                            className={`month-event ${appointmentStatusClass(entry.appointment.status)}${highlightClass(entry.appointment.id)}`}
                            style={professionalColorStyle(
                              entry.appointment.professionalColor,
                            )}
                            key={entry.appointment.id}
                            onClick={() =>
                              setSelectedAppointmentId(entry.appointment.id)
                            }
                            aria-label={`Detalhes de ${entry.appointment.patientName}, ${timeLabel.format(new Date(entry.appointment.startsAt))} a ${timeLabel.format(new Date(entry.appointment.endsAt))}${visitTypeBadgeText(entry.appointment) ? `, ${visitTypeBadgeText(entry.appointment)}` : ""}${isAppointmentPendingFinalization(entry.appointment) ? `, ${pendingFinalizationLabel.toLowerCase()}` : ""}`}
                          >
                            <span className="month-event-time">
                              <i className="pro-dot" aria-hidden="true" />
                              <time>
                                {timeLabel.format(
                                  new Date(entry.appointment.startsAt),
                                )}
                                –
                                {timeLabel.format(
                                  new Date(entry.appointment.endsAt),
                                )}
                              </time>
                            </span>
                            <span className="month-event-name">
                              {entry.appointment.patientName}
                            </span>
                            <PendingFinalizationBadge
                              compact
                              appointment={entry.appointment}
                            />
                          </button>
                        ) : entry.kind === "group" ? (
                          <span
                            className="month-group"
                            key={entry.session.id}
                            style={professionalColorStyle(
                              professionalColors.get(
                                entry.session.professionalId,
                              ),
                            )}
                            title={`${entry.session.groupName} · ${entry.session.professionalName} · ${entry.session.roomName}`}
                          >
                            <span className="month-event-time">
                              <i className="pro-dot" aria-hidden="true" />
                              <time>
                                {timeLabel.format(
                                  new Date(entry.session.startsAt),
                                )}
                                –
                                {timeLabel.format(
                                  new Date(entry.session.endsAt),
                                )}
                              </time>
                            </span>
                            <span className="month-event-name group-name">
                              {entry.session.groupName}
                            </span>
                          </span>
                        ) : null,
                      )}
                      {dayEvents.length > 2 && (
                        <button
                          type="button"
                          className={`month-more${dayEvents
                            .slice(2)
                            .some(
                              (entry) =>
                                entry.kind === "appointment" &&
                                highlightedIds.includes(entry.appointment.id),
                            )
                            ? " agenda-just-saved"
                            : ""}`}
                          onClick={() => setEventsDay(day)}
                        >
                          +{dayEvents.length - 2}{" "}
                          {dayEvents.length - 2 === 1 ? "evento" : "eventos"}
                        </button>
                      )}
                      {dayBlocks.length > 0 && (
                        <span className="month-block">
                          {dayBlocks.length}{" "}
                          {dayBlocks.length === 1 ? "bloqueio" : "bloqueios"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "week" ? (
          <div className="week-agenda">
            {weekDays.map((day) => {
              const dayKey = localIsoDate(day);
              const dayAppointments = visibleAppointments.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayBlocks = shownBlocks.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayGroups = shownGroupSessions.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayHoliday = holidayNames.get(dayKey);
              return (
                <section key={dayKey}>
                  <header className={dayKey === localIsoDate() ? "today" : ""}>
                    <span>
                      {day.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </span>
                    <strong>{day.getDate()}</strong>
                  </header>
                  <div>
                    {dayHoliday && (
                      <span className="week-holiday">
                        Feriado: {dayHoliday}
                      </span>
                    )}
                    {sortAgendaEntries({
                      appointments: dayAppointments,
                      groupSessions: dayGroups,
                      blocks: dayBlocks,
                    }).map((entry) =>
                      entry.kind === "block" ? (
                        <ScheduleBlockCard
                          compact
                          block={entry.block}
                          key={entry.block.id}
                          onCancel={
                            can("agenda.blocks_cancel")
                              ? () => setCancellingBlock(entry.block)
                              : undefined
                          }
                        />
                      ) : entry.kind === "group" ? (
                        <GroupSessionCard
                          compact
                          session={entry.session}
                          professionalColor={professionalColors.get(
                            entry.session.professionalId,
                          )}
                          key={entry.session.id}
                        />
                      ) : (
                        <article
                          className={`week-appointment ${appointmentStatusClass(entry.appointment.status)}${highlightClass(entry.appointment.id)}`}
                          style={professionalColorStyle(
                            entry.appointment.professionalColor,
                          )}
                          key={entry.appointment.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Detalhes de ${entry.appointment.patientName}`}
                          onClick={() =>
                            setSelectedAppointmentId(entry.appointment.id)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.target === event.currentTarget &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              setSelectedAppointmentId(entry.appointment.id);
                            }
                          }}
                        >
                          <i className="pro-dot" aria-hidden="true" />
                          <time>
                            {timeLabel.format(
                              new Date(entry.appointment.startsAt),
                            )}
                            –
                            {timeLabel.format(
                              new Date(entry.appointment.endsAt),
                            )}
                          </time>
                          <strong>{entry.appointment.patientName}</strong>
                          <span>{entry.appointment.serviceName}</span>
                          <VisitTypeBadge appointment={entry.appointment} />
                          <PendingFinalizationBadge
                            compact
                            appointment={entry.appointment}
                          />
                        </article>
                      ),
                    )}
                    {!dayHoliday &&
                      dayAppointments.length === 0 &&
                      dayBlocks.length === 0 &&
                      dayGroups.length === 0 && (
                        <span className="week-empty">Livre</span>
                      )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : dayLayout === "grid" && professionals.length > 0 ? (
          <div className="day-agenda">
            {selectedHoliday && (
              <p className="holiday-notice">Feriado: {selectedHoliday}</p>
            )}
            <DayScheduleGrid
              day={selectedDate}
              professionals={
                professionalFilter
                  ? professionals.filter(
                      (item) => item.id === professionalFilter,
                    )
                  : professionals
              }
              appointments={visibleAppointments}
              groupSessions={shownGroupSessions}
              blocks={shownBlocks}
              onOpenAppointment={setSelectedAppointmentId}
              highlightedIds={highlightedIds}
              onCreate={
                canSchedule && can("agenda.create") && !selectedHoliday
                  ? (professionalId, startsAt) => {
                      setNewSlot({ professionalId, startsAt });
                      setModalOpen(true);
                    }
                  : undefined
              }
            />
          </div>
        ) : visibleAppointments.length === 0 &&
          shownBlocks.length === 0 &&
          shownGroupSessions.length === 0 ? (
          selectedHoliday ? (
            <div className="day-agenda">
              <p className="holiday-notice">Feriado: {selectedHoliday}</p>
              <EmptyState
                title="Sem atendimentos"
                copy="A agenda não aceita novos atendimentos nesta data."
              />
            </div>
          ) : (
            <EmptyState
              title="Dia disponível"
              copy="Não há atendimentos agendados para esta data."
            />
          )
        ) : (
          <div className="day-agenda">
            <header className="agenda-day-heading">
              <h2>Programação do dia</h2>
              <span>
                {dayEventCount} {dayEventCount === 1 ? "evento" : "eventos"}
              </span>
            </header>
            {selectedHoliday && (
              <p className="holiday-notice">Feriado: {selectedHoliday}</p>
            )}
            {sortAgendaEntries({
              appointments: visibleAppointments,
              groupSessions: shownGroupSessions,
              blocks: shownBlocks,
            }).map((entry) =>
              entry.kind === "block" ? (
                <ScheduleBlockCard
                  block={entry.block}
                  key={entry.block.id}
                  onCancel={
                    can("agenda.blocks_cancel")
                      ? () => setCancellingBlock(entry.block)
                      : undefined
                  }
                />
              ) : entry.kind === "group" ? (
                <GroupSessionCard
                  session={entry.session}
                  professionalColor={professionalColors.get(
                    entry.session.professionalId,
                  )}
                  key={entry.session.id}
                />
              ) : (
                <AgendaCard
                  appointment={entry.appointment}
                  key={entry.appointment.id}
                  highlighted={highlightedIds.includes(entry.appointment.id)}
                  onOpen={() => openAppointment(entry.appointment.id, "view")}
                  onHistory={() => setHistoryAppointment(entry.appointment)}
                  onEdit={
                    canSchedule
                      ? () => openAppointment(entry.appointment.id, "edit")
                      : undefined
                  }
                  onReschedule={
                    canSchedule
                      ? () => setRescheduling(entry.appointment)
                      : undefined
                  }
                  onCancel={
                    canSchedule
                      ? () => openAppointment(entry.appointment.id, "cancel")
                      : undefined
                  }
                  onStatus={
                    can("agenda.attendance") || can("agenda.cancel")
                      ? (status) =>
                          changeAppointmentStatus(entry.appointment, status)
                      : undefined
                  }
                />
              ),
            )}
          </div>
        )}
      </section>
      {modalOpen && (
        <AppointmentModal
          fixedPatient={patients.find((item) => item.id === contextPatientId)}
          patients={patients}
          professionals={professionals}
          rooms={rooms}
          services={services}
          onPatientCreated={(patient) => {
            setPatients((items) => [
              ...items.filter((item) => item.id !== patient.id),
              patient,
            ]);
            setPatientRecords((items) => [
              ...items.filter((item) => item.id !== patient.id),
              patient,
            ]);
          }}
          initialSlot={newSlot ?? undefined}
          onClose={() => setModalOpen(false)}
          onCreated={(appointment) => {
            toast.success(
              appointment.length > 1
                ? `${appointment.length} atendimentos agendados.`
                : "Atendimento agendado.",
            );
            setAppointments((items) =>
              [
                ...items,
                ...appointment.filter(
                  (item) => item.startsAt < rangeTo && item.endsAt > rangeFrom,
                ),
              ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
            showSaved(appointment);
            setModalOpen(false);
          }}
        />
      )}
      {blockModalOpen && (
        <ScheduleBlockModal
          date={selectedDate}
          professionals={professionals}
          rooms={rooms}
          onClose={() => setBlockModalOpen(false)}
          onCreated={(block) => {
            toast.success("Bloqueio criado.");
            if (block.startsAt < rangeTo && block.endsAt > rangeFrom)
              setBlocks((items) =>
                [...items, block].sort((a, b) =>
                  a.startsAt.localeCompare(b.startsAt),
                ),
              );
            setBlockModalOpen(false);
          }}
        />
      )}
      {absence && (
        <AppointmentAbsenceModal
          appointment={absence.appointment}
          status={absence.status}
          onClose={() => setAbsence(null)}
          onConfirm={async (reason) => {
            const updated = await api.updateAppointmentStatus(
              absence.appointment.id,
              absence.status,
              reason || undefined,
            );
            setAppointments((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            );
            toast.success(appointmentStatusToast(updated.status));
            setAbsence(null);
          }}
        />
      )}
      {rescheduling && (
        <AppointmentRescheduleModal
          appointment={rescheduling}
          service={services.find(
            (item) => item.id === rescheduling.serviceId,
          )}
          professionals={professionals}
          rooms={rooms}
          onClose={() => setRescheduling(null)}
          onSaved={(updated) => {
            toast.success("Atendimento remarcado.");
            setAppointments((items) =>
              items
                .map((item) => (item.id === updated.id ? updated : item))
                .filter(
                  (item) => item.startsAt < rangeTo && item.endsAt > rangeFrom,
                )
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
            showSaved([updated]);
            setRescheduling(null);
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailsModal
          key={`${selectedAppointment.id}-${detailsMode}`}
          initialEditing={detailsMode === "edit"}
          initialCancelConfirmation={detailsMode === "cancel"}
          appointment={selectedAppointment}
          patient={patientRecords.find(
            (item) => item.id === selectedAppointment.patientId,
          )}
          service={services.find(
            (item) => item.id === selectedAppointment.serviceId,
          )}
          onClose={closeAppointment}
          editable={canSchedule}
          onReschedule={() => {
            closeAppointment();
            setRescheduling(selectedAppointment);
          }}
          onEdited={(updated) => {
            toast.success("Atendimento atualizado.");
            setAppointments((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            );
            showSaved([updated]);
          }}
          onUpdated={(updated) => {
            toast.success(appointmentStatusToast(updated.status));
            setAppointments((items) =>
              items.map((item) => (item.id === updated.id ? updated : item)),
            );
            // Realizado continua aberto (satisfação) e cancelado também (avisar o
            // cliente por WhatsApp); os demais fecham.
            if (
              updated.status !== "completed" &&
              updated.status !== "cancelled"
            )
              closeAppointment();
          }}
        />
      )}
      {eventsDay && (
        <DayEventsModal
          day={eventsDay}
          holidayName={holidayNames.get(localIsoDate(eventsDay))}
          appointments={visibleAppointments.filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay),
          )}
          groupSessions={shownGroupSessions.filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay),
          )}
          blocks={shownBlocks.filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) ===
                localIsoDate(eventsDay) && item.status === "active",
          )}
          professionalColors={professionalColors}
          onClose={() => setEventsDay(null)}
          onOpenAppointment={(id) => {
            setEventsDay(null);
            setSelectedAppointmentId(id);
          }}
          onOpenDay={() => {
            setSelectedDate(eventsDay);
            setView("day");
            setEventsDay(null);
          }}
        />
      )}
      {historyAppointment && (
        <AppointmentRescheduleHistoryModal
          appointment={historyAppointment}
          onClose={() => setHistoryAppointment(null)}
        />
      )}
      {cancellingBlock && (
        <CancelBlockModal
          block={cancellingBlock}
          onClose={() => setCancellingBlock(null)}
          onConfirm={() => cancelBlock(cancellingBlock)}
        />
      )}
    </>
  );

  async function changeAppointmentStatus(
    appointment: Appointment,
    status: AppointmentStatus,
  ) {
    if (
      ["no_show", "excused_absence", "professional_absence"].includes(status)
    ) {
      setAbsence({ appointment, status });
      return;
    }
    try {
      const updated = await api.updateAppointmentStatus(appointment.id, status);
      setAppointments((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(appointmentStatusToast(updated.status));
    } catch (cause) {
      setError((cause as Error).message);
      toast.error((cause as Error).message);
    }
  }

  async function cancelBlock(block: ScheduleBlock) {
    const updated = await api.cancelScheduleBlock(block.id);
    setBlocks((items) => items.filter((item) => item.id !== updated.id));
    setCancellingBlock(null);
    toast.success("Bloqueio cancelado.");
  }
}
