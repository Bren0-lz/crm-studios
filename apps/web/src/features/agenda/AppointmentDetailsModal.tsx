import {
  appointmentNotStartedMessage,
  isAppointmentStarted,
  patientFirstName,
  type Appointment,
  type AppointmentStatus,
  type Patient,
  type SatisfactionSurvey,
  type Service,
  formatCpf,
  formatPhone,
  whatsappLink,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import { VisitTypeBadge } from "../../shared/components/VisitTypeBadge";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import {
  currency,
  formatIsoDate,
  localIsoDate,
  statusLabel,
  tagColorLookup,
  timeLabel,
  visitTypeBadgeText,
  emergencyContactLabel,
} from "../../shared/lib/formatting";
import { addDaysToIsoDate } from "../relationship/index";
import { AppointmentEditModal } from "./AppointmentEditModal";
import { SatisfactionSurveyModal } from "./SatisfactionSurveyModal";

const cancellationReasons = [
  "Cliente desmarcou",
  "Cliente não pode comparecer",
  "Profissional indisponível",
  "Remarcação",
  "Outro",
];

/** Mensagem para avisar o cliente do cancelamento (primeiro nome, data e horário). */
function cancellationMessage(appointment: Appointment) {
  const firstName = patientFirstName(appointment.patientName);
  const start = new Date(appointment.startsAt);
  return `Olá, ${firstName}! Seu atendimento de ${appointment.serviceName} em ${start.toLocaleDateString("pt-BR")} às ${timeLabel.format(start)} foi cancelado. Se quiser remarcar, é só responder esta mensagem.`;
}

export function AppointmentDetailsModal({
  appointment,
  patient,
  service,
  onClose,
  onReschedule,
  onUpdated,
  onEdited,
  editable,
  initialCancelConfirmation = false,
  initialEditing = false,
}: {
  appointment: Appointment;
  patient: Patient | undefined;
  service: Service | undefined;
  onClose: () => void;
  onReschedule: () => void;
  /** Recebe o atendimento com o novo status (cancelado, confirmado, realizado ou falta). */
  onUpdated: (appointment: Appointment) => void;
  /** Serviço, sala ou observação alterados em "Editar" (QM6). */
  onEdited: (appointment: Appointment) => void;
  /** Sem edição da Agenda: só consulta (sem cancelar, remarcar ou registrar satisfação). */
  editable: boolean;
  initialCancelConfirmation?: boolean;
  /** Aberto pelo "Editar" do menu "⋯" (QM7): sair da edição fecha tudo. */
  initialEditing?: boolean;
}) {
  const { can } = useAuthorization();
  const [confirmCancel, setConfirmCancel] = useState(initialCancelConfirmation);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelDetails, setCancelDetails] = useState("");
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [noShowReason, setNoShowReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState("");
  const canChange =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  // Realizado/falta só a partir de 15 min antes do início (a API também recusa).
  const started = isAppointmentStarted(appointment);
  const availability = started
    ? undefined
    : appointmentNotStartedMessage(appointment.startsAt);
  const availabilityHintId = `appointment-availability-${appointment.id}`;
  // Atendimento de lead não tem prontuário, NPS nem histórico de cliente.
  const isLead = Boolean(appointment.leadId);
  const contactPhone = isLead ? "" : patient?.whatsapp || patient?.phone || "";
  const isCompleted = appointment.status === "completed" && !isLead;
  // Cores das etiquetas só quando o cliente tem alguma; sem acesso à lista, fica a cor padrão.
  const patientTagNames = !isLead && patient?.tags?.length ? patient.tags : [];
  const configuredTags = usePatientTags(patientTagNames.length > 0);
  const tagColor = tagColorLookup(configuredTags.tags);
  const [survey, setSurvey] = useState<SatisfactionSurvey | null>(null);
  const [surveyChecked, setSurveyChecked] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [rating, setRating] = useState(false);
  const [editing, setEditing] = useState(initialEditing);
  // Ações do rodapé: com uma confirmação aberta (cancelar/falta), só ela aparece.
  const idle = editable && !confirmCancel && !confirmNoShow;
  const canCancel = idle && canChange && can("agenda.cancel");
  const canEditDetails = idle && canChange && can("agenda.reschedule");
  const canRescheduleScheduled = canEditDetails;
  const canRescheduleAbsence =
    editable &&
    can("agenda.reschedule") &&
    ["no_show", "excused_absence", "professional_absence"].includes(
      appointment.status,
    );
  const canAttend = idle && canChange && can("agenda.attendance");
  const canRate =
    editable &&
    isCompleted &&
    surveyChecked &&
    !survey &&
    !alreadyRated &&
    can("agenda.satisfaction_create");
  const hasActions =
    canCancel ||
    canEditDetails ||
    canRescheduleAbsence ||
    canAttend ||
    canRate;
  const hasFooter =
    hasActions ||
    Boolean(error) ||
    confirmCancel ||
    confirmNoShow ||
    (appointment.status === "cancelled" && Boolean(contactPhone));
  useEffect(() => {
    if (!isCompleted) return;
    let active = true;
    // A pesquisa é filtrada pela data de registro: do dia do atendimento até amanhã.
    const from = addDaysToIsoDate(
      localIsoDate(new Date(appointment.startsAt)),
      -1,
    );
    const tomorrow = addDaysToIsoDate(localIsoDate(), 1);
    const to = tomorrow > from ? tomorrow : from;
    api
      .satisfaction(from, to)
      .then((data) => {
        if (!active) return;
        setSurvey(
          data.surveys.find((item) => item.appointmentId === appointment.id) ??
            null,
        );
      })
      .catch(() => undefined)
      .finally(() => active && setSurveyChecked(true));
    return () => {
      active = false;
    };
  }, [appointment.id, appointment.startsAt, isCompleted]);
  async function changeStatus(
    status: Extract<AppointmentStatus, "confirmed" | "completed" | "no_show">,
  ) {
    setSavingStatus(true);
    setError("");
    try {
      const reason = noShowReason.trim();
      const updated = await api.updateAppointmentStatus(
        appointment.id,
        status,
        status === "no_show" && reason ? reason : undefined,
      );
      setConfirmNoShow(false);
      setNoShowReason("");
      onUpdated(updated);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar o atendimento.",
      );
    } finally {
      setSavingStatus(false);
    }
  }
  async function cancelAppointment() {
    setCancelling(true);
    setError("");
    try {
      const details = cancelDetails.trim();
      onUpdated(
        await api.updateAppointmentStatus(
          appointment.id,
          "cancelled",
          details ? `${cancelReason}: ${details}` : cancelReason,
        ),
      );
      setConfirmCancel(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível cancelar o atendimento.",
      );
    } finally {
      setCancelling(false);
    }
  }
  if (editing) {
    return (
      <AppointmentEditModal
        appointment={appointment}
        onClose={() => (initialEditing ? onClose() : setEditing(false))}
        onSaved={(updated) => {
          setEditing(false);
          onEdited(updated);
          if (initialEditing) onClose();
        }}
      />
    );
  }
  if (rating) {
    return (
      <SatisfactionSurveyModal
        appointment={appointment}
        onClose={() => setRating(false)}
        onSaved={(saved) => {
          setSurvey(saved);
          setRating(false);
        }}
        onDuplicate={() => {
          setAlreadyRated(true);
          setRating(false);
        }}
      />
    );
  }
  return (
    <Modal
      title="Detalhes do atendimento"
      subtitle={appointment.patientName}
      busy={cancelling || savingStatus}
      onClose={onClose}
    >
      <div className="appointment-details">
        <section className="appointment-detail-section">
          <h3>Atendimento marcado</h3>
          <div className="appointment-detail-grid">
            <div>
              <small>Serviço</small>
              <strong>{appointment.serviceName}</strong>
            </div>
            <div>
              <small>Status</small>
              <strong>{statusLabel(appointment.status)}</strong>
            </div>
            <div>
              <small>Data</small>
              <strong>
                {new Date(appointment.startsAt).toLocaleDateString("pt-BR", {
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
                {timeLabel.format(new Date(appointment.startsAt))} –{" "}
                {timeLabel.format(new Date(appointment.endsAt))}
              </strong>
            </div>
            <div>
              <small>Profissional</small>
              <strong>{appointment.professionalName}</strong>
            </div>
            <div>
              <small>Sala</small>
              <strong>{appointment.roomName}</strong>
            </div>
            {service && (
              <div>
                <small>Duração e valor</small>
                <strong>
                  {service.durationMinutes} min ·{" "}
                  {currency.format(service.priceInCents / 100)}
                </strong>
              </div>
            )}
            {appointment.absenceReason && (
              <div className="detail-wide">
                <small>
                  {appointment.status === "cancelled"
                    ? "Motivo do cancelamento"
                    : "Motivo da ausência"}
                </small>
                <strong>{appointment.absenceReason}</strong>
              </div>
            )}
            {appointment.predecessorId && (
              <p className="muted-copy">
                Remarcação vinculada ao atendimento de origem.
              </p>
            )}
            {appointment.notes && (
              <div className="detail-wide">
                <small>Observações do agendamento</small>
                <strong>{appointment.notes}</strong>
              </div>
            )}
            {visitTypeBadgeText(appointment) && (
              <div>
                <small>Tipo</small>
                <strong>
                  <VisitTypeBadge appointment={appointment} />
                </strong>
              </div>
            )}
          </div>
        </section>
        {isLead ? (
          <section className="appointment-detail-section">
            <h3>Lead</h3>
            <div className="appointment-detail-grid">
              <div className="detail-wide">
                <small>Nome</small>
                <strong>
                  {appointment.leadName ?? appointment.patientName}
                </strong>
              </div>
            </div>
            <p className="appointment-lead-note">
              Prontuário, pesquisa de satisfação e histórico ficam disponíveis
              depois que o lead for convertido em cliente.
            </p>
          </section>
        ) : (
          <section className="appointment-detail-section">
            <h3>Dados do cliente</h3>
            {patient ? (
              <div className="appointment-detail-grid">
                <div>
                  <small>Nome completo</small>
                  <strong>{patient.fullName}</strong>
                </div>
                <div>
                  <small>Prontuário</small>
                  <strong>{patient.recordNumber || "Não informado"}</strong>
                </div>
                <div>
                  <small>Telefone</small>
                  <strong>
                    {patient.phone
                      ? formatPhone(patient.phone)
                      : "Não informado"}
                  </strong>
                </div>
                <div>
                  <small>WhatsApp</small>
                  <strong>
                    {patient.whatsapp
                      ? formatPhone(patient.whatsapp)
                      : "Mesmo telefone de contato"}
                  </strong>
                </div>
                <div>
                  <small>E-mail</small>
                  <strong>{patient.email || "Não informado"}</strong>
                </div>
                <div>
                  <small>CPF</small>
                  <strong>
                    {patient.cpf ? formatCpf(patient.cpf) : "Não informado"}
                  </strong>
                </div>
                <div>
                  <small>Nascimento</small>
                  <strong>
                    {patient.birthDate
                      ? formatIsoDate(patient.birthDate)
                      : "Não informado"}
                  </strong>
                </div>
                <div
                  className={`detail-wide emergency-contact${emergencyContactLabel(patient) ? "" : " is-missing"}`}
                >
                  <small>Contato de emergência</small>
                  <strong>
                    {emergencyContactLabel(patient) || "Não informado"}
                  </strong>
                </div>
                <div>
                  <small>Situação</small>
                  <strong>
                    {patient.status === "active" ? "Ativo" : "Inativo"}
                  </strong>
                </div>
                <div className="detail-wide">
                  <small>Etiquetas</small>
                  <div className="appointment-detail-tags">
                    {patientTagNames.length ? (
                      patientTagNames.map((tag) => (
                        <PatientTagBadge
                          key={tag}
                          name={tag}
                          color={tagColor(tag)}
                        />
                      ))
                    ) : (
                      <strong>Sem etiquetas</strong>
                    )}
                    {can("settings.tags_update") && (
                      <Link
                        className="text-link"
                        to="/configuracoes?secao=etiquetas"
                      >
                        Gerenciar etiquetas
                      </Link>
                    )}
                  </div>
                </div>
                {patient.notes && (
                  <div className="detail-wide">
                    <small>Observações do cliente</small>
                    <strong>{patient.notes}</strong>
                  </div>
                )}
              </div>
            ) : (
              <p>Dados cadastrais indisponíveis no momento.</p>
            )}
          </section>
        )}
        {isCompleted && survey && (
          <p className="appointment-satisfaction">
            Satisfação registrada: nota {survey.score}
          </p>
        )}
        {isCompleted && !survey && alreadyRated && (
          <p className="appointment-satisfaction">
            Este atendimento já tem pesquisa de satisfação registrada.
          </p>
        )}
        {hasFooter && (
          // Rodapé fixo (QM6): ações sempre visíveis sem rolar; o destrutivo fica à esquerda.
          <div className="appointment-detail-footer">
            {error && <div className="form-error">{error}</div>}
            {appointment.status === "cancelled" && contactPhone && (
              <div className="appointment-cancel-notify">
                <span>Atendimento cancelado. Quer avisar o cliente?</span>
                <a
                  className="whatsapp-button button-sm"
                  href={whatsappLink(
                    contactPhone,
                    cancellationMessage(appointment),
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={15} aria-hidden="true" />
                  Avisar cliente por WhatsApp
                </a>
              </div>
            )}
            {confirmCancel && (
              <div className="appointment-cancel-confirm">
                <strong>Cancelar este atendimento?</strong>
                <span>O horário será liberado na agenda.</span>
                <label className="appointment-no-show-reason">
                  Motivo do cancelamento
                  <select
                    required
                    value={cancelReason}
                    disabled={cancelling}
                    onChange={(event) => setCancelReason(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {cancellationReasons.map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                </label>
                <label className="appointment-no-show-reason">
                  Detalhes (opcional)
                  <textarea
                    rows={2}
                    maxLength={400}
                    value={cancelDetails}
                    disabled={cancelling}
                    onChange={(event) => setCancelDetails(event.target.value)}
                  />
                </label>
                <div>
                  <button
                    className="secondary-button"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                  >
                    Voltar
                  </button>
                  {can("agenda.cancel") && (
                    <button
                      className="danger-button"
                      onClick={() => void cancelAppointment()}
                      disabled={cancelling || !cancelReason}
                    >
                      {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
                    </button>
                  )}
                </div>
              </div>
            )}
            {confirmNoShow && (
              <div className="appointment-cancel-confirm">
                <strong>Registrar falta?</strong>
                <span>A falta não consome sessão do plano.</span>
                <label className="appointment-no-show-reason">
                  Motivo (opcional)
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={noShowReason}
                    disabled={savingStatus}
                    onChange={(event) => setNoShowReason(event.target.value)}
                  />
                </label>
                <div>
                  <button
                    className="secondary-button"
                    onClick={() => setConfirmNoShow(false)}
                    disabled={savingStatus}
                  >
                    Voltar
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void changeStatus("no_show")}
                    disabled={savingStatus || noShowReason.trim().length === 1}
                  >
                    {savingStatus ? "Registrando…" : "Registrar falta"}
                  </button>
                </div>
              </div>
            )}
            {hasActions && (
              <div className="modal-actions tab-footer">
                {canCancel && (
                  <div className="tab-footer-danger">
                    <button
                      className="danger-button"
                      onClick={() => setConfirmCancel(true)}
                      disabled={savingStatus}
                    >
                      Cancelar atendimento
                    </button>
                  </div>
                )}
                <div className="tab-footer-main">
                  {canEditDetails && (
                    <button
                      className="secondary-button"
                      onClick={() => setEditing(true)}
                      disabled={savingStatus}
                    >
                      Editar
                    </button>
                  )}
                  {canRescheduleScheduled && (
                    <button
                      className="secondary-button"
                      onClick={onReschedule}
                      disabled={savingStatus}
                    >
                      Remarcar atendimento
                    </button>
                  )}
                  {canRescheduleAbsence && (
                    <button className="primary-button" onClick={onReschedule}>
                      Remarcar ausência
                    </button>
                  )}
                  {canAttend && appointment.status === "scheduled" && (
                    <button
                      className="secondary-button"
                      onClick={() => void changeStatus("confirmed")}
                      disabled={savingStatus}
                    >
                      Confirmar presença
                    </button>
                  )}
                  {canAttend && (
                    <button
                      className="secondary-button"
                      onClick={() => setConfirmNoShow(true)}
                      disabled={savingStatus || !started}
                      title={availability}
                      aria-describedby={
                        started ? undefined : availabilityHintId
                      }
                    >
                      Marcar falta
                    </button>
                  )}
                  {canAttend && (
                    <button
                      className="primary-button"
                      onClick={() => void changeStatus("completed")}
                      disabled={savingStatus || !started}
                      title={availability}
                      aria-describedby={
                        started ? undefined : availabilityHintId
                      }
                    >
                      Marcar como realizado
                    </button>
                  )}
                  {canRate && (
                    <button
                      className="primary-button"
                      onClick={() => setRating(true)}
                    >
                      Registrar satisfação
                    </button>
                  )}
                </div>
                {canAttend && availability && (
                  <p
                    className="field-hint appointment-detail-hint"
                    id={availabilityHintId}
                  >
                    {availability}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
