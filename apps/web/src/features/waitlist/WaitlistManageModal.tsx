import {
  formatPhone,
  waitlistKindLabels,
  waitlistStatusLabels,
  waitlistStatusSchema,
  whatsappLink,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { shortDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { availabilityMessage } from "./model";

/** Atualiza a situação e as observações de uma entrada, avisa o cliente ou a remove. */
export function WaitlistManageModal({
  entry,
  position,
  canManage,
  onClose,
  onChanged,
}: {
  entry: WaitlistEntry;
  position: number | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<WaitlistStatus>(entry.status);
  const [notes, setNotes] = useState(entry.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const dirty = useFormDirty({ status, notes });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateWaitlistEntry(entry.id, { status, notes });
      await onChanged("Lista de espera atualizada.");
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry.patientName}
      subtitle={`${waitlistKindLabels[entry.kind]} · ${entry.itemName} · na lista desde ${shortDate.format(new Date(entry.createdAt))}`}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={submit}>
        {error && <ErrorBanner error={error} />}
        <dl className="waitlist-facts">
          <div>
            <dt>Posição na fila</dt>
            <dd>{position ? `${position}º` : "Fora da fila"}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>
              {entry.patientPhone ? formatPhone(entry.patientPhone) : "—"}
            </dd>
          </div>
        </dl>
        {entry.patientPhone && position !== null && (
          <a
            className="whatsapp-button waitlist-notify"
            href={whatsappLink(entry.patientPhone, availabilityMessage(entry))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Avisar por WhatsApp
          </a>
        )}
        <fieldset className="form-fields clinical-form" disabled={!canManage}>
          <label>
            Situação
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as WaitlistStatus)
              }
            >
              {waitlistStatusSchema.options.map((option) => (
                <option key={option} value={option}>
                  {waitlistStatusLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observações
            <textarea
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </fieldset>
        <div className="modal-actions tab-footer">
          <div className="tab-footer-danger">
            {canManage && (
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                Remover da lista
              </button>
            )}
          </div>
          <div className="tab-footer-main">
            <ModalCancelButton disabled={busy}>
              {canManage ? "Cancelar" : "Fechar"}
            </ModalCancelButton>
            {canManage && (
              <button className="primary-button" disabled={busy || !dirty}>
                Salvar
              </button>
            )}
          </div>
        </div>
      </form>
      {removing && (
        <ActionModal
          eyebrow="Lista de espera"
          title="Remover da lista"
          subtitle={`${entry.patientName} · ${entry.itemName}`}
          effect="A entrada é apagada. Para guardar o histórico, prefira marcar como Atendido ou Desistiu."
          confirmLabel="Remover da lista"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await api.deleteWaitlistEntry(entry.id);
            await onChanged("Cliente removido da lista de espera.");
          }}
        />
      )}
    </Modal>
  );
}
