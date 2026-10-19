import type { FinancialWorkspace } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { InlineClassificationCreate } from "./InlineClassificationCreate";

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
  const [expenseCategories, setExpenseCategories] = useState(() =>
    workspace.categories.filter(
      (item) => item.kind === "expense" && item.active,
    ),
  );
  const [costCenters, setCostCenters] = useState(() =>
    workspace.costCenters.filter((item) => item.active),
  );
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
  const dirty = useFormDirty(form);
  const missing = [
    form.description.trim().length < 3 && "descrição",
    !form.categoryId && "categoria",
    !form.costCenterId && "centro de custo",
    form.amountInCents <= 0 && "valor mensal",
  ].filter((item): item is string => Boolean(item));
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
      dirty={dirty}
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
            <MoneyInput
              required
              valueInCents={form.amountInCents}
              onChange={(cents) =>
                setForm({ ...form, amountInCents: cents ?? 0 })
              }
            />
          </label>
          <div className="field-with-hint">
            <label>
              Categoria
              <select
                required
                value={form.categoryId}
                onChange={(event) =>
                  setForm({ ...form, categoryId: event.target.value })
                }
              >
                {expenseCategories.length === 0 && (
                  <option value="">Nenhuma categoria cadastrada</option>
                )}
                {expenseCategories.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {expenseCategories.length === 0 && (
              <InlineClassificationCreate
                emptyLabel="Nenhuma categoria de despesa"
                createLabel="Criar categoria"
                canCreate={can("finance.categories_create")}
                onCreate={async (name) => {
                  const created = await api.createFinancialCategory({
                    name,
                    kind: "expense",
                  });
                  setExpenseCategories((items) => [...items, created]);
                  setForm((current) => ({
                    ...current,
                    categoryId: created.id,
                  }));
                }}
              />
            )}
          </div>
          <div className="field-with-hint">
            <label>
              Centro de custo
              <select
                required
                value={form.costCenterId}
                onChange={(event) =>
                  setForm({ ...form, costCenterId: event.target.value })
                }
              >
                {costCenters.length === 0 && (
                  <option value="">Nenhum centro de custo cadastrado</option>
                )}
                {costCenters.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {costCenters.length === 0 && (
              <InlineClassificationCreate
                emptyLabel="Nenhum centro de custo"
                createLabel="Criar centro de custo"
                canCreate={can("finance.cost_centers_create")}
                onCreate={async (name) => {
                  const created = await api.createCostCenter({ name });
                  setCostCenters((items) => [...items, created]);
                  setForm((current) => ({
                    ...current,
                    costCenterId: created.id,
                  }));
                }}
              />
            )}
          </div>
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
          {missing.length > 0 && (
            <p className="muted-copy payable-missing span-2">
              Para cadastrar, preencha: {missing.join(", ")}.
            </p>
          )}
          <div className="modal-actions span-2">
            <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
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
