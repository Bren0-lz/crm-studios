import {
  whatsappLink,
  type PatientPlan,
  type PaymentMethod,
  type PaymentReceipt,
  type PaymentTiming,
  type ReceiptSignatureShare,
  type Receivable,
  type SettlementAdjustments,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useToast } from "../../shared/feedback/toast-context";
import { currency } from "../../shared/lib/formatting";
import {
  isReceiptSignatureShare,
  proofFailureMessage,
  ReceiptSignatureWhatsapp,
  receiptMessage,
  receivableSettledMessage,
  receivableSettleTarget,
  SettleModal,
  uploadPaymentProofs,
} from "../finance/index";

/** Primeira cobrança em aberto do plano (a de vencimento mais próximo). */
function firstOpenPlanReceivable(
  plan: Pick<PatientPlan, "id">,
  receivables: readonly Receivable[],
) {
  return receivables
    .filter((item) => item.planId === plan.id && item.status === "open")
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.installmentNumber - b.installmentNumber,
    )[0];
}

type Step =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ask"; receivable: Receivable; receivables: Receivable[] }
  | {
      kind: "receipt";
      receipt: PaymentReceipt;
      share: ReceiptSignatureShare | null;
    };

/**
 * Último passo da venda do plano com documento: pergunta se o cliente já pagou. "Sim" abre a
 * baixa da 1ª cobrança em aberto e, feita a baixa, mostra o recibo pronto para o WhatsApp;
 * "Não" encerra (a cobrança fica em aberto no Financeiro). Sem cobrança em aberto, encerra.
 */
export function PlanPaymentStep({
  plan,
  onBusyChange,
  onNestedChange,
  onDone,
}: {
  plan: PatientPlan;
  onBusyChange?: (busy: boolean) => void;
  onNestedChange?: (nested: boolean) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [settling, setSettling] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    let active = true;
    api
      .financialSummary()
      .then(({ receivables }) => {
        if (!active) return;
        const receivable = firstOpenPlanReceivable(plan, receivables);
        if (receivable) setStep({ kind: "ask", receivable, receivables });
        else doneRef.current();
      })
      .catch(
        (cause: Error) =>
          active &&
          setStep({ kind: "error", message: cause.message, retry: true }),
      );
    return () => {
      active = false;
    };
  }, [plan, attempt]);
  function openSettle(open: boolean) {
    setSettling(open);
    onNestedChange?.(open);
  }
  async function settle(
    receivable: Receivable,
    method: PaymentMethod,
    timing?: PaymentTiming,
    adjustments?: SettlementAdjustments,
    proofs: File[] = [],
  ) {
    await api.settleReceivable(receivable.id, method, timing, adjustments);
    // A baixa já está registrada: falha nos comprovantes ou no recibo só avisa.
    onBusyChange?.(true);
    openSettle(false);
    setStep({ kind: "loading" });
    try {
      const failed = proofs.length
        ? await uploadPaymentProofs("receivable", receivable.id, proofs)
        : [];
      toast.success(
        receivableSettledMessage(receivable.amountInCents, adjustments),
      );
      if (failed.length) toast.error(proofFailureMessage(failed));
      const [receipt, share] = await Promise.all([
        api.paymentReceipt(receivable.id),
        api
          .receiptSignatureShare(receivable.id)
          .then((value: unknown) =>
            isReceiptSignatureShare(value) ? value : null,
          )
          .catch(() => null),
      ]);
      setStep({ kind: "receipt", receipt, share });
    } catch (cause) {
      setStep({
        kind: "error",
        message: `O pagamento foi registrado, mas o recibo não abriu. ${(cause as Error).message} Envie depois pelo Financeiro.`,
        retry: false,
      });
    } finally {
      onBusyChange?.(false);
    }
  }
  if (step.kind === "loading") return <LoadingBlock />;
  if (step.kind === "error")
    return (
      <div className="clinical-form">
        <ErrorBanner error={step.message} />
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onDone}>
            Concluir
          </button>
          {step.retry && (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setStep({ kind: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );
  if (step.kind === "receipt") {
    const { receipt, share } = step;
    return (
      <div className="clinical-form">
        <div className="success-banner" role="status">
          {`Pagamento de ${currency.format(receipt.amountInCents / 100)} registrado. ${
            share
              ? "O recibo está pronto para o cliente assinar."
              : "O recibo está pronto para enviar."
          }`}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onDone}>
            Concluir
          </button>
          <div className="receipt-send-actions">
            {share ? (
              <ReceiptSignatureWhatsapp share={share} />
            ) : (
              <ReceiptTextWhatsapp receipt={receipt} />
            )}
          </div>
        </div>
      </div>
    );
  }
  const { receivable, receivables } = step;
  const amount = currency.format(receivable.amountInCents / 100);
  return (
    <div className="clinical-form">
      <p>
        {receivable.installmentCount > 1
          ? `O cliente já fez o pagamento da ${receivable.installmentNumber}ª parcela (${amount})?`
          : `O cliente já fez o pagamento (${amount})?`}
      </p>
      <p className="muted-copy">
        Se já pagou, a baixa gera o recibo para enviar pelo WhatsApp. Se não, a
        cobrança fica em aberto no Financeiro.
      </p>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onDone}>
          Não
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => openSettle(true)}
        >
          Sim, já pagou
        </button>
      </div>
      {settling &&
        createPortal(
          <SettleModal
            target={receivableSettleTarget(receivable, receivables)}
            onClose={() => openSettle(false)}
            onConfirm={(method, timing, adjustments, proofs) =>
              settle(receivable, method, timing, adjustments, proofs)
            }
          />,
          document.body,
        )}
    </div>
  );
}

/** Sem recibo para assinatura: o WhatsApp leva o texto do recibo, como no Financeiro. */
function ReceiptTextWhatsapp({ receipt }: { receipt: PaymentReceipt }) {
  const message = receiptMessage(receipt);
  const href = receipt.patientPhone
    ? whatsappLink(receipt.patientPhone, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <a
      className="whatsapp-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MessageCircle size={16} aria-hidden="true" />
      Enviar recibo pelo WhatsApp
    </a>
  );
}
