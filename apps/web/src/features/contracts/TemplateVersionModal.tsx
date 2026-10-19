import type { DocumentTemplate } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { TemplateBodyEditor } from "./TemplateBodyEditor";

export function TemplateVersionModal({
  template,
  onClose,
  onCreated,
}: {
  template: DocumentTemplate;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { can } = useAuthorization();
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(body);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim() === template.body.trim()) {
      setError("Altere o conteúdo para criar uma nova versão.");
      return;
    }
    if (body.trim().length < 20) {
      setError("O conteúdo precisa ter pelo menos 20 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createDocumentTemplateVersion(template.id, body);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Nova versão"
      subtitle={`${template.name} · versão ${template.version + 1}`}
      eyebrow="Modelos"
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {can("contracts.templates_version") && (
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <div className="span-2">
            <TemplateBodyEditor
              value={body}
              rows={12}
              disabled={saving}
              onChange={setBody}
            />
          </div>
          {error && <div className="span-2 form-error">{error}</div>}
          <div className="span-2 modal-actions">
            <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Criando…" : "Criar versão"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
