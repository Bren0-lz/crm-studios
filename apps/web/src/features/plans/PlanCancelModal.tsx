import {
  type PatientPlan,
  type PaymentMethod,
  type PlanCancellationDetails,
  paymentMethodLabels,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { currency } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/**
 * Cancelamento do plano em andamento (ex.: o cliente quer trocar de plano), com o
 * registro opcional do valor estornado ao cliente, lançado como saída no Financeiro.
 */
export function PlanCancelModal({
  plan,
  onClose,
  onConfirm,
}: {
  plan: PatientPlan;
  onClose: () => void;
  onConfirm: (cancellation: PlanCancellationDetails) => Promise<void>;
}) {
  const [refunded, setRefunded] = useState(false);
  const [refundedInCents, setRefundedInCents] = useState<number | null>(null);
  const [refundNote, setRefundNote] = useState("");
  const [refundPaymentMethod, setRefundPaymentMethod] =
    useState<PaymentMethod>("pix");
  const dirty = useFormDirty({
    refunded,
    refundedInCents,
    refundNote,
    refundPaymentMethod,
  });
  return (
    <ActionModal
      eyebrow="Planos"
      title="Cancelar plano"
      subtitle={`${plan.patientName} · ${plan.name}`}
      effect={`As parcelas em aberto deste plano são canceladas no Financeiro${plan.remainingSessions === 1 ? " e a sessão restante não poderá mais ser usada" : plan.remainingSessions > 1 ? ` e as ${plan.remainingSessions} sessões restantes não poderão mais ser usadas` : ""}. Um plano cancelado não pode ser reativado.`}
      danger
      dirty={dirty}
      missing={
        refunded && !refundedInCents ? ["valor estornado ao cliente"] : []
      }
      validate={() =>
        refunded && (refundedInCents ?? 0) > plan.totalValueInCents
          ? `O valor estornado não pode passar do valor do plano (${currency.format(plan.totalValueInCents / 100)}).`
          : ""
      }
      onConfirm={() =>
        onConfirm(
          refunded && refundedInCents
            ? {
                refundedInCents,
                refundPaymentMethod,
                ...(refundNote.trim() ? { refundNote: refundNote.trim() } : {}),
              }
            : {},
        )
      }
      onClose={onClose}
    >
      <label className="checkbox-field span-2">
        <input
          type="checkbox"
          checked={refunded}
          onChange={(event) => setRefunded(event.target.checked)}
        />
        Houve estorno de valor ao cliente
      </label>
      {refunded && (
        <p className="field-hint span-2">
          O estorno entra no Financeiro como conta paga (saída de caixa) na
          categoria "Estornos a clientes".
        </p>
      )}
      {refunded && (
        <>
          <label>
            Valor estornado ao cliente (R$)
            <MoneyInput
              required
              valueInCents={refundedInCents}
              onChange={setRefundedInCents}
            />
          </label>
          <label>
            Forma de pagamento do estorno
            <select
              value={refundPaymentMethod}
              onChange={(event) =>
                setRefundPaymentMethod(event.target.value as PaymentMethod)
              }
            >
              {(
                Object.entries(paymentMethodLabels) as [PaymentMethod, string][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Observação do estorno (opcional)
            <input
              maxLength={500}
              placeholder="Ex.: devolvido via Pix"
              value={refundNote}
              onChange={(event) => setRefundNote(event.target.value)}
            />
          </label>
        </>
      )}
    </ActionModal>
  );
}
