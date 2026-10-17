import type {
  FinancialWorkspace,
  PayableInput,
  Supplier,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { localIsoDate } from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .suppliers()
      .then((items) => {
        if (alive) setSuppliers(items);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, []);
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
          {can("finance.commissions_pay") && (
            <label className="span-2">
              Comissão vinculada (opcional)
              <select
                value={form.commissionId ?? ""}
                onChange={(event) => {
                  const commission = workspace.commissions.find(
                      (item) => item.id === event.target.value,
                    ),
                    next = { ...form };
                  if (commission) {
                    next.commissionId = commission.id;
                    next.amountInCents = commission.amountInCents;
                    next.dreCompetence = commission.competence;
                  } else delete next.commissionId;
                  setForm(next);
                }}
              >
                <option value="">Despesa sem comissão</option>
                {workspace.commissions
                  .filter(
                    (item) =>
                      item.status === "open" &&
                      item.amountInCents > 0 &&
                      !workspace.payables.some(
                        (payable) =>
                          payable.commissionId === item.id &&
                          payable.status !== "cancelled",
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.professionalName} · {item.competence}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Fornecedor cadastrado
            <select
              value={form.supplierId ?? ""}
              onChange={(event) => {
                const item = suppliers.find(
                  (item) => item.id === event.target.value,
                );
                setForm({
                  ...form,
                  supplierId: item?.id,
                  supplier: item?.name ?? form.supplier,
                });
              }}
            >
              <option value="">Informar manualmente</option>
              {suppliers
                .filter((item) => item.active || item.id === form.supplierId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
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
            Lançamento
            <input
              type="date"
              value={form.postedOn ?? localIsoDate()}
              onChange={(event) =>
                setForm({ ...form, postedOn: event.target.value })
              }
            />
          </label>
          <label>
            Competência
            <input
              type="month"
              value={form.dreCompetence ?? localIsoDate().slice(0, 7)}
              onChange={(event) =>
                setForm({ ...form, dreCompetence: event.target.value })
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
            <MoneyInput
              required
              valueInCents={form.amountInCents}
              onChange={(cents) =>
                setForm({ ...form, amountInCents: cents ?? 0 })
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
