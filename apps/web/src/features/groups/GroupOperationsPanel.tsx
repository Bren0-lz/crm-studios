import { usePatientContext } from "../../shared/hooks/usePatientContext";
import {
  groupEnrollmentCoversSession,
  type GroupWorkspace,
  type GroupSession,
  type Professional,
} from "@crm/contracts";
import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";

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
  const toast = useToast();
  const timezone = useClinicTimezone();
  const meeting =
    selected &&
    (workspace.sessions.find((item) => item.id === selected.id) ?? selected);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
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
          <div className="group-session-list">
            {sessions.map((item) => (
              <button
                className="secondary-button"
                key={item.id}
                onClick={() => setSelected(item)}
              >
                {sessionLabel(item)} ·{" "}
                {item.status === "completed" ? "Concluído" : "Agendado"}
              </button>
            ))}
          </div>
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
                {can("groups.complete") && meeting.status === "scheduled" && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api.completeGroupSession(meeting.id))
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
            </div>
          </Modal>
        )}
      </div>
    </section>
  );
}
