import type { PaymentMethod, PaymentPart } from "@crm/contracts";
import {
  CHANGE_REASON_MAX_LENGTH,
  paymentMethodWithInstallments,
  paymentPartsLabel,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { currency } from "../../shared/lib/formatting";

export type ReversePaymentTarget = {
  kind: "receivable" | "payable";
  id: string;
  description: string;
  amountInCents: number;
  paymentMethod?: PaymentMethod | undefined;
  paymentInstallments?: number | undefined;
  paymentParts?: PaymentPart[] | undefined;
};

/** Forma do pagamento a estornar ("Pix", "Cartão · 3x", "Pix R$ 30,00 + Cartão R$ 70,00"). */
function paidWith(target: ReversePaymentTarget) {
  const money = (cents: number) => currency.format(cents / 100);
  if (target.paymentParts?.length)
    return paymentPartsLabel(target.paymentParts, money);
  return target.paymentMethod
    ? paymentMethodWithInstallments(
        target.paymentMethod,
        target.paymentInstallments,
      )
    : "";
}

/** Confirmação do estorno de uma baixa em Contas a receber ou a pagar (com motivo, E7c). */
export function ReversePaymentModal({
  target,
  onConfirm,
  onClose,
}: {
  target: ReversePaymentTarget;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const dirty = useFormDirty({ reason });
  const amount = currency.format(target.amountInCents / 100);
  const method = paidWith(target);
  const receivable = target.kind === "receivable";
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Estornar pagamento"
      subtitle={target.description}
      danger
      confirmLabel="Estornar pagamento"
      effect={
        <>
          <p>
            Estorna {amount}
            {method ? ` (${method})` : ""}.{" "}
            {receivable
              ? "A parcela volta a ficar em aberto e sai do caixa."
              : "A conta volta a ficar em aberto e o valor volta ao caixa."}
          </p>
          <p>Esta ação não pode ser desfeita.</p>
        </>
      }
      missing={reason.trim() ? [] : ["Motivo"]}
      dirty={dirty}
      onConfirm={() => onConfirm(reason.trim())}
      onClose={onClose}
    >
      <label className="span-2">
        Motivo
        <textarea
          required
          maxLength={CHANGE_REASON_MAX_LENGTH}
          placeholder="Ex.: cobrança em duplicidade"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
