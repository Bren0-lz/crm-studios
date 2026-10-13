import type { FinancialWorkspace, PayableInput } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { localIsoDate } from "../../shared/lib/formatting";

export function PayableModal({
  workspace,
  onClose,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { can } = useAuthorization();
  const expenseCategories = workspace.categories.filter(
    (item) => item.kind === "expense",
  );
  const [form, setForm] = useState<PayableInput>({
    description: "",
    supplier: "",
    categoryId: expenseCategories[0]?.id ?? "",
    costCenterId: workspace.costCenters[0]?.id ?? "",
    dueDate: localIsoDate(),
    amountInCents: 0,
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await api.createPayable(form);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Nova conta a pagar"
      subtitle="Classifique a despesa para compor o fluxo de caixa."
      busy={loading}
      onClose={onClose}
    >
      {can("finance.payables_create") && (
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Descrição
            <input
              required
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label>
            Fornecedor
            <input
              value={form.supplier}
              onChange={(event) =>
                setForm({ ...form, supplier: event.target.value })
              }
            />
          </label>
          <label>
            Vencimento
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
            />
          </label>
          <label>
            Categoria
            <select
              required
              value={form.categoryId}
              onChange={(event) =>
                setForm({ ...form, categoryId: event.target.value })
              }
            >
              {expenseCategories.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Centro de custo
            <select
              required
              value={form.costCenterId}
              onChange={(event) =>
                setForm({ ...form, costCenterId: event.target.value })
              }
            >
              {workspace.costCenters.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.amountInCents / 100}
              onChange={(event) =>
                setForm({
                  ...form,
                  amountInCents: Math.round(Number(event.target.value) * 100),
                })
              }
            />
          </label>
          <label>
            Observações
            <input
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          </label>
          {error && <div className="form-error span-2">{error}</div>}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              disabled={loading || !form.categoryId || !form.costCenterId}
            >
              {loading ? "Salvando…" : "Cadastrar despesa"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
