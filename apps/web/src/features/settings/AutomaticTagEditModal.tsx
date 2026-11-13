import type { AutomaticPatientTag } from "@crm/contracts";
import { RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { normalizeTagColor } from "../../tag-colors";
import { TagColorPicker } from "./TagColorPicker";

/** Troca o nome e a cor exibidos de uma etiqueta automática (AT1); a regra não muda. */
export function AutomaticTagEditModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: AutomaticPatientTag;
  onClose: () => void;
  onSaved: (tag: AutomaticPatientTag, message: string) => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(normalizeTagColor(tag.color));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ name, color });

  async function run(
    action: () => Promise<AutomaticPatientTag>,
    message: string,
  ) {
    setSaving(true);
    setError("");
    try {
      onSaved(await action(), message);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível salvar a etiqueta.",
      );
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe o nome da etiqueta.");
      return;
    }
    const update = {
      ...(trimmed !== tag.name ? { name: trimmed } : {}),
      ...(color !== normalizeTagColor(tag.color) ? { color } : {}),
    };
    if (!update.name && !update.color) {
      onClose();
      return;
    }
    await run(
      () => api.updateAutomaticPatientTag(tag.key, update),
      "Etiqueta automática atualizada.",
    );
  }

  return (
    <Modal
      eyebrow="Etiquetas"
      title="Editar etiqueta automática"
      subtitle={`Padrão: ${tag.defaultName}. ${tag.description} A regra continua a mesma; muda só o nome e a cor.`}
      busy={saving}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <label className="span-2">
          Nome da etiqueta
          <input
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <TagColorPicker
          value={color}
          previewName={name.trim() || tag.defaultName}
          onChange={setColor}
        />
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          {tag.customized && (
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() =>
                void run(
                  () => api.resetAutomaticPatientTag(tag.key),
                  "Etiqueta automática restaurada.",
                )
              }
            >
              <RotateCcw size={16} aria-hidden="true" />
              Restaurar padrão
            </button>
          )}
          <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
          <button className="primary-button" disabled={saving}>
            {saving ? "Salvando…" : "Salvar etiqueta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
