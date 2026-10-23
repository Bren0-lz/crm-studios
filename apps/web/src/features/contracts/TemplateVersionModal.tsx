import {
  documentContentFromText,
  type ClinicBranding,
  type DocumentTemplate,
} from "@crm/contracts";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { TemplateBodyEditor } from "./TemplateBodyEditor";

export function TemplateVersionModal({
  template,
  branding,
  onClose,
  onCreated,
}: {
  template: DocumentTemplate;
  branding?: ClinicBranding | null | undefined;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { can } = useAuthorization();
  const [body, setBody] = useState(template.body);
  const [content, setContent] = useState(
    template.content ?? documentContentFromText(template.body),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dirty = useFormDirty({ body, content });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (
      body.trim() === template.body.trim() &&
      JSON.stringify(content) ===
        JSON.stringify(
          template.content ?? documentContentFromText(template.body),
        )
    ) {
      setError("Altere o conteúdo para criar uma nova versão.");
      return;
    }
    if (body.trim().length < 20) {
      setError("O conteúdo precisa ter pelo menos 20 caracteres.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await api.createDocumentTemplateVersion(template.id, body, content);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
      savingRef.current = false;
    }
  }
  return (
    <Modal
      title="Nova versão"
      subtitle={`${template.name} · versão ${template.version + 1}`}
      eyebrow="Modelos"
      wide
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      {can("contracts.templates_version") && (
        <form className="form-grid" onSubmit={(event) => void submit(event)}>
          <div className="span-2">
            <TemplateBodyEditor
              value={body}
              content={content}
              rows={12}
              disabled={saving}
              branding={branding}
              onChange={(body, content) => {
                setBody(body);
                setContent(content);
              }}
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
