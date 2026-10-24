import {
  LEAD_STAGE_LABEL_MAX,
  LEAD_STAGES_MAX,
  type LeadStageConfig,
  type LeadStagesInput,
} from "@crm/contracts";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

type StageItems = LeadStagesInput["stages"];

const current = (stages: readonly LeadStageConfig[]): StageItems =>
  stages.map(({ stage, label }) => ({ stage, label }));

/**
 * Inclui uma etapa (sem `editing`) ou edita uma etapa do funil: nome, etapa final e remoção.
 * Envia o funil inteiro; a API recusa remover etapa com leads ou tornar final uma etapa com
 * leads em aberto, e a mensagem aparece no formulário.
 */
export function LeadStageModal({
  stages,
  editing,
  onClose,
  onSave,
}: {
  stages: readonly LeadStageConfig[];
  editing?: LeadStageConfig;
  onClose: () => void;
  onSave: (stages: StageItems, action: "saved" | "removed") => Promise<void>;
}) {
  // Posição: "depois de" uma das outras etapas ("" = início do funil). Etapa nova entra, por
  // padrão, antes da etapa final; a editada começa onde já está.
  const others = stages.filter((item) => item.stage !== editing?.stage);
  const editingIndex = stages.findIndex(
    (item) => item.stage === editing?.stage,
  );
  const wonIndex = stages.findIndex((item) => item.kind === "won");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [after, setAfter] = useState(
    (editing
      ? stages[editingIndex - 1]?.stage
      : stages[Math.max(0, wonIndex - 1)]?.stage) ?? "",
  );
  const [final, setFinal] = useState(editing?.kind === "won");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ label, after, final });
  const name = label.trim();
  const duplicate = stages.some(
    (item) =>
      item.stage !== editing?.stage &&
      item.label.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
  );
  const full = !editing && stages.length >= LEAD_STAGES_MAX;
  const becomesFinal = final && editing?.kind !== "won";

  async function run(items: StageItems, action: "saved" | "removed") {
    setError("");
    setSaving(true);
    try {
      await onSave(items, action);
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !name || full) return;
    if (duplicate) {
      setError("Já existe uma etapa com esse nome.");
      return;
    }
    const extra = becomesFinal ? { final: true } : {};
    const items = current(others);
    const index = items.findIndex((item) => item.stage === after);
    items.splice(
      index + 1,
      0,
      editing
        ? { stage: editing.stage, label: name, ...extra }
        : { label: name, ...extra },
    );
    void run(items, "saved");
  }

  return (
    <Modal
      eyebrow="CRM comercial"
      title={editing ? "Editar etapa" : "Adicionar etapa"}
      subtitle={
        editing
          ? `Etapa ${editing.label} do funil. Vale para toda a equipe.`
          : "A etapa nova aparece no funil para toda a equipe."
      }
      busy={saving}
      dirty={dirty}
      initialFocus="form input"
      onClose={onClose}
    >
      <form className="form-grid" noValidate onSubmit={submit}>
        <label className="span-2">
          Nome da etapa
          <input
            value={label}
            maxLength={LEAD_STAGE_LABEL_MAX}
            required
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="span-2">
          Posição no funil
          <select
            value={after}
            onChange={(event) => setAfter(event.target.value)}
          >
            <option value="">No início do funil</option>
            {others.map((item) => (
              <option key={item.stage} value={item.stage}>
                Depois de {item.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            No computador, também dá para arrastar a coluna pelo cabeçalho.
          </span>
        </label>
        {editing?.kind === "lost" ? (
          <p className="field-hint span-2">
            A etapa de perdidos pede o motivo da perda e não pode ser removida
            nem virar a etapa final.
          </p>
        ) : (
          <>
            <label className="checkbox-field span-2">
              <input
                type="checkbox"
                checked={final}
                disabled={editing?.kind === "won"}
                onChange={(event) => setFinal(event.target.checked)}
              />
              Etapa final do funil (ganhos)
            </label>
            <p className="field-hint span-2">
              {editing?.kind === "won"
                ? "Os leads chegam aqui ao serem convertidos em cliente. Para trocar a etapa final, edite outra etapa e marque essa opção."
                : becomesFinal
                  ? "Os leads convertidos passam para esta etapa, e a etapa final atual vira uma etapa comum. Ela precisa estar sem leads em aberto."
                  : "Na etapa final ficam os leads convertidos em cliente."}
            </p>
          </>
        )}
        {full && (
          <p className="field-hint span-2">
            O funil já tem {LEAD_STAGES_MAX} etapas, o máximo permitido.
          </p>
        )}
        {error && (
          <div className="form-error span-2" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions span-2">
          {editing?.kind === "open" && (
            <button
              type="button"
              className="danger-button lead-stage-remove"
              disabled={saving}
              onClick={() =>
                void run(
                  current(stages).filter(
                    (item) => item.stage !== editing.stage,
                  ),
                  "removed",
                )
              }
            >
              <Trash2 size={16} />
              Remover etapa
            </button>
          )}
          <ModalCancelButton disabled={saving}>Voltar</ModalCancelButton>
          <button
            type="submit"
            className="primary-button"
            disabled={saving || !name || full}
          >
            {saving
              ? "Salvando…"
              : editing
                ? "Salvar etapa"
                : "Adicionar etapa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
