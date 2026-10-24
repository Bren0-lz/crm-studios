import {
  LEAD_STAGE_LABEL_MAX,
  type LeadStage,
  type LeadStageLabel,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Renomeia as colunas do funil; a etapa (e o que ela faz) continua a mesma. */
export function LeadStagesModal({
  stages,
  onClose,
  onConfirm,
}: {
  stages: LeadStageLabel[];
  onClose: () => void;
  onConfirm: (stages: LeadStageLabel[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(stages);
  const dirty = useFormDirty(draft);
  const patch = (stage: LeadStage, label: string) =>
    setDraft((current) =>
      current.map((item) => (item.stage === stage ? { ...item, label } : item)),
    );
  const trimmed = draft.map((item) => ({ ...item, label: item.label.trim() }));
  return (
    <ActionModal
      eyebrow="CRM comercial"
      title="Renomear etapas do funil"
      subtitle="Os nomes valem para toda a equipe."
      effect="Só o nome exibido muda: os leads continuam nas mesmas etapas, e as etapas de ganho e de perda continuam pedindo a conversão e o motivo."
      confirmLabel="Salvar nomes"
      missing={trimmed
        .filter((item) => !item.label)
        .map(
          (item) =>
            `Nome da etapa ${stages.find((stage) => stage.stage === item.stage)?.label ?? item.stage}`,
        )}
      validate={() =>
        new Set(trimmed.map((item) => item.label.toLocaleLowerCase("pt-BR")))
          .size < trimmed.length
          ? "Duas etapas não podem ter o mesmo nome."
          : ""
      }
      dirty={dirty}
      onClose={onClose}
      onConfirm={() => onConfirm(trimmed)}
    >
      {draft.map((item, index) => (
        <label key={item.stage}>
          {`Etapa ${index + 1}`}
          <input
            value={item.label}
            maxLength={LEAD_STAGE_LABEL_MAX}
            required
            onChange={(event) => patch(item.stage, event.target.value)}
          />
        </label>
      ))}
    </ActionModal>
  );
}
