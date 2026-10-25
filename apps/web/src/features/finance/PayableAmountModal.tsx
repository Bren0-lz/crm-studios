import type { Payable } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { formatIsoDate } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

/** Valor real do mês de uma conta gerada por despesa fixa de valor variável. */
export function PayableAmountModal({
  payable,
  onClose,
  onSaved,
}: {
  payable: Pick<Payable, "id" | "description" | "dueDate" | "amountInCents">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amountInCents, setAmountInCents] = useState(payable.amountInCents);
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
  return (
    <Modal
      title="Informar valor do mês"
      subtitle={`${payable.description}, vencimento em ${formatIsoDate(payable.dueDate)}.`}
      busy={loading}
      dirty={dirty}
      onClose={onClose}
    >
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
    </Modal>
  );
}
