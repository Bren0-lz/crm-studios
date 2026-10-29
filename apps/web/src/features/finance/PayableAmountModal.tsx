import type { Payable } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatCompetence } from "./model";

/** Valor do mês de uma conta gerada por despesa fixa (água, luz…). */
export function PayableAmountModal({
  payable,
  onClose,
  onSaved,
}: {
  payable: Payable;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuthorization();
  const [amountInCents, setAmountInCents] = useState(
    payable.amountPending ? 0 : payable.amountInCents,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(amountInCents);
  const missing = useMissingFields(amountInCents > 0 ? [] : ["Valor do mês"]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.setPayableAmount(payable.id, amountInCents);
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const competence = payable.competence
    ? ` de ${formatCompetence(payable.competence)}`
    : "";
  return (
    <Modal
      title="Informar valor do mês"
      subtitle={`${payable.description}${competence}: o valor da conta substitui a estimativa.`}
      busy={loading}
      dirty={dirty}
      onClose={onClose}
    >
      {can("finance.recurring_update") && (
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Valor do mês
            <MoneyInput
              required
              valueInCents={amountInCents}
              onChange={(cents) => setAmountInCents(cents ?? 0)}
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          {missing.hint}
          <div className="modal-actions span-2">
            <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
            <button
              className="primary-button"
              disabled={loading || missing.blocked}
              aria-describedby={missing.describedBy}
            >
              {loading ? "Salvando…" : "Salvar valor"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
