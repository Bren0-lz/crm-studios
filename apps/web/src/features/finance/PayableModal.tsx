import type {
  FinancialWorkspace,
  PayableInput,
  Supplier,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { localIsoDate } from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";
import {
  CREATE_OPTION_VALUE,
  FinanceRegistryModal,
} from "./FinanceRegistryModal";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp } from "./model";
import { ExpenseKindPicker } from "./ExpenseKindPicker";
import {
  carriedId,
  EXPENSE_KIND_FOCUS,
  hasCarriedDraft,
  type ExpenseKindSwitch,
} from "./expense-kind";

export function PayableModal({
  workspace,
  onClose,
  onCreated,
  kindSwitch,
}: {
  workspace: FinancialWorkspace;
  onClose: () => void;
  onCreated: () => void;
  /** No modal único de "Nova despesa": escolha entre pontual e fixa. */
  kindSwitch?: ExpenseKindSwitch | undefined;
}) {
  const draft = kindSwitch?.draft;
  const toast = useToast();
  const { can } = useAuthorization();
  const [expenseCategories, setExpenseCategories] = useState(() =>
    workspace.categories.filter((item) => item.kind === "expense"),
  );
  const [costCenters, setCostCenters] = useState(workspace.costCenters);
  const [form, setForm] = useState<PayableInput>({
    description: draft?.description ?? "",
    supplier: draft?.supplier ?? "",
    categoryId:
      carriedId(draft?.categoryId, expenseCategories) ??
      expenseCategories[0]?.id ??
      "",
    costCenterId:
      carriedId(draft?.costCenterId, workspace.costCenters) ??
      workspace.costCenters[0]?.id ??
      "",
    dueDate: localIsoDate(),
    amountInCents: draft?.amountInCents ?? 0,
    notes: "",
  });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<"category" | "costCenter" | null>(
    null,
  );
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
  const dirty = useFormDirty(form) || hasCarriedDraft(draft);
  const missing = useMissingFields(
    [
      form.description.trim().length < 3 &&
        "Descrição (pelo menos 3 caracteres)",
      !form.categoryId && "Categoria",
      !form.dueDate && "Vencimento",
      form.amountInCents <= 0 && "Valor",
    ].filter((item): item is string => Boolean(item)),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      // Centro de custo é opcional: vazio não vai para a API.
      const { costCenterId, ...rest } = form;
      await api.createPayable({
        ...rest,
        ...(costCenterId ? { costCenterId } : {}),
      });
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Modal
        title={kindSwitch ? "Nova despesa" : "Nova conta a pagar"}
        subtitle="Classifique a despesa para compor o fluxo de caixa."
        {...(kindSwitch ? { initialFocus: EXPENSE_KIND_FOCUS } : {})}
        busy={loading}
        dirty={dirty}
        onClose={onClose}
      >
        {can("finance.payables_create") && (
          <form className="form-grid" onSubmit={submit}>
            <ExpenseKindPicker
              value="single"
              kindSwitch={kindSwitch}
              draft={{
                description: form.description,
                supplier: form.supplier ?? "",
                categoryId: form.categoryId,
                costCenterId: form.costCenterId ?? "",
                amountInCents: form.amountInCents,
              }}
            />
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
              <span className="label-with-help">
                Lançamento
                <HelpTip term="Lançamento" text={financeTermHelp.posted} />
              </span>
              <input
                type="date"
                value={form.postedOn ?? localIsoDate()}
                onChange={(event) =>
                  setForm({ ...form, postedOn: event.target.value })
                }
              />
            </label>
            <label>
              <span className="label-with-help">
                Competência
                <HelpTip term="Competência" text={financeTermHelp.competence} />
              </span>
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
            <div className="field-with-hint">
              <label>
                Categoria
                <select
                  required
                  value={form.categoryId}
                  className="select-opens-down"
                  onChange={(event) => {
                    if (event.target.value === CREATE_OPTION_VALUE)
                      setCreating("category");
                    else setForm({ ...form, categoryId: event.target.value });
                  }}
                >
                  {expenseCategories.length === 0 && (
                    <option value="">Nenhuma categoria cadastrada</option>
                  )}
                  {expenseCategories.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {can("finance.categories_create") && (
                    <option value={CREATE_OPTION_VALUE}>
                      + Nova categoria
                    </option>
                  )}
                </select>
              </label>
              {expenseCategories.length === 0 &&
                !can("finance.categories_create") && (
                  <span className="field-hint">
                    Peça a quem administra o financeiro para cadastrar.
                  </span>
                )}
            </div>
            <div className="field-with-hint">
              <label>
                <span className="label-with-help">
                  Centro de custo (opcional)
                  <HelpTip
                    term="Centro de custo"
                    text={financeTermHelp.costCenter}
                  />
                </span>
                <select
                  value={form.costCenterId ?? ""}
                  className="select-opens-down"
                  onChange={(event) => {
                    if (event.target.value === CREATE_OPTION_VALUE)
                      setCreating("costCenter");
                    else setForm({ ...form, costCenterId: event.target.value });
                  }}
                >
                  <option value="">Sem centro de custo</option>
                  {costCenters.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {can("finance.cost_centers_create") && (
                    <option value={CREATE_OPTION_VALUE}>
                      + Novo centro de custo
                    </option>
                  )}
                </select>
              </label>
            </div>
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
            {missing.hint}
            <div className="modal-actions span-2">
              <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
              <button
                className="primary-button"
                disabled={loading || missing.blocked}
                aria-describedby={missing.describedBy}
              >
                {loading ? "Salvando…" : "Cadastrar despesa"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {creating && (
        <FinanceRegistryModal
          kind={creating}
          onClose={() => setCreating(null)}
          onConfirm={async (name) => {
            if (creating === "category") {
              const created = await api.createFinancialCategory({
                name,
                kind: "expense",
              });
              setExpenseCategories((items) => [...items, created]);
              setForm((current) => ({ ...current, categoryId: created.id }));
              toast.success(`Categoria “${created.name}” criada.`);
            } else {
              const created = await api.createCostCenter({ name });
              setCostCenters((items) => [...items, created]);
              setForm((current) => ({ ...current, costCenterId: created.id }));
              toast.success(`Centro de custo “${created.name}” criado.`);
            }
            setCreating(null);
          }}
        />
      )}
    </>
  );
}
