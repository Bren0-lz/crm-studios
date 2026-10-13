import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";

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
      validate={() =>
        name.trim().length >= 2
          ? ""
          : "Informe um nome com pelo menos 2 caracteres."
      }
      onConfirm={() => onConfirm(name.trim())}
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
