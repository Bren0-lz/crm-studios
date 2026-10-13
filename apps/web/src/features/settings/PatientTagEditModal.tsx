import type { PatientTag } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { normalizeTagColor } from "../../tag-colors";
import { countLabel } from "../patients/index";
import { TagColorPicker } from "./TagColorPicker";

export function PatientTagEditModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: PatientTag;
  onClose: () => void;
  onSaved: (tag: PatientTag) => void;
}) {
  const { can } = useAuthorization();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(normalizeTagColor(tag.color));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updatePatientTag(tag.id, update));
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível salvar a etiqueta.",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Etiquetas"
      title="Editar etiqueta"
      subtitle={`${tag.name} · ${countLabel(tag.patientCount, "cliente", "clientes")}. Renomear atualiza esses clientes.`}
      busy={saving}
      onClose={onClose}
    >
      {can("settings.tags_update") && (
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
            previewName={name.trim() || tag.name}
            onChange={setColor}
          />
          {error && (
            <div className="form-error span-2" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Salvando…" : "Salvar etiqueta"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
