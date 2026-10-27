import {
  autoCampaignSkipReasonLabels,
  autoCampaignSkipReasonSchema,
  type AutoCampaignItem,
  type AutoCampaignSkipReason,
} from "@crm/contracts";
import { useId, useState, type FormEvent } from "react";
import { Modal, ModalCancelButton } from "../../../shared/components/Modal";

/** Registra por que a mensagem não será enviada (fica visível na lista). */
export function AutoCampaignSkipModal({
  item,
  onClose,
  onConfirm,
}: {
  item: AutoCampaignItem;
  onClose: () => void;
  onConfirm: (reason: AutoCampaignSkipReason, note: string) => Promise<void>;
}) {
  const formId = useId();
  const [reason, setReason] = useState<AutoCampaignSkipReason>(
    "contacted_other_way",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason === "other" && !note.trim()) {
      setError("Descreva o motivo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(reason, note.trim());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Campanhas automáticas"
      title={`Não enviar para ${item.patientName}`}
      subtitle={`${item.campaignName} · ${item.stepLabel}`}
      busy={saving}
      onClose={onClose}
    >
      <form id={formId} className="form-grid" onSubmit={submit}>
        <fieldset className="span-2 auto-campaign-reasons">
          <legend>Motivo</legend>
          {autoCampaignSkipReasonSchema.options.map((option) => (
            <label className="checkbox-field" key={option}>
              <input
                type="radio"
                name="skip-reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
              />
              {autoCampaignSkipReasonLabels[option]}
            </label>
          ))}
        </fieldset>
        <label className="span-2">
          Observação {reason === "other" ? "" : "(opcional)"}
          <input
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
        <button
          className="primary-button"
          type="submit"
          form={formId}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Registrar"}
        </button>
      </div>
    </Modal>
  );
}
