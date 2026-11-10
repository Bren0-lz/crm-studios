import type { Appointment, AppointmentStatus } from "@crm/contracts";
import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { shortDate, statusLabel, timeLabel } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Situações para as quais um atendimento concluído pode ser corrigido. */
type CorrectionStatus = Extract<
  AppointmentStatus,
  "no_show" | "excused_absence" | "professional_absence" | "cancelled"
>;

const corrections: Array<{
  status: CorrectionStatus;
  label: string;
  effect: string;
}> = [
  {
    status: "no_show",
    label: "Não compareceu",
    effect: "O cliente faltou: a sessão consumida volta para o plano.",
  },
  {
    status: "excused_absence",
    label: "Ausência justificada",
    effect:
      "O cliente avisou que não viria: a sessão consumida volta para o plano.",
  },
  {
    status: "professional_absence",
    label: "Ausência do profissional",
    effect:
      "O profissional não pôde atender: a sessão consumida volta para o plano.",
  },
  {
    status: "cancelled",
    label: "Cancelado",
    effect:
      "O atendimento não deveria ter acontecido: a sessão consumida volta para o plano e o horário é liberado.",
  },
];

const dateTime = (iso: string) => {
  const date = new Date(iso);
  return `${shortDate.format(date)} às ${timeLabel.format(date)}`;
};

/**
 * Detalhes de um atendimento concluído, com a correção da situação (ex.: finalização
 * automática de um atendimento em que o cliente faltou).
 */
export function CompletedAppointmentModal({
  appointment,
  onClose,
  onUpdated,
}: {
  appointment: Appointment;
  onClose: () => void;
  /** Recebe o atendimento com a nova situação. */
  onUpdated: (appointment: Appointment) => void;
}) {
  const { can, canView } = useAuthorization();
  const options = corrections.filter((option) =>
    can(option.status === "cancelled" ? "agenda.cancel" : "agenda.attendance"),
  );
  const [status, setStatus] = useState<"" | CorrectionStatus>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const missingId = useId();
  const dirty = useFormDirty({ status, reason });
  const selected = corrections.find((option) => option.status === status);
  // Na falta do cliente o motivo é opcional; nas demais situações, obrigatório.
  const reasonOptional = status === "no_show";
  const trimmed = reason.trim();
  const missing = [
    ...(status ? [] : ["Nova situação"]),
    ...(trimmed.length >= 2 || (reasonOptional && trimmed.length === 0)
      ? []
      : ["Motivo (pelo menos 2 caracteres)"]),
  ];
  const start = new Date(appointment.startsAt);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || missing.length > 0 || !status) return;
    setSaving(true);
    setError("");
    try {
      onUpdated(
        await api.updateAppointmentStatus(
          appointment.id,
          status,
          trimmed || undefined,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar a situação do atendimento.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Agenda"
      title="Atendimento concluído"
      subtitle={appointment.patientName}
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <div className="appointment-details">
        <section className="appointment-detail-section">
          <h3>O que foi registrado</h3>
          <div className="appointment-detail-grid">
            <div>
              <small>Situação</small>
              <strong>{statusLabel(appointment.status)}</strong>
            </div>
            <div>
              <small>Origem</small>
              {appointment.autoCompletedAt ? (
                <>
                  <span className="auto-finalized-badge">
                    Finalização automática
                  </span>
                  <span className="completed-appointment-origin">
                    Em {dateTime(appointment.autoCompletedAt)}
                  </span>
                </>
              ) : (
                <strong>Registrado pela equipe</strong>
              )}
            </div>
            <div>
              <small>Data</small>
              <strong>
                {start.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
            </div>
            <div>
              <small>Horário</small>
              <strong>
                {timeLabel.format(start)} –{" "}
                {timeLabel.format(new Date(appointment.endsAt))}
              </strong>
            </div>
            <div>
              <small>Serviço</small>
              <strong>{appointment.serviceName}</strong>
            </div>
            <div>
              <small>Profissional</small>
              <strong>{appointment.professionalName}</strong>
            </div>
            <div>
              <small>Sala</small>
              <strong>{appointment.roomName}</strong>
            </div>
            <div>
              <small>Última alteração</small>
              <strong>{dateTime(appointment.updatedAt)}</strong>
            </div>
            {appointment.notes && (
              <div className="detail-wide">
                <small>Observações do agendamento</small>
                <strong>{appointment.notes}</strong>
              </div>
            )}
          </div>
          {appointment.patientId && canView("patients") && (
            <Link
              className="text-link completed-appointment-patient-link"
              to={`/clientes/${appointment.patientId}`}
            >
              Abrir ficha do cliente
            </Link>
          )}
        </section>
        {options.length > 0 ? (
          <form
            className="appointment-detail-section form-grid completed-appointment-correction"
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <h3 className="span-2">Alterar situação</h3>
            <p className="span-2">
              {appointment.autoCompletedAt
                ? "Se a finalização automática foi por engano, registre o que realmente aconteceu."
                : "Se o atendimento foi registrado por engano, registre o que realmente aconteceu."}
            </p>
            <label>
              Nova situação
              <select
                required
                value={status}
                disabled={saving}
                onChange={(event) =>
                  setStatus(event.target.value as "" | CorrectionStatus)
                }
              >
                <option value="">Selecione</option>
                {options.map((option) => (
                  <option key={option.status} value={option.status}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              {reasonOptional || !status ? "Motivo (opcional)" : "Motivo"}
              <textarea
                rows={2}
                maxLength={500}
                required={!reasonOptional}
                value={reason}
                disabled={saving}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {selected && <p className="span-2">{selected.effect}</p>}
            {error && (
              <div className="form-error span-2" role="alert">
                {error}
              </div>
            )}
            {missing.length > 0 && (
              <p className="field-hint span-2" id={missingId}>
                Falta: {missing.join(", ")}.
              </p>
            )}
            <div className="modal-actions span-2">
              <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
              <button
                type="submit"
                className="primary-button"
                disabled={saving || missing.length > 0}
                aria-describedby={missing.length > 0 ? missingId : undefined}
              >
                {saving ? "Salvando…" : "Salvar situação"}
              </button>
            </div>
          </form>
        ) : (
          <div className="modal-actions">
            <ModalCancelButton>Fechar</ModalCancelButton>
          </div>
        )}
      </div>
    </Modal>
  );
}
