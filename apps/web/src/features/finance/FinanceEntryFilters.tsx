import type { FinancialEntryFilter, FinancialWorkspace } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import type { Supplier } from "@crm/contracts";
import { dailyCashMethodLabels, financeTermHelp } from "./model";
import { HelpTip } from "../../shared/components/HelpTip";
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
    onChange({ ...value, ...filter });
  return (
    <details
      className="filter-group"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Filtrar lançamentos por datas e classificação</summary>
      {open && (
        <div className="form-grid">
          <label>
            Pesquisar lançamento
            <input
              maxLength={200}
              value={value.search ?? ""}
              onChange={(event) => patch({ search: event.target.value })}
            />
          </label>
          <label>
            Data considerada
            <select
              value={value.dateField}
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
              <option value="cashAvailableAt">Disponibilidade no caixa</option>
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              value={value.from ?? ""}
              max={value.to}
              onChange={(event) =>
                patch({ from: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Até
            <input
              type="date"
              min={value.from}
              value={value.to ?? ""}
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
              value={value.competence ?? ""}
              onChange={(event) =>
                patch({ competence: event.target.value || undefined })
              }
            />
          </label>
          <label>
            Situação do lançamento
            <select
              value={value.status ?? ""}
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
              value={value.categoryId ?? ""}
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
              value={value.costCenterId ?? ""}
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
                value={value.supplierId ?? ""}
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
              value={value.paymentMethod ?? ""}
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
          <button
            className="secondary-button"
            type="button"
            onClick={() => onChange({ dateField: "dueDate" })}
          >
            Limpar filtros de lançamentos
          </button>
        </div>
      )}
    </details>
  );
}
