import {
  clinicalAlertSeverityLabels,
  type ClinicalAlertInput,
  type ClinicalAlertSeverity,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

const severityHints: Record<ClinicalAlertSeverity, string> = {
  critical: "Contraindicação ou risco: aparece em destaque.",
  warning: "Cuidado a lembrar em toda sessão.",
  info: "Preferência ou observação útil.",
};

export function ClinicalAlertModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ClinicalAlertInput>({
    patientId,
    severity: "warning",
    text: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(form);
  const missing = useMissingFields(
    form.text.trim().length >= 3 ? [] : ["Alerta"],
    "field-hint",
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createClinicalAlert(form);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Novo alerta clínico"
      subtitle="Fica fixado no topo do prontuário para toda a equipe clínica."
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        <fieldset className="clinical-alert-severity">
          <legend>Gravidade</legend>
          {(["critical", "warning", "info"] as const).map((severity) => (
            <label key={severity} className={`severity-${severity}`}>
              <input
                type="radio"
                name="severity"
                checked={form.severity === severity}
                onChange={() => setForm({ ...form, severity })}
              />
              <span>
                <strong>{clinicalAlertSeverityLabels[severity]}</strong>
                <small>{severityHints[severity]}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Alerta
          <textarea
            rows={3}
            maxLength={280}
            placeholder="Ex.: Marcapasso — não usar eletroterapia."
            value={form.text}
            onChange={(event) => setForm({ ...form, text: event.target.value })}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        {missing.hint}
        <div className="modal-actions">
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button
            className="primary-button"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            Fixar alerta
          </button>
        </div>
      </form>
    </Modal>
  );
}
