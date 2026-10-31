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

/** Valor do campo "Plano": nome do plano vendido, comanda ou lançamento manual. */
function originValue(filter: FinancialEntryFilter) {
  if (filter.source === "plan" && filter.planName)
    return `plan:${filter.planName}`;
  return filter.source ?? "";
}

function originFilter(
  value: string,
): Pick<FinancialEntryFilter, "source" | "planName"> {
  if (value.startsWith("plan:"))
    return { source: "plan", planName: value.slice(5) };
  return {
    source: (value || undefined) as FinancialEntryFilter["source"],
    planName: undefined,
  };
}

/** Planos e serviços que aparecem nas contas a receber, em ordem alfabética. */
function receivableOrigins(workspace: FinancialWorkspace) {
  const plans = new Set<string>(),
    services = new Map<string, string>();
  for (const item of workspace.summary.receivables) {
    if (item.planName) plans.add(item.planName);
    for (const service of item.services ?? [])
      services.set(service.id, service.name);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return {
    plans: [...plans].sort(byName),
    services: [...services]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => byName(a.name, b.name)),
  };
}

/** Quantos critérios restringem a lista ("Data considerada" sozinha não filtra). */
function activeFilterCount(filter: FinancialEntryFilter) {
  return (
    [
      filter.search?.trim(),
      filter.from,
      filter.to,
      filter.status,
      filter.categoryId,
      filter.source,
      filter.serviceId,
      filter.costCenterId,
      filter.supplierId,
      filter.paymentMethod,
      filter.installments,
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
  const origins = receivableOrigins(workspace);
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
            className="form-grid finance-entry-filter-form"
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
            {payables ? (
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
                    .filter((item) => item.kind === "expense")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.active ? "" : " (inativa)"}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  Plano do lançamento
                  <select
                    value={originValue(draft)}
                    onChange={(event) =>
                      patch(originFilter(event.target.value))
                    }
                  >
                    <option value="">Todos</option>
                    {origins.plans.length > 0 && (
                      <optgroup label="Planos vendidos">
                        {origins.plans.map((name) => (
                          <option key={name} value={`plan:${name}`}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="plan">Qualquer plano</option>
                    <option value="tab">Comanda</option>
                    <option value="manual">Lançamento manual</option>
                  </select>
                </label>
                <label>
                  Serviço do lançamento
                  <select
                    value={draft.serviceId ?? ""}
                    onChange={(event) =>
                      patch({ serviceId: event.target.value || undefined })
                    }
                  >
                    <option value="">Todos</option>
                    {origins.services.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
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
            {!payables && (
              <label>
                Parcelamento
                <select
                  value={draft.installments ?? ""}
                  onChange={(event) =>
                    patch({
                      installments:
                        (event.target
                          .value as FinancialEntryFilter["installments"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">Todos</option>
                  <option value="installments">Parceladas</option>
                  <option value="single">À vista</option>
                </select>
              </label>
            )}
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
