import type {
  Appointment,
  SatisfactionSurvey,
  PatientOption,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function SatisfactionSurveyModal({
  appointment,
  patient,
  sourceMessageId,
  onClose,
  onSaved,
  onDuplicate,
}: {
  appointment?: Appointment | undefined;
  patient?: Pick<PatientOption, "id" | "fullName"> | undefined;
  sourceMessageId?: string | undefined;
  onClose: () => void;
  onSaved: (survey: SatisfactionSurvey) => void;
  onDuplicate: () => void;
}) {
  const { can } = useAuthorization();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = useFormDirty({ score, comment });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (score === null) return;
    const patientId = appointment?.patientId ?? patient?.id;
    if (!patientId) {
      setError("Atendimento de lead não tem pesquisa de satisfação.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const trimmed = comment.trim();
      onSaved(
        await api.createSatisfactionSurvey({
          patientId,
          ...(appointment ? { appointmentId: appointment.id } : {}),
          ...(sourceMessageId ? { sourceMessageId } : {}),
          score,
          ...(trimmed ? { comment: trimmed } : {}),
        }),
      );
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.code === "SATISFACTION_DUPLICATE"
      ) {
        onDuplicate();
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a avaliação.",
      );
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Registrar satisfação"
      subtitle={
        appointment?.patientName ??
        patient?.fullName ??
        "Resposta informada à equipe"
      }
      eyebrow="Pesquisa NPS"
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {can("agenda.satisfaction_create") && (
        <form className="form-grid" onSubmit={(event) => void save(event)}>
          <fieldset className="span-2 form-fieldset" disabled={saving}>
            <legend>
              De 0 a 10, quanto recomendaria a clínica a um amigo?
            </legend>
            <div className="tag-filter-list">
              {Array.from({ length: 11 }, (_, value) => (
                <button
                  key={value}
                  type="button"
                  className="tag-filter"
                  aria-label={`Nota ${value}`}
                  aria-pressed={score === value}
                  onClick={() => setScore(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="span-2">
            Comentário (opcional)
            <textarea
              value={comment}
              maxLength={1000}
              rows={3}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          {error && (
            <div className="span-2">
              <ErrorBanner error={error} />
            </div>
          )}
          <div className="span-2 appointment-detail-actions">
            <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
            <button
              type="submit"
              className="primary-button"
              disabled={score === null || saving}
            >
              {saving ? "Salvando…" : "Salvar avaliação"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
