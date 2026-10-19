import { usePatientContext } from "../../shared/hooks/usePatientContext";
import {
  appointmentNotStartedMessage,
  groupEnrollmentCoversSession,
  isAppointmentStarted,
  patientFirstName,
  type GroupWorkspace,
  type GroupSession,
  type Professional,
} from "@crm/contracts";
import {
  CalendarClock,
  CheckCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import {
  clinicIsoDate,
  shortDate,
  timeLabel,
} from "../../shared/lib/formatting";

/** Encontros exibidos por vez em "Próximas" e "Anteriores". */
const SESSIONS_PAGE = 4;

export function GroupOperationsPanel({
  workspace,
  professionals,
  onChanged,
  initialSessionId,
}: {
  workspace: GroupWorkspace;
  professionals: Professional[];
  onChanged: () => Promise<void>;
  initialSessionId?: string | undefined;
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
      !patientId ||
      contextGroups.has(item.groupId) ||
      contextSessions.has(item.id),
  );
  const [selected, setSelected] = useState<GroupSession | null>(
    () =>
      workspace.sessions.find((item) => item.id === initialSessionId) ?? null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creditId, setCreditId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [booked, setBooked] = useState("");
  // Instante de referência para "encontro futuro"; renovado ao escolher o crédito.
  const [now, setNow] = useState(() => Date.now());
  const [upcomingLimit, setUpcomingLimit] = useState(SESSIONS_PAGE);
  const [pastLimit, setPastLimit] = useState(SESSIONS_PAGE);
  const [showPast, setShowPast] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const upcomingHeadingId = useId();
  const pastListId = useId();
  const toast = useToast();
  const timezone = useClinicTimezone();
  // "Próximas": a partir de hoje (fuso da clínica), da mais próxima à mais distante.
  const today = clinicIsoDate(new Date(now), timezone);
  const byStart = (a: GroupSession, b: GroupSession) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  const upcoming = sessions
    .filter((item) => clinicIsoDate(item.startsAt, timezone) >= today)
    .sort(byStart);
  const past = sessions
    .filter((item) => clinicIsoDate(item.startsAt, timezone) < today)
    .sort((a, b) => byStart(b, a));
  const meeting =
    selected &&
    (workspace.sessions.find((item) => item.id === selected.id) ?? selected);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      toast.success(success);
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sessionLabel = (item: GroupSession) =>
    `${item.groupName} · ${shortDate.format(new Date(item.startsAt))} · ${timeLabel.format(new Date(item.startsAt))}`;
  const attendance = meeting
    ? workspace.attendance.filter(
        (item) =>
          item.sessionId === meeting.id &&
          (!patientId || item.patientId === patientId),
      )
    : [];
  // Participantes do encontro: matrícula vigente na data (início ≤ data ≤ fim), um por cliente.
  const regular = meeting
    ? workspace.enrollments.filter(
        (item, index, all) =>
          item.groupId === meeting.groupId &&
          groupEnrollmentCoversSession(item, meeting) &&
          (!patientId || item.patientId === patientId) &&
          all.findIndex(
            (other) =>
              other.patientId === item.patientId &&
              other.groupId === meeting.groupId &&
              groupEnrollmentCoversSession(other, meeting),
          ) === index,
      )
    : [];
  // "Marcar todos presentes": participantes vigentes ainda sem nenhum registro no encontro.
  const unrecorded = regular.filter(
    (item) => !attendance.some((entry) => entry.patientId === item.patientId),
  );
  // Mesma regra da QC3 para atendimentos: só a partir de 15 min antes do início do encontro.
  const meetingStarted = meeting ? isAppointmentStarted(meeting) : false;
  const meetingAvailability =
    meeting && !meetingStarted
      ? appointmentNotStartedMessage(meeting.startsAt, timezone)
      : undefined;
  const markAllHintId = useId();
  const showMarkAll =
    meeting !== null &&
    can("groups.attendance") &&
    meeting.status !== "cancelled" &&
    unrecorded.length > 0;
  async function markAllPresent(sessionId: string, targets: typeof regular) {
    const failures: string[] = [];
    let done = 0;
    setBusy(true);
    setError("");
    try {
      // Uma chamada por cliente na rota de presença: mesmas permissões e regras do registro manual.
      for (const item of targets) {
        try {
          await api.recordGroupAttendance(sessionId, item.patientId, {
            status: "present",
          });
          done += 1;
        } catch (cause) {
          failures.push(
            cause instanceof Error
              ? cause.message
              : "Não foi possível registrar a presença.",
          );
        }
      }
      if (done === 0 && failures.length > 0) throw new Error(failures[0]);
      toast.success(
        done === 1 ? "1 presença registrada" : `${done} presenças registradas`,
      );
      if (failures.length > 0)
        toast.error(
          `${failures.length === 1 ? "1 presença não pôde ser registrada" : `${failures.length} presenças não puderam ser registradas`}: ${[...new Set(failures)].join(" ")}`,
        );
      setConfirmAll(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }
  const sessionButton = (item: GroupSession) => (
    <button
      className="secondary-button"
      key={item.id}
      onClick={() => setSelected(item)}
    >
      {sessionLabel(item)} ·{" "}
      {item.status === "completed" ? "Concluído" : "Agendado"}
    </button>
  );
  const available = workspace.replacementCredits.filter(
    (item) =>
      item.status === "available" &&
      (!patientId || item.patientId === patientId),
  );
  const credit = available.find((item) => item.id === creditId);
  const source = workspace.sessions.find(
    (item) => item.id === credit?.sourceSessionId,
  );
  const sourceGroup = workspace.groups.find(
    (item) => item.id === source?.groupId,
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
            (!sourceGroup ||
              workspace.groups.find((group) => group.id === item.groupId)
                ?.serviceId === sourceGroup.serviceId),
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
    `${dayMonth(item.startsAt)} · ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(item.startsAt))} · ${seats} ${seats === 1 ? "vaga" : "vagas"}`;
  async function bookReplacement() {
    const target = targets.find((item) => item.session.id === targetId);
    if (!credit || !target) return;
    setBusy(true);
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
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Frequência e reposições</h2>
        <p>
          Registre o comparecimento de cada cliente e acompanhe os créditos.
        </p>
      </div>
      <div className="group-operations-body">
        {error && <ErrorBanner error={error} />}
        {!sessions.length ? (
          <EmptyState
            title="Nenhum encontro no período"
            copy="Os encontros aparecerão após configurar a turma."
          />
        ) : (
          <>
            <section
              className="group-session-group"
              aria-labelledby={upcomingHeadingId}
            >
              <h3 id={upcomingHeadingId}>Próximas</h3>
              {upcoming.length ? (
                <div className="group-session-list">
                  {upcoming.slice(0, upcomingLimit).map(sessionButton)}
                </div>
              ) : (
                <p className="group-session-empty">
                  Nenhum encontro a partir de hoje.
                </p>
              )}
              {upcoming.length > upcomingLimit && (
                <button
                  type="button"
                  className="secondary-button button-sm"
                  onClick={() =>
                    setUpcomingLimit((value) => value + SESSIONS_PAGE)
                  }
                >
                  Mostrar mais
                </button>
              )}
            </section>
            {past.length > 0 && (
              <div className="group-session-group">
                <button
                  type="button"
                  className="secondary-button button-sm"
                  aria-expanded={showPast}
                  aria-controls={pastListId}
                  onClick={() => setShowPast((value) => !value)}
                >
                  {showPast ? (
                    <ChevronDown size={16} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={16} aria-hidden="true" />
                  )}
                  Anteriores ({past.length})
                </button>
                {showPast && (
                  <section
                    id={pastListId}
                    className="group-session-group"
                    aria-label="Anteriores"
                  >
                    <div className="group-session-list">
                      {past.slice(0, pastLimit).map(sessionButton)}
                    </div>
                    {past.length > pastLimit && (
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        onClick={() =>
                          setPastLimit((value) => value + SESSIONS_PAGE)
                        }
                      >
                        Mostrar mais
                      </button>
                    )}
                  </section>
                )}
              </div>
            )}
          </>
        )}
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
            <button
              className="primary-button"
              disabled={busy || !creditId || !targetId}
            >
              Reservar reposição
            </button>
          </form>
        )}
        {meeting && (
          <Modal
            title={meeting.groupName}
            subtitle={sessionLabel(meeting)}
            busy={busy}
            onClose={() => setSelected(null)}
            wide
          >
            {error && <ErrorBanner error={error} />}
            <div className="clinical-form">
              {can("groups.update") && (
                <label>
                  Profissional deste encontro
                  <select
                    disabled={busy}
                    value={meeting.professionalId}
                    onChange={(event) =>
                      void run(() =>
                        api.updateGroupSessionProfessional(
                          meeting.id,
                          event.target.value,
                        ),
                        "Profissional do encontro atualizado.",
                      )
                    }
                  >
                    {professionals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {regular.map((item) => {
                const record = attendance.find(
                  (entry) =>
                    entry.patientId === item.patientId &&
                    entry.status !== "replacement",
                );
                return (
                  <div className="table-row" key={item.id}>
                    <strong>{item.patientName}</strong>
                    <span>
                      {record?.status === "present"
                        ? "Presente"
                        : record?.status === "absent"
                          ? "Falta"
                          : record?.status === "excused_absence"
                            ? "Falta justificada"
                            : "Sem registro"}
                    </span>
                    {can("groups.attendance") && (
                      <select
                        aria-label={`Frequência de ${item.patientName}`}
                        disabled={busy}
                        value={record?.status ?? ""}
                        onChange={(event) =>
                          void run(() =>
                            api.recordGroupAttendance(
                              meeting.id,
                              item.patientId,
                              {
                                status: event.target.value as
                                  "present" | "absent" | "excused_absence",
                              },
                            ),
                            `Frequência de ${patientFirstName(item.patientName)} registrada.`,
                          )
                        }
                      >
                        <option value="" disabled>
                          Registrar
                        </option>
                        <option value="present">Presente</option>
                        <option value="absent">Falta</option>
                        <option value="excused_absence">
                          Falta justificada
                        </option>
                      </select>
                    )}
                    {record && !record.accountingEnabled && (
                      <small>Registro histórico; saldo preservado</small>
                    )}
                  </div>
                );
              })}
              {attendance
                .filter((item) => item.status === "replacement")
                .map((item) => (
                  <div className="table-row" key={item.id}>
                    <strong>{item.patientName} · Reposição</strong>
                    <span>
                      {item.outcome === "present"
                        ? "Presente"
                        : item.outcome === "absent"
                          ? "Falta"
                          : item.outcome === "excused_absence"
                            ? "Falta justificada"
                            : item.outcome === "cancelled"
                              ? "Cancelada"
                              : "Reservada"}
                    </span>
                    {can("groups.attendance") &&
                      !["cancelled", "excused_absence"].includes(
                        item.outcome ?? "",
                      ) && (
                        <select
                          aria-label={`Reposição de ${item.patientName}`}
                          disabled={busy}
                          value={item.outcome ?? "scheduled"}
                          onChange={(event) =>
                            void run(() =>
                              api.recordReplacementAttendance(
                                item.id,
                                event.target.value as
                                  | "present"
                                  | "absent"
                                  | "excused_absence"
                                  | "cancelled",
                              ),
                              event.target.value === "cancelled"
                                ? `Reposição de ${patientFirstName(item.patientName)} cancelada.`
                                : `Reposição de ${patientFirstName(item.patientName)} registrada.`,
                            )
                          }
                        >
                          <option value="scheduled" disabled>
                            Registrar
                          </option>
                          <option value="present">Presente</option>
                          <option value="absent">Falta</option>
                          <option value="excused_absence">
                            Falta justificada
                          </option>
                          <option value="cancelled">Cancelar reserva</option>
                        </select>
                      )}
                  </div>
                ))}
              <div className="modal-actions">
                {showMarkAll && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || !meetingStarted}
                    title={meetingAvailability}
                    aria-describedby={
                      meetingStarted ? undefined : markAllHintId
                    }
                    onClick={() => setConfirmAll(true)}
                  >
                    <CheckCheck size={18} aria-hidden="true" />
                    Marcar todos presentes
                  </button>
                )}
                {can("groups.complete") && meeting.status === "scheduled" && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api.completeGroupSession(meeting.id),
                        "Encontro concluído.",
                      )
                    }
                  >
                    Concluir encontro
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Fechar
                </button>
              </div>
              {showMarkAll && meetingAvailability && (
                <p className="field-hint" id={markAllHintId}>
                  {meetingAvailability}
                </p>
              )}
            </div>
          </Modal>
        )}
        {meeting && confirmAll && meetingStarted && (
          <ActionModal
            eyebrow="Frequência"
            title="Marcar todos presentes"
            subtitle={sessionLabel(meeting)}
            effect={`Registra presença para ${unrecorded.length === 1 ? "1 cliente" : `${unrecorded.length} clientes`} sem registro neste encontro: ${unrecorded.map((item) => item.patientName).join(", ")}. Quem já tem registro não é alterado.`}
            confirmLabel="Marcar presentes"
            onConfirm={() => markAllPresent(meeting.id, unrecorded)}
            onClose={() => setConfirmAll(false)}
          />
        )}
      </div>
    </section>
  );
}
