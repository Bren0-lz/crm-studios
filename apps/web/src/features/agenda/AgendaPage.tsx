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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const canSchedule = canEdit("agenda");
  // Bloqueios exigem editar Agenda E Clientes (mesma regra da API).
  const canBlock = can("agenda.blocks_create");
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
  const [eventsDay, setEventsDay] = useState<Date | null>(null);
  // Cancelados não ocupam horário: ficam fora das contagens e, por padrão, da agenda.
  const [showCancelled, setShowCancelled] = useState(false);
  const visibleAppointments = showCancelled
    ? appointments
    : appointments.filter((item) => item.status !== "cancelled");
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

  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        eyebrow="Operação diária"
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
            <div className="view-toggle">
              <button
                className={`tab-button ${view === "day" ? "active" : ""}`}
                onClick={() => setView("day")}
              >
                Dia
              </button>
              <button
                className={`tab-button ${view === "week" ? "active" : ""}`}
                onClick={() => setView("week")}
              >
                Semana
              </button>
              <button
                className={`tab-button ${view === "month" ? "active" : ""}`}
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
            <div className="legend">
              {professionals.map((professional) => (
                <span key={professional.id}>
                  <i
                    className="pro-dot"
                    style={professionalColorStyle(professional.color)}
                  />
                  {professional.fullName.replace(/Dra?\. /, "")}
                </span>
              ))}
            </div>
          </div>
        </div>
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
                const dayBlocks = blocks.filter(
                  (item) =>
                    localIsoDate(new Date(item.startsAt)) === dayKey &&
                    item.status === "active",
                );
                const dayGroups = groupSessions.filter(
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
                            className={`month-event ${appointmentStatusClass(entry.appointment.status)}`}
                            style={professionalColorStyle(
                              entry.appointment.professionalColor,
                            )}
                            key={entry.appointment.id}
                            onClick={() =>
                              setSelectedAppointmentId(entry.appointment.id)
                            }
                            aria-label={`Detalhes de ${entry.appointment.patientName}, ${timeLabel.format(new Date(entry.appointment.startsAt))} a ${timeLabel.format(new Date(entry.appointment.endsAt))}${visitTypeBadgeText(entry.appointment) ? `, ${visitTypeBadgeText(entry.appointment)}` : ""}`}
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
                          </button>
                        ) : entry.kind === "group" ? (
                          <span
                            className="month-group"
                            key={entry.session.id}
                            title={`${entry.session.groupName} · ${entry.session.professionalName} · ${entry.session.roomName}`}
                          >
                            <span className="month-event-time">
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
                          className="month-more"
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
              const dayBlocks = blocks.filter(
                (item) => localIsoDate(new Date(item.startsAt)) === dayKey,
              );
              const dayGroups = groupSessions.filter(
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
                          key={entry.session.id}
                        />
                      ) : (
                        <article
                          className={`week-appointment ${appointmentStatusClass(entry.appointment.status)}`}
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
              professionals={professionals}
              appointments={visibleAppointments}
              groupSessions={groupSessions}
              blocks={blocks}
              onOpenAppointment={setSelectedAppointmentId}
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
          blocks.length === 0 &&
          groupSessions.length === 0 ? (
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
            {selectedHoliday && (
              <p className="holiday-notice">Feriado: {selectedHoliday}</p>
            )}
            {sortAgendaEntries({
              appointments: visibleAppointments,
              groupSessions,
              blocks,
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
                  key={entry.session.id}
                />
              ) : (
                <AgendaCard
                  appointment={entry.appointment}
                  key={entry.appointment.id}
                  onOpen={() => setSelectedAppointmentId(entry.appointment.id)}
                  onHistory={() => setHistoryAppointment(entry.appointment)}
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
            setSelectedDate(new Date(updated.startsAt));
            setRescheduling(null);
          }}
        />
      )}
      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          patient={patientRecords.find(
            (item) => item.id === selectedAppointment.patientId,
          )}
          service={services.find(
            (item) => item.id === selectedAppointment.serviceId,
          )}
          onClose={() => setSelectedAppointmentId(null)}
          editable={canSchedule}
          onReschedule={() => {
            setSelectedAppointmentId(null);
            setRescheduling(selectedAppointment);
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
              setSelectedAppointmentId(null);
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
          groupSessions={groupSessions.filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) === localIsoDate(eventsDay),
          )}
          blocks={blocks.filter(
            (item) =>
              localIsoDate(new Date(item.startsAt)) ===
                localIsoDate(eventsDay) && item.status === "active",
          )}
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
