import {
  type Appointment,
  type Patient,
  type SatisfactionSurvey,
  type Service,
  formatCpf,
  formatPhone,
} from "@crm/contracts";
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
} from "../../shared/lib/formatting";
import { addDaysToIsoDate } from "../relationship/index";
import { SatisfactionSurveyModal } from "./SatisfactionSurveyModal";

export function AppointmentDetailsModal({
  appointment,
  patient,
  service,
  onClose,
  onReschedule,
  onCancelled,
  editable,
  initialCancelConfirmation = false,
}: {
  appointment: Appointment;
  patient: Patient | undefined;
  service: Service | undefined;
  onClose: () => void;
  onReschedule: () => void;
  onCancelled: (appointment: Appointment) => void;
  /** Sem edição da Agenda: só consulta (sem cancelar, remarcar ou registrar satisfação). */
  editable: boolean;
  initialCancelConfirmation?: boolean;
}) {
  const { can } = useAuthorization();
  const [confirmCancel, setConfirmCancel] = useState(initialCancelConfirmation);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const canChange =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  // Atendimento de lead não tem prontuário, NPS nem histórico de cliente.
  const isLead = Boolean(appointment.leadId);
  const isCompleted = appointment.status === "completed" && !isLead;
  // Cores das etiquetas só quando o cliente tem alguma; sem acesso à lista, fica a cor padrão.
  const patientTagNames = !isLead && patient?.tags?.length ? patient.tags : [];
  const configuredTags = usePatientTags(patientTagNames.length > 0);
  const tagColor = tagColorLookup(configuredTags.tags);
  const [survey, setSurvey] = useState<SatisfactionSurvey | null>(null);
  const [surveyChecked, setSurveyChecked] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [rating, setRating] = useState(false);
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
  async function cancelAppointment() {
    setCancelling(true);
    setError("");
    try {
      onCancelled(
        await api.updateAppointmentStatus(appointment.id, "cancelled"),
      );
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
      busy={cancelling}
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
                <small>Motivo da ausência</small>
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
                <div className="detail-wide emergency-contact">
                  <small>Contato de emergência</small>
                  <strong>
                    {patient.emergencyContactName ||
                    patient.emergencyContactPhone
                      ? [
                          patient.emergencyContactName,
                          patient.emergencyContactPhone &&
                            formatPhone(patient.emergencyContactPhone),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Não informado"}
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
        {error && <div className="form-error">{error}</div>}
        {confirmCancel && (
          <div className="appointment-cancel-confirm">
            <strong>Cancelar este atendimento?</strong>
            <span>O horário será liberado na agenda.</span>
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
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
                </button>
              )}
            </div>
          </div>
        )}
        {editable &&
          can("agenda.reschedule") &&
          ["no_show", "excused_absence", "professional_absence"].includes(
            appointment.status,
          ) && (
            <button className="primary-button" onClick={onReschedule}>
              Remarcar ausência
            </button>
          )}
        {editable && !confirmCancel && canChange && (
          <div className="appointment-detail-actions">
            {can("agenda.cancel") && (
              <button
                className="danger-button"
                onClick={() => setConfirmCancel(true)}
              >
                Cancelar atendimento
              </button>
            )}
            {can("agenda.reschedule") && (
              <button className="primary-button" onClick={onReschedule}>
                Remarcar atendimento
              </button>
            )}
          </div>
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
        {editable &&
          isCompleted &&
          surveyChecked &&
          !survey &&
          !alreadyRated && (
            <div className="appointment-detail-actions">
              {can("agenda.satisfaction_create") && (
                <button
                  className="primary-button"
                  onClick={() => setRating(true)}
                >
                  Registrar satisfação
                </button>
              )}
            </div>
          )}
      </div>
    </Modal>
  );
}
