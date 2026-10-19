import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function FinanceRegistryModal({
  kind,
  onClose,
  onConfirm,
}: {
  kind: "category" | "costCenter";
  onClose: () => void;
  onConfirm: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const dirty = useFormDirty(name);
  const isCategory = kind === "category";
  return (
    <ActionModal
      eyebrow="Financeiro"
      title={isCategory ? "Nova categoria de despesa" : "Novo centro de custo"}
      subtitle="Cadastros do Financeiro"
      effect={
        isCategory
          ? "A categoria passa a aparecer na lista ao lançar uma despesa, para agrupar os gastos da clínica."
          : "O centro de custo passa a aparecer na lista ao lançar uma despesa, para separar os gastos por área."
      }
      confirmLabel="Salvar"
      missing={
        name.trim().length >= 2 ? [] : ["Nome (pelo menos 2 caracteres)"]
      }
      onConfirm={() => onConfirm(name.trim())}
      dirty={dirty}
      onClose={onClose}
    >
      <label className="span-2">
        Nome
        <input
          autoFocus
          maxLength={100}
          placeholder={
            isCategory ? "Ex.: Material de limpeza" : "Ex.: Estúdio de Pilates"
          }
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
