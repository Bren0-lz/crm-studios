import type {
  FinancialEntryFilter,
  FinancialWorkspace,
  Supplier,
} from "@crm/contracts";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { HelpTip } from "../../shared/components/HelpTip";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { dailyCashMethodLabels, financeTermHelp } from "./model";

const emptyFilter: FinancialEntryFilter = { dateField: "dueDate" };

/** Quantos critérios restringem a lista ("Data considerada" sozinha não filtra). */
function activeFilterCount(filter: FinancialEntryFilter) {
  return (
    [
      filter.search?.trim(),
      filter.from,
      filter.to,
      filter.competence,
      filter.status,
      filter.categoryId,
      filter.costCenterId,
      filter.supplierId,
      filter.paymentMethod,
    ] as const
  ).filter(Boolean).length;
}

export function FinanceEntryFilters({
  value,
  onChange,
  workspace,
  payables = false,
}: {
  value: FinancialEntryFilter;
  onChange: (filter: FinancialEntryFilter) => void;
  workspace: FinancialWorkspace;
  payables?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<FinancialEntryFilter>(value),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open || !payables) return;
    let active = true;
    api
      .suppliers()
      .then((items) => {
        if (active) setSuppliers(items);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [open, payables]);
  const patch = (filter: Partial<FinancialEntryFilter>) =>
    setDraft((current) => ({ ...current, ...filter }));
  const count = activeFilterCount(value);
  return (
    <div className="finance-filter-bar">
      <button
        type="button"
        className={`secondary-button filter-toggle ${count > 0 ? "active" : ""}`}
        onClick={() => {
          setDraft(value);
          setError("");
          setOpen(true);
        }}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Filtrar lançamentos
        {count > 0 && (
          <span className="filter-badge" aria-label={`${count} ativos`}>
            {count}
          </span>
        )}
      </button>
      <span className="finance-filter-summary" aria-live="polite">
        {count === 0
          ? "Nenhum filtro aplicado"
          : count === 1
            ? "1 filtro aplicado"
            : `${count} filtros aplicados`}
      </span>
      {count > 0 && (
        <button
          type="button"
          className="secondary-button button-sm"
          onClick={() => onChange(emptyFilter)}
        >
          Limpar filtros de lançamentos
        </button>
      )}
      {open && (
        <Modal
          wide
          title="Filtrar lançamentos"
          subtitle="Escolha as datas e a classificação. A lista é filtrada ao salvar."
          dirty={JSON.stringify(draft) !== JSON.stringify(value)}
          onClose={() => setOpen(false)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              onChange({ ...draft, search: draft.search?.trim() || undefined });
              setOpen(false);
            }}
          >
            <label>
              Pesquisar lançamento
              <input
                maxLength={200}
                value={draft.search ?? ""}
                onChange={(event) => patch({ search: event.target.value })}
              />
            </label>
            <label>
              Data considerada
              <select
                value={draft.dateField}
                onChange={(event) =>
                  patch({
                    dateField: event.target
                      .value as FinancialEntryFilter["dateField"],
                  })
                }
              >
                <option value="dueDate">Vencimento</option>
                <option value="postedOn">Lançamento</option>
                <option value="paidAt">Pagamento</option>
                <option value="cashAvailableAt">
                  Disponibilidade no caixa
                </option>
              </select>
            </label>
            <label>
              De
              <input
                type="date"
                value={draft.from ?? ""}
                max={draft.to}
                onChange={(event) =>
                  patch({ from: event.target.value || undefined })
                }
              />
            </label>
            <label>
              Até
              <input
                type="date"
                min={draft.from}
                value={draft.to ?? ""}
                onChange={(event) =>
                  patch({ to: event.target.value || undefined })
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
                value={draft.competence ?? ""}
                onChange={(event) =>
                  patch({ competence: event.target.value || undefined })
                }
              />
            </label>
            <label>
              Situação do lançamento
              <select
                value={draft.status ?? ""}
                onChange={(event) =>
                  patch({
                    status:
                      (event.target.value as FinancialEntryFilter["status"]) ||
                      undefined,
                  })
                }
              >
                <option value="">Todas</option>
                <option value="open">Em aberto</option>
                <option value="overdue">Em atraso</option>
                <option value="paid">Pago</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <label>
              Categoria do lançamento
              <select
                value={draft.categoryId ?? ""}
                onChange={(event) =>
                  patch({ categoryId: event.target.value || undefined })
                }
              >
                <option value="">Todas</option>
                {workspace.categories
                  .filter(
                    (item) => item.kind === (payables ? "expense" : "income"),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.active ? "" : " (inativa)"}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="label-with-help">
                Centro de custo do lançamento
                <HelpTip
                  term="Centro de custo"
                  text={financeTermHelp.costCenter}
                />
              </span>
              <select
                value={draft.costCenterId ?? ""}
                onChange={(event) =>
                  patch({ costCenterId: event.target.value || undefined })
                }
              >
                <option value="">Todos</option>
                {workspace.costCenters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.active ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </label>
            {payables && (
              <label>
                Fornecedor do lançamento
                <select
                  value={draft.supplierId ?? ""}
                  onChange={(event) =>
                    patch({ supplierId: event.target.value || undefined })
                  }
                >
                  <option value="">Todos</option>
                  {suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.active ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Forma de pagamento do lançamento
              <select
                value={draft.paymentMethod ?? ""}
                onChange={(event) =>
                  patch({
                    paymentMethod:
                      (event.target
                        .value as FinancialEntryFilter["paymentMethod"]) ||
                      undefined,
                  })
                }
              >
                <option value="">Todas</option>
                {Object.entries(dailyCashMethodLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {error && <ErrorBanner error={error} />}
            <div className="modal-actions span-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDraft(emptyFilter)}
              >
                Limpar campos
              </button>
              <ModalCancelButton>Cancelar</ModalCancelButton>
              <button type="submit" className="primary-button">
                Salvar filtros
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
