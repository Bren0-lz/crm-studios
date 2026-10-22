import {
  appointmentNotStartedMessage,
  groupEnrollmentCoversSession,
  isAppointmentStarted,
  patientFirstName,
  type GroupSession,
  type GroupWorkspace,
  type Professional,
} from "@crm/contracts";
import { CheckCheck } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { groupSessionLabel } from "./model";

export function GroupSessionModal({
  meeting,
  workspace,
  professionals,
  busy,
  refreshError,
  onBusyChange,
  onChanged,
  onClose,
}: {
  meeting: GroupSession;
  workspace: GroupWorkspace;
  professionals: Professional[];
  busy: boolean;
  refreshError: string;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { can } = useAuthorization();
  const patientId = usePatientContext();
  const timezone = useClinicTimezone();
  const toast = useToast();
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    onBusyChange(true);
    setError("");
    try {
      await action();
      toast.success(success);
      await onChanged();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      onBusyChange(false);
    }
  }
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
    can("groups.attendance") &&
    meeting.status !== "cancelled" &&
    unrecorded.length > 0;
  async function markAllPresent(sessionId: string, targets: typeof regular) {
    const failures: string[] = [];
    let done = 0;
    onBusyChange(true);
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
      onBusyChange(false);
    }
  }
  return (
    <>
      <Modal
        title={meeting.groupName}
        subtitle={groupSessionLabel(meeting, timezone)}
        busy={busy}
        inactive={confirmAll}
        onClose={onClose}
        wide
      >
        {(error || refreshError) && (
          <ErrorBanner error={error || refreshError} />
        )}
        <div className="clinical-form">
          {can("groups.update") && (
            <label>
              Profissional deste encontro
              <select
                disabled={busy}
                value={meeting.professionalId}
                onChange={(event) =>
                  void run(
                    () =>
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
                      void run(
                        () =>
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
                    <option value="excused_absence">Falta justificada</option>
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
                        void run(
                          () =>
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
                      <option value="excused_absence">Falta justificada</option>
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
                aria-describedby={meetingStarted ? undefined : markAllHintId}
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
              onClick={onClose}
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
      {confirmAll && meetingStarted && (
        <ActionModal
          eyebrow="Frequência"
          title="Marcar todos presentes"
          subtitle={groupSessionLabel(meeting, timezone)}
          effect={`Registra presença para ${unrecorded.length === 1 ? "1 cliente" : `${unrecorded.length} clientes`} sem registro neste encontro: ${unrecorded.map((item) => item.patientName).join(", ")}. Quem já tem registro não é alterado.`}
          confirmLabel="Marcar presentes"
          onConfirm={() => markAllPresent(meeting.id, unrecorded)}
          onClose={() => setConfirmAll(false)}
        />
      )}
    </>
  );
}
