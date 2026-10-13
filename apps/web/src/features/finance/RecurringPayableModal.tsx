import type { FinancialWorkspace } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";

export function RecurringPayableModal({
  workspace,
  currentMonth,
  onClose,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  currentMonth: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { can } = useAuthorization();
  const expenseCategories = workspace.categories.filter(
    (item) => item.kind === "expense" && item.active,
  );
  const costCenters = workspace.costCenters.filter((item) => item.active);
  const [form, setForm] = useState({
    description: "",
    supplier: "",
    categoryId: expenseCategories[0]?.id ?? "",
    costCenterId: costCenters[0]?.id ?? "",
    amountInCents: 0,
    dayOfMonth: Math.min(new Date().getDate(), 28),
    startMonth: currentMonth,
    endMonth: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { supplier, endMonth, ...rest } = form;
    try {
      await api.createRecurringPayable({
        ...rest,
        description: rest.description.trim(),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(endMonth ? { endMonth } : {}),
        active: true,
      });
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title="Nova despesa fixa"
      subtitle="A conta a pagar é gerada todo mês, do mês inicial até o final."
      busy={loading}
      onClose={onClose}
    >
      {can("finance.recurring_create") && (
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Descrição
            <input
              required
              minLength={3}
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
            Valor mensal
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
              {costCenters.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dia do vencimento
            <input
              required
              type="number"
              min="1"
              max="28"
              step="1"
              value={form.dayOfMonth}
              onChange={(event) =>
                setForm({ ...form, dayOfMonth: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Mês inicial
            <input
              required
              type="month"
              value={form.startMonth}
              onChange={(event) =>
                setForm({ ...form, startMonth: event.target.value })
              }
            />
          </label>
          <label>
            Mês final (opcional)
            <input
              type="month"
              min={form.startMonth}
              value={form.endMonth}
              onChange={(event) =>
                setForm({ ...form, endMonth: event.target.value })
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
              {loading ? "Salvando…" : "Cadastrar despesa fixa"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
