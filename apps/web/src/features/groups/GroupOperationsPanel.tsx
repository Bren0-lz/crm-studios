import { usePatientContext } from "../../shared/hooks/usePatientContext";
import {
  groupEnrollmentCoversSession,
  type GroupWorkspace,
  type GroupSession,
} from "@crm/contracts";
import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import {
  missingLabels,
  useMissingFields,
} from "../../shared/components/MissingFields";
import {
  clinicIsoDate,
  groupOperationRange,
} from "../../shared/lib/formatting";
import { GroupSessionsCalendar } from "./GroupSessionsCalendar";

/** Mês visível do calendário: o período consultado fica com a página de turmas. */
export type GroupCalendarState = {
  month: string;
  loading: boolean;
  error: string;
  onMonthChange: (month: string) => void;
  onRetry: () => void;
};

export function GroupOperationsPanel({
  groupId,
  workspace,
  calendar,
  initialSessionStartsAt,
  busy,
  onBusyChange,
  onSelectSession,
  onChanged,
}: {
  groupId: string;
  workspace: GroupWorkspace;
  calendar: GroupCalendarState;
  /** Encontro aberto pelo link da agenda: o calendário começa na data dele. */
  initialSessionStartsAt?: string | undefined;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSelectSession: (sessionId: string) => void;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const patientId = usePatientContext();
  const contextGroups = new Set(
    workspace.enrollments
      .filter((item) => item.patientId === patientId)
      .map((item) => item.groupId),
  );
  const contextSessions = new Set(
    workspace.attendance
      .filter((item) => item.patientId === patientId)
      .map((item) => item.sessionId),
  );
  const sessions = workspace.sessions.filter(
    (item) =>
      item.groupId === groupId &&
      (!patientId ||
        contextGroups.has(item.groupId) ||
        contextSessions.has(item.id)),
  );
  const [creditId, setCreditId] = useState("");
  const [targetId, setTargetId] = useState("");
  const replacementMissing = useMissingFields(
    missingLabels([
      ["Crédito de reposição", creditId],
      ["Encontro de reposição", targetId],
    ]),
  );
  const [bookingError, setBookingError] = useState("");
  const [booked, setBooked] = useState("");
  // Instante de referência para "encontro futuro"; renovado ao escolher o crédito.
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();
  const timezone = useClinicTimezone();
  // Hoje no fuso da clínica; o dia escolhido sobrevive às atualizações após gravações.
  const today = clinicIsoDate(new Date(now), timezone);
  const [selectedDate, setSelectedDate] = useState(() =>
    initialSessionStartsAt
      ? clinicIsoDate(initialSessionStartsAt, timezone)
      : today,
  );
  const available = workspace.replacementCredits.filter(
    (item) =>
      item.status === "available" &&
      item.sourceGroupId === groupId &&
      (!patientId || item.patientId === patientId),
  );
  const credit = available.find((item) => item.id === creditId);
  const sourceGroup = workspace.groups.find(
    (item) => item.id === credit?.sourceGroupId,
  );
  /** Vagas do encontro: capacidade − matrículas vigentes na data − reposições reservadas. */
  const seatsLeft = (item: GroupSession) => {
    const group = workspace.groups.find((entry) => entry.id === item.groupId);
    if (!group) return 0;
    const enrolled = new Set(
      workspace.enrollments
        .filter(
          (entry) =>
            entry.groupId === item.groupId &&
            groupEnrollmentCoversSession(entry, item, timezone),
        )
        .map((entry) => entry.patientId),
    );
    const replacements = workspace.attendance.filter(
      (entry) =>
        entry.sessionId === item.id &&
        entry.status === "replacement" &&
        !["cancelled", "excused_absence"].includes(entry.outcome ?? ""),
    ).length;
    return group.capacity - enrolled.size - replacements;
  };
  // Reposição só em encontro futuro, com vaga, do mesmo serviço e diferente do encontro da falta.
  const targets = credit
    ? workspace.sessions
        .filter(
          (item) =>
            item.status === "scheduled" &&
            item.id !== credit.sourceSessionId &&
            new Date(item.startsAt).getTime() > now &&
            // Mesma janela operacional de antes, qualquer que seja o mês visível.
            new Date(item.startsAt) <=
              new Date(groupOperationRange(new Date(now)).to) &&
            sourceGroup &&
            workspace.groups.find((group) => group.id === item.groupId)
              ?.serviceId === sourceGroup.serviceId,
        )
        .map((item) => ({ session: item, seats: seatsLeft(item) }))
        .filter((item) => item.seats > 0)
    : [];
  const dayMonth = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(value));
  const targetLabel = (item: GroupSession, seats: number) =>
    `${item.groupName} · ${dayMonth(item.startsAt)} · ${new Intl.DateTimeFormat(
      "pt-BR",
      {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(
      new Date(item.startsAt),
    )} · ${seats} ${seats === 1 ? "vaga" : "vagas"}`;
  async function bookReplacement() {
    const target = targets.find((item) => item.session.id === targetId);
    if (!credit || !target) return;
    onBusyChange(true);
    setBookingError("");
    setBooked("");
    try {
      await api.bookReplacement({ creditId: credit.id, sessionId: targetId });
      const message = `Reposição de ${credit.patientName.split(" ")[0]} marcada para ${dayMonth(target.session.startsAt)}`;
      setCreditId("");
      setTargetId("");
      setBooked(message);
      toast.success(message);
      await onChanged();
    } catch (cause) {
      const message = (cause as Error).message;
      setBookingError(message);
      toast.error(message);
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <section className="panel group-operations-panel">
      <div className="panel-head">
        <h2>Frequência e reposições</h2>
        <p>
          Registre o comparecimento de cada cliente e acompanhe os créditos.
        </p>
      </div>
      <div className="group-operations-body">
        <GroupSessionsCalendar
          month={calendar.month}
          today={today}
          selectedDate={selectedDate}
          sessions={sessions}
          timezone={timezone}
          busy={busy}
          loading={calendar.loading}
          error={calendar.error}
          onRetry={calendar.onRetry}
          onMonthChange={(month, date) => {
            setSelectedDate(date);
            calendar.onMonthChange(month);
          }}
          onSelectDate={setSelectedDate}
          onSelectSession={onSelectSession}
        />
        {can("groups.replacement") && booked && (
          <div className="success-banner" role="status">
            {booked}
          </div>
        )}
        {can("groups.replacement") && !available.length && (
          <EmptyState
            icon={CalendarClock}
            title="Nenhum crédito de reposição disponível"
            copy="Os créditos surgem quando uma falta é registrada como justificada."
          />
        )}
        {can("groups.replacement") && available.length > 0 && (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void bookReplacement();
            }}
          >
            {bookingError && <div className="form-error">{bookingError}</div>}
            <label>
              Crédito de reposição
              <select
                required
                disabled={busy}
                value={creditId}
                onChange={(event) => {
                  setCreditId(event.target.value);
                  setNow(Date.now());
                  setTargetId("");
                }}
              >
                <option value="">Selecione</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.patientName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Encontro de reposição
              <select
                required
                disabled={busy}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Selecione</option>
                {targets.map(({ session: item, seats }) => (
                  <option key={item.id} value={item.id}>
                    {targetLabel(item, seats)}
                  </option>
                ))}
              </select>
            </label>
            {replacementMissing.hint}
            <button
              className="primary-button"
              disabled={busy || replacementMissing.blocked}
              aria-describedby={replacementMissing.describedBy}
            >
              Reservar reposição
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
