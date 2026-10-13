import type { Receivable } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { currency, reaisToCents } from "../../shared/lib/formatting";

export function ReceivableAdjustModal({
  receivable,
  onClose,
  onConfirm,
}: {
  receivable: Receivable;
  onClose: () => void;
  onConfirm: (amountInCents: number, reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState(String(receivable.amountInCents / 100));
  const [reason, setReason] = useState("");
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Ajustar valor da parcela"
      subtitle={`${receivable.patientName} · ${receivable.description}`}
      effect={`Hoje a parcela vale ${currency.format(receivable.amountInCents / 100)}. O novo valor substitui o atual e a justificativa fica registrada no histórico.`}
      validate={() => {
        if (reaisToCents(value) === null)
          return "Informe o novo valor em reais (zero ou mais).";
        if (reason.trim().length < 5)
          return "Escreva a justificativa do ajuste (pelo menos 5 caracteres).";
        return "";
      }}
      onConfirm={() => onConfirm(reaisToCents(value) ?? 0, reason.trim())}
      onClose={onClose}
    >
      <label>
        Novo valor (R$)
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label className="span-2">
        Justificativa
        <input
          maxLength={500}
          placeholder="Ex.: desconto combinado com o cliente"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
