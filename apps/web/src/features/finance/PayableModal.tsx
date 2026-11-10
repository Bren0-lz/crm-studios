import type {
  FinancialWorkspace,
  PayableInput,
  Supplier,
} from "@crm/contracts";
import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatIsoDate, localIsoDate } from "../../shared/lib/formatting";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp } from "./model";
import { ExpenseKindPicker } from "./ExpenseKindPicker";
import { ExpenseAccountFields } from "./ExpenseAccountFields";
import { useExpenseClassifications } from "./useExpenseClassifications";
import { SupplierModal } from "./SupplierModal";
import {
  carriedId,
  CREATE_OPTION_VALUE,
  EXPENSE_KIND_FOCUS,
  hasCarriedDraft,
  type ExpenseKindSwitch,
} from "./expense-kind";

/** Data informada na despesa pontual: o vencimento ou o dia do lançamento. */
type DateField = "dueDate" | "postedOn";

/** Fornecedor cadastrado com o mesmo nome (sem diferença de caixa e espaços). */
function matchSupplier(suppliers: Supplier[], name: string | undefined) {
  const key = name?.trim().toLocaleLowerCase("pt-BR");
  if (!key) return undefined;
  return suppliers.find(
    (item) =>
      item.active && item.name.trim().toLocaleLowerCase("pt-BR") === key,
  );
}

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
  const { can } = useAuthorization();
  const dateName = useId();
  const classifications = useExpenseClassifications({
    workspace,
    onCreated: (kind, id) =>
      setForm((current) => ({
        ...current,
        [kind === "category" ? "categoryId" : "costCenterId"]: id,
      })),
  });
  const { categories, costCenters } = classifications;
  const [form, setForm] = useState({
    description: draft?.description ?? "",
    // Só fornecedor cadastrado: o nome vindo da despesa fixa é casado ao carregar a lista.
    supplier: "",
    supplierId: undefined as string | undefined,
    categoryId:
      carriedId(draft?.categoryId, categories) ?? categories[0]?.id ?? "",
    costCenterId:
      carriedId(draft?.costCenterId, costCenters) ?? costCenters[0]?.id ?? "",
    dateField: "dueDate" as DateField,
    date: localIsoDate(),
    amountInCents: draft?.amountInCents ?? 0,
    notes: "",
  });
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const canCreateSupplier = can("finance.suppliers_manage");
  function selectSupplier(item: Supplier | undefined) {
    setForm((current) => ({
      ...current,
      supplierId: item?.id,
      supplier: item?.name ?? "",
    }));
  }
  useEffect(() => {
    let alive = true;
    api
      .suppliers()
      .then((items) => {
        if (!alive) return;
        setSuppliers(items);
        setSuppliersLoaded(true);
        // A despesa fixa só guarda o nome: reaproveita o cadastro com o mesmo nome.
        const match = matchSupplier(items, draft?.supplier);
        setForm((current) =>
          current.supplierId
            ? current
            : {
                ...current,
                supplierId: match?.id,
                supplier: match?.name ?? "",
              },
        );
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
    // O rascunho só vale na abertura do modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form) || hasCarriedDraft(draft);
  const missing = useMissingFields(
    [
      form.description.trim().length < 3 &&
        "Descrição (pelo menos 3 caracteres)",
      !form.categoryId && "Categoria",
      form.amountInCents <= 0 && "Valor",
      !form.date && "Data",
    ].filter((item): item is string => Boolean(item)),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const registered = suppliers.find((item) => item.id === form.supplierId);
    const supplier = registered?.name ?? "";
    // Sem o campo de competência, a DRE usa o mês da data informada.
    const input: PayableInput = {
      description: form.description.trim(),
      supplier,
      ...(registered ? { supplierId: registered.id } : {}),
      categoryId: form.categoryId,
      // Centro de custo é opcional: vazio não vai para a API.
      ...(form.costCenterId ? { costCenterId: form.costCenterId } : {}),
      dueDate: form.date,
      ...(form.dateField === "postedOn" ? { postedOn: form.date } : {}),
      dreCompetence: form.date.slice(0, 7),
      amountInCents: form.amountInCents,
      notes: form.notes.trim(),
    };
    try {
      await api.createPayable(input);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const dateLabel =
    form.dateField === "dueDate" ? "Data do vencimento" : "Data do lançamento";
  return (
    <>
      <Modal
        title={kindSwitch ? "Nova despesa" : "Nova conta a pagar"}
        subtitle="Uma conta a pagar só, com valor e data."
        {...(kindSwitch ? { initialFocus: EXPENSE_KIND_FOCUS } : {})}
        busy={loading}
        inactive={classifications.creating !== null || creatingSupplier}
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
                supplier: form.supplier || (draft?.supplier ?? ""),
                categoryId: form.categoryId,
                costCenterId: form.costCenterId,
                amountInCents: form.amountInCents,
              }}
            />
            <ExpenseAccountFields
              value={form}
              onChange={(patch) =>
                setForm((current) => ({ ...current, ...patch }))
              }
              categories={categories}
              costCenters={costCenters}
              onCreate={classifications.setCreating}
              supplierField={
                <div className="field-with-hint">
                  <label>
                    Fornecedor
                    <select
                      value={form.supplierId ?? ""}
                      className="select-opens-down"
                      onChange={(event) => {
                        if (event.target.value === CREATE_OPTION_VALUE) {
                          setCreatingSupplier(true);
                          return;
                        }
                        selectSupplier(
                          suppliers.find(
                            (item) => item.id === event.target.value,
                          ),
                        );
                      }}
                    >
                      <option value="">Sem fornecedor</option>
                      {suppliers
                        .filter(
                          (item) => item.active || item.id === form.supplierId,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      {canCreateSupplier && (
                        <option value={CREATE_OPTION_VALUE}>
                          + Novo fornecedor
                        </option>
                      )}
                    </select>
                  </label>
                  {suppliersLoaded && suppliers.length === 0 && (
                    <span className="field-hint">
                      {canCreateSupplier
                        ? "Nenhum fornecedor cadastrado."
                        : "Nenhum fornecedor cadastrado. Peça a quem administra o financeiro para cadastrar."}
                    </span>
                  )}
                </div>
              }
            />
            <fieldset className="form-fieldset span-2">
              <legend>Valor e data</legend>
              <div className="form-fieldset-grid">
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
                  {dateLabel}
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      setForm({ ...form, date: event.target.value })
                    }
                  />
                </label>
                <div
                  className="expense-date-field span-2"
                  role="radiogroup"
                  aria-label="A data é do"
                >
                  <span className="label-with-help">
                    A data é do
                    <HelpTip term="Lançamento" text={financeTermHelp.posted} />
                  </span>
                  <label className="checkbox-field">
                    <input
                      type="radio"
                      name={dateName}
                      checked={form.dateField === "dueDate"}
                      onChange={() =>
                        setForm({ ...form, dateField: "dueDate" })
                      }
                    />
                    Vencimento
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="radio"
                      name={dateName}
                      checked={form.dateField === "postedOn"}
                      onChange={() =>
                        setForm({ ...form, dateField: "postedOn" })
                      }
                    />
                    Lançamento
                  </label>
                </div>
              </div>
              <p className="field-hint" aria-live="polite">
                {form.date
                  ? form.dateField === "dueDate"
                    ? `A conta vence em ${formatIsoDate(form.date)} e é lançada hoje.`
                    : `A conta é lançada e vence em ${formatIsoDate(form.date)}.`
                  : "Informe a data."}
              </p>
            </fieldset>
            <label className="span-2">
              Observações (opcional)
              <textarea
                rows={2}
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
      {classifications.registry}
      {creatingSupplier && (
        <SupplierModal
          supplier="new"
          onClose={() => setCreatingSupplier(false)}
          onSaved={async (saved) => {
            setSuppliers((items) => [
              ...items.filter((item) => item.id !== saved.id),
              saved,
            ]);
            setSuppliersLoaded(true);
            selectSupplier(saved);
          }}
        />
      )}
    </>
  );
}
