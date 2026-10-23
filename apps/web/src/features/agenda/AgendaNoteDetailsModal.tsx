import type { AgendaNote, AgendaNoteScope } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { tagColorStyle } from "../../tag-colors";
import { NoteScopeSelect } from "./AgendaNoteModal";

export function AgendaNoteDetailsModal({
  note,
  canManage,
  onClose,
  onEdit,
  onDeleted,
}: {
  note: AgendaNote;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [scope, setScope] = useState<AgendaNoteScope | "">(
    note.seriesId ? "" : "this",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={deleting ? "Excluir nota" : "Detalhes da nota"}
      subtitle="Descrição e visibilidade da anotação."
      eyebrow="Agenda"
      onClose={onClose}
      busy={busy}
    >
      <div className="clinical-form">
        <p>
          {shortDate.format(new Date(note.startsAt))} ·{" "}
          {timeLabel.format(new Date(note.startsAt))}–
          {timeLabel.format(new Date(note.endsAt))}
        </p>
        <p
          className="agenda-note agenda-note-preview"
          style={tagColorStyle(note.backgroundColor)}
        >
          {note.description}
        </p>
        <p>
          {note.professionalId
            ? "Nota de profissional"
            : "Todos os profissionais"}
        </p>
        {deleting && (
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!scope) return;
              setBusy(true);
              setError("");
              try {
                await api.deleteAgendaNote(note.id, scope);
                onDeleted();
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="span-2">Deseja excluir a nota?</p>
            {note.seriesId && (
              <NoteScopeSelect value={scope} onChange={setScope} />
            )}
            {error && (
              <p className="form-error span-2" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions span-2">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button type="submit" className="danger-button" disabled={busy}>
                {busy ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </form>
        )}
        {canManage && !deleting && (
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onEdit}>
              Editar
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={() => setDeleting(true)}
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
