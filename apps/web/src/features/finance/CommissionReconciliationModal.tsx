import {
  commissionAccountBalances,
  type CommissionReconciliationPreview,
  type CommissionAccountPayment,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { currency, shortDate } from "../../shared/lib/formatting";
import { PaymentProofsModal } from "./PaymentProofs";
export function CommissionReconciliationModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization(),
    [preview, setPreview] = useState<CommissionReconciliationPreview | null>(
      null,
    ),
    [attempt, setAttempt] = useState(0),
    [reason, setReason] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const reasonMissing = useMissingFields(
    reason.trim().length < 5
      ? ["Motivo da conciliação (pelo menos 5 caracteres)"]
      : [],
  );
  // Só o estorno de baixas antigas: o saldo agora é pago pela folha de pagamento.
  const [confirmation, setConfirmation] = useState<{
    payment: CommissionAccountPayment;
  } | null>(null);
  const [viewingProofs, setViewingProofs] =
    useState<CommissionAccountPayment | null>(null);
  useEffect(() => {
    let active = true;
    api
      .commissionReconciliation(id)
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  async function refresh() {
    setPreview(await api.commissionReconciliation(id));
    await onChanged();
  }
  async function save() {
    if (!preview || !can("finance.commissions_reconcile"))
      throw new Error("Não é possível conciliar esta comissão.");
    setBusy(true);
    setError("");
    try {
      await api.reconcileCommission(id, {
        idempotencyKey: key,
        expectedDigest: preview.digest,
        reason,
      });
      setReason("");
      setKey(crypto.randomUUID());
      setNotice(
        "Conciliação registrada com ajustes separados da comissão original.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Conciliação da comissão",
    dirty: Boolean(reason),
    busy,
    save,
    discard: () => setReason(""),
  });
  const close = () => prompt.confirmLeave(onClose);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function confirm() {
    if (!confirmation) return;
    setBusy(true);
    setError("");
    try {
      await api.reverseCommissionAccountPayment(confirmation.payment.id);
      setConfirmation(null);
      setNotice(
        "Estorno conciliado registrado sem remover o pagamento original.",
      );
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const balances = preview
    ? commissionAccountBalances(
        preview.commission,
        preview.adjustments,
        preview.originalManagedByExpense,
      )
    : [];
  return (
    <>
      <Modal
        title="Conciliar comissão"
        subtitle="Revise a origem e registre os ajustes. Os valores e a regra da comissão original ficam preservados."
        wide
        busy={
          busy ||
          Boolean(prompt.modal) ||
          Boolean(confirmation) ||
          Boolean(viewingProofs)
        }
        inactive={
          Boolean(prompt.modal) ||
          Boolean(confirmation) ||
          Boolean(viewingProofs)
        }
        onClose={close}
      >
        {error && <ErrorBanner error={error} />}{" "}
        {notice && <p role="status">{notice}</p>}
        {!preview ? (
          error ? (
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Atualizar prévia da comissão
            </button>
          ) : (
            <LoadingBlock />
          )
        ) : (
          <>
            <div className="form-grid">
              <div>
                <h3>Comissão original</h3>
                <p>
                  {preview.commission.professionalName} ·{" "}
                  {preview.commission.competence} ·{" "}
                  {currency.format(preview.commission.amountInCents / 100)}
                </p>
                <p>
                  {preview.commission.status === "paid"
                    ? "Pagamento original registrado"
                    : "Comissão original em aberto"}
                </p>
              </div>
              <div>
                <h3>Origem atual</h3>
                {preview.expected ? (
                  <p>
                    {preview.expected.professionalName} ·{" "}
                    {preview.expected.competence} ·{" "}
                    {currency.format(preview.expected.amountInCents / 100)}
                  </p>
                ) : (
                  <p>
                    A origem não gera comissão atualmente: confira a presença, o
                    profissional e a vigência da regra.
                  </p>
                )}
              </div>
            </div>
            {preview.changes.length > 0 ? (
              <>
                <h3>Ajustes necessários</h3>
                {preview.changes.map((change) => (
                  <p key={change.professionalId + change.competence}>
                    {change.professionalName} · {change.competence} ·{" "}
                    {currency.format(change.amountInCents / 100)}
                  </p>
                ))}
                {can("finance.commissions_reconcile") && (
                  <form className="form-grid" onSubmit={submit}>
                    <label className="span-2">
                      Motivo da conciliação
                      <textarea
                        required
                        minLength={5}
                        maxLength={1000}
                        disabled={busy}
                        rows={3}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    {reasonMissing.hint}
                    <div className="modal-actions span-2">
                      <button
                        className="primary-button"
                        disabled={busy || reasonMissing.blocked}
                        aria-describedby={reasonMissing.describedBy}
                      >
                        Confirmar conciliação
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setAttempt((value) => value + 1);
                        }}
                      >
                        Atualizar prévia da comissão
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p>
                A comissão e seus ajustes estão conciliados com a origem atual.
              </p>
            )}
            {preview.reconciliations.length > 0 && (
              <>
                <h3>Regras preservadas nas conciliações</h3>
                {preview.reconciliations.map((record) => (
                  <div className="clinical-resource-card" key={record.id}>
                    <strong>{record.reason}</strong>
                    <p>
                      {record.actorName} ·{" "}
                      {shortDate.format(new Date(record.createdAt))}
                    </p>
                    {record.expected ? (
                      <p>
                        {record.expected.professionalName} ·{" "}
                        {record.expected.competence} ·{" "}
                        {record.expected.ruleSnapshot.kind === "fixed"
                          ? `Fixa: ${currency.format((record.expected.ruleSnapshot.fixedAmountInCents ?? 0) / 100)}`
                          : `${record.expected.ruleSnapshot.percentage}% da tabela ${currency.format(record.expected.baseAmountInCents / 100)}`}{" "}
                        · {currency.format(record.expected.amountInCents / 100)}
                      </p>
                    ) : (
                      <p>Correção de uma origem sem comissão.</p>
                    )}
                  </div>
                ))}
              </>
            )}
            {preview.adjustments.length > 0 && (
              <>
                <h3>Histórico de ajustes</h3>
                {preview.adjustments.map((item) => (
                  <div className="clinical-resource-card" key={item.id}>
                    <strong>
                      {item.professionalName} · {item.competence} ·{" "}
                      {currency.format(item.amountInCents / 100)}
                    </strong>
                    <p>
                      {item.reason} ·{" "}
                      {shortDate.format(new Date(item.createdAt))} ·{" "}
                      {item.status === "paid"
                        ? "Baixa registrada"
                        : "Em aberto"}
                    </p>
                  </div>
                ))}
                <h3>Saldos em aberto por profissional</h3>
                <p>
                  Os ajustes em aberto entram na folha de pagamento da
                  competência e são pagos com ela (Financeiro › Folha).
                </p>
                {!balances.length ? (
                  <p>Nenhum saldo conciliado em aberto.</p>
                ) : (
                  balances.map((balance) => (
                    <div className="table-row" key={balance.professionalId}>
                      <strong>
                        {balance.professionalName} ·{" "}
                        {currency.format(balance.amountInCents / 100)}
                      </strong>
                    </div>
                  ))
                )}
              </>
            )}
            {preview.payments.length > 0 && (
              <>
                <h3>Pagamentos conciliados</h3>
                {preview.payments.map((payment) => (
                  <div className="table-row" key={payment.id}>
                    <div>
                      <strong>
                        {payment.professionalName} ·{" "}
                        {currency.format(payment.amountInCents / 100)}
                      </strong>
                      <p>
                        {shortDate.format(new Date(payment.occurredAt))}
                        {payment.reversedAt ? " · Estornado" : " · Registrado"}
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      aria-label={`Comprovantes do pagamento de ${payment.professionalName}`}
                      onClick={() => setViewingProofs(payment)}
                    >
                      Comprovantes
                    </button>
                    {!payment.reversedAt &&
                      can("finance.commissions_reverse") && (
                        <button
                          className="danger-button"
                          disabled={busy}
                          onClick={() => setConfirmation({ payment })}
                        >
                          Estornar baixa conciliada
                        </button>
                      )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
        <div className="modal-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Atualizar conta conciliada
          </button>
          <button className="secondary-button" disabled={busy} onClick={close}>
            Fechar conciliação
          </button>
        </div>
      </Modal>
      {confirmation && (
        <Modal
          title="Estornar baixa conciliada"
          subtitle="Confirme o registro financeiro realizado pela equipe."
          busy={busy}
          onClose={() => setConfirmation(null)}
        >
          {error && <ErrorBanner error={error} />}
          <p>
            O estorno preserva a baixa original e registra sua reversão no
            caixa.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void confirm()}
            >
              Confirmar registro conciliado
            </button>
          </div>
        </Modal>
      )}
      {viewingProofs && (
        <PaymentProofsModal
          entity="commission_account_payment"
          entityId={viewingProofs.id}
          subtitle={`${viewingProofs.professionalName} · ${currency.format(viewingProofs.amountInCents / 100)}`}
          canAttach={
            !viewingProofs.reversedAt && can("finance.commissions_pay")
          }
          onClose={() => setViewingProofs(null)}
        />
      )}
      {prompt.modal}
    </>
  );
}
