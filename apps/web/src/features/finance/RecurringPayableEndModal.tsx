import { competenceMonthSchema, type RecurringPayable } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { recurringPayableInput } from "./model";

export function RecurringPayableEndModal({
  item,
  currentMonth,
  onClose,
  onEnded,
}: {
  item: RecurringPayable;
  currentMonth: string;
  onClose: () => void;
  onEnded: () => void;
}) {
  const { can } = useAuthorization();
  const [endMonth, setEndMonth] = useState(item.endMonth ?? currentMonth);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(endMonth);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const month = competenceMonthSchema.safeParse(endMonth);
    if (!month.success) {
      setError("Informe o último mês da despesa.");
      return;
    }
    if (month.data < item.startMonth) {
      setError("O mês final não pode ser anterior ao mês inicial.");
      return;
    }
    setLoading(true);
    try {
      await api.updateRecurringPayable(
        item.id,
        recurringPayableInput(item, { endMonth: month.data }),
      );
      onEnded();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Encerrar despesa fixa"
      subtitle={`${item.description}: nenhuma conta é gerada depois do último mês.`}
      busy={loading}
      dirty={dirty}
      onClose={onClose}
    >
      {can("finance.recurring_update") && (
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Último mês
            <input
              required
              type="month"
              min={item.startMonth}
              value={endMonth}
              onChange={(event) => setEndMonth(event.target.value)}
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          <div className="modal-actions span-2">
            <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
            <button className="primary-button" disabled={loading}>
              {loading ? "Salvando…" : "Encerrar despesa fixa"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
