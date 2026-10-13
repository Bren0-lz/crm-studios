import { type Professional, saoPauloToday } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";

export function CommissionRuleModal({
  professionals,
  onClose,
  onConfirm,
}: {
  professionals: Professional[];
  onClose: () => void;
  onConfirm: (input: {
    professionalId: string;
    percentage: number;
    effectiveFrom: string;
  }) => Promise<void>;
}) {
  const [professionalId, setProfessionalId] = useState(
    professionals[0]?.id ?? "",
  );
  const [percentage, setPercentage] = useState("30");
  const [effectiveFrom, setEffectiveFrom] = useState(saoPauloToday());
  const value = Number(percentage.replace(",", "."));
  return (
    <ActionModal
      eyebrow="Comissões"
      title="Nova regra de comissão"
      subtitle="Percentual do profissional sobre os atendimentos"
      effect="A partir da data escolhida, a comissão do profissional é calculada com este percentual sobre a base de cálculo de cada atendimento concluído."
      confirmLabel="Salvar"
      validate={() => {
        if (!professionalId)
          return "Cadastre um profissional na agenda antes de criar uma regra.";
        if (
          percentage.trim() === "" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 100
        )
          return "Informe um percentual entre 0 e 100.";
        if (!effectiveFrom)
          return "Informe a data em que a regra passa a valer.";
        return "";
      }}
      onConfirm={() =>
        onConfirm({ professionalId, percentage: value, effectiveFrom })
      }
      onClose={onClose}
    >
      <label className="span-2">
        Profissional
        <select
          autoFocus
          value={professionalId}
          onChange={(event) => setProfessionalId(event.target.value)}
        >
          {professionals.length === 0 && (
            <option value="">Nenhum profissional cadastrado</option>
          )}
          {professionals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Percentual (%)
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
        />
      </label>
      <label>
        Vale a partir de
        <input
          type="date"
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
