import type { Receivable } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import {
  centsToMoneyText,
  currency,
  reaisToCents,
} from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";

export function ReceivableAdjustModal({
  receivable,
  onClose,
  onConfirm,
}: {
  receivable: Receivable;
  onClose: () => void;
  onConfirm: (amountInCents: number, reason: string) => Promise<void>;
}) {
  const [value, setValue] = useState(
    centsToMoneyText(receivable.amountInCents),
  );
  const [reason, setReason] = useState("");
  const dirty = useFormDirty({ value, reason });
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Ajustar valor da parcela"
      subtitle={`${receivable.patientName} · ${receivable.description}`}
      effect={`Hoje a parcela vale ${currency.format(receivable.amountInCents / 100)}. O novo valor substitui o atual e a justificativa fica registrada no histórico.`}
      missing={[
        ...(reaisToCents(value) === null ? ["Novo valor"] : []),
        ...(reason.trim().length < 5
          ? ["Justificativa (pelo menos 5 caracteres)"]
          : []),
      ]}
      onConfirm={() => onConfirm(reaisToCents(value) ?? 0, reason.trim())}
      dirty={dirty}
      onClose={onClose}
    >
      <label>
        Novo valor (R$)
        <MoneyInput
          autoFocus
          valueInCents={reaisToCents(value)}
          onChange={(cents) => setValue(centsToMoneyText(cents))}
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
