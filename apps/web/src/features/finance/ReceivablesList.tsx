import { type Receivable, saoPauloToday } from "@crm/contracts";
import { Search } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import {
  normalizeSearch,
  receivableFilterLabels,
  receivableSituation,
  signedCurrency,
} from "./model";
import type { ReceivableFilter } from "./types";

export function ReceivablesList({
  receivables,
  canManage,
  filter,
  search,
  selected,
  onFilterChange,
  onSearchChange,
  onSelectedChange,
  onRenegotiate,
  onSettle,
  onReverse,
  onAdjust,
  onReceipt,
  onProofs,
  onContact,
}: {
  receivables: Receivable[];
  canManage: boolean;
  filter: ReceivableFilter;
  search: string;
  selected: string[];
  onFilterChange: (filter: ReceivableFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectedChange: (ids: string[]) => void;
  onRenegotiate: () => void;
  onSettle: (item: Receivable) => void;
  onReverse: (id: string) => void;
  onAdjust: (item: Receivable) => void;
  onReceipt: (id: string) => void;
  onProofs: (item: Receivable) => void;
  onContact: (item: Receivable, overdue: boolean) => void;
}) {
  const { can } = useAuthorization();
  if (receivables.length === 0) {
    return (
      <EmptyState
        title="Nenhuma conta a receber"
        copy="As parcelas surgem após a venda de um plano."
      />
    );
  }
  const today = saoPauloToday();
  const rows = receivables.map((item) => ({
    item,
    situation: receivableSituation(item, today),
  }));
  const term = normalizeSearch(search);
  // Contadores sobre a lista já buscada: a soma das abas é sempre igual a "Todas".
  const searched = rows.filter(
    (row) => !term || normalizeSearch(row.item.patientName).includes(term),
  );
  const count = (key: Exclude<ReceivableFilter, "all">) =>
    searched.filter((row) => row.situation.key === key).length;
  const counts: Record<ReceivableFilter, number> = {
    all: searched.length,
    open: count("open"),
    overdue: count("overdue"),
    paid: count("paid"),
    cancelled: count("cancelled"),
  };
  const visible = searched.filter(
    (row) => filter === "all" || row.situation.key === filter,
  );
  const selectable = canManage
    ? visible.filter((row) => row.item.status === "open")
    : [];
  const allSelected =
    selectable.length > 0 &&
    selectable.every((row) => selected.includes(row.item.id));
  function toggle(id: string) {
    onSelectedChange(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  }
  return (
    <>
      <div className="list-toolbar finance-filters">
        <div
          className="tag-filter-list"
          role="group"
          aria-label="Filtrar parcelas por situação"
        >
          {(Object.keys(receivableFilterLabels) as ReceivableFilter[]).map(
            (key) => (
              <button
                key={key}
                type="button"
                className="tag-filter"
                aria-pressed={filter === key}
                onClick={() => onFilterChange(key)}
              >
                {receivableFilterLabels[key]} <small>{counts[key]}</small>
              </button>
            ),
          )}
        </div>
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            aria-label="Buscar cliente"
            placeholder="Buscar por cliente"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        {selectable.length > 0 && (
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                onSelectedChange(
                  allSelected ? [] : selectable.map((row) => row.item.id),
                )
              }
            />
            Selecionar todas
          </label>
        )}
      </div>
      {canManage && selected.length > 0 && (
        <div className="selection-bar" role="status">
          <strong>
            {selected.length === 1
              ? "1 parcela selecionada"
              : `${selected.length} parcelas selecionadas`}
          </strong>
          <div className="page-actions">
            <button
              type="button"
              className="text-button button-sm"
              onClick={() => onSelectedChange([])}
            >
              Limpar seleção
            </button>
            {can("finance.renegotiate") && (
              <button
                type="button"
                className="primary-button button-sm"
                onClick={onRenegotiate}
              >
                Renegociar
              </button>
            )}
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="finance-filter-empty">
          <EmptyState
            title="Nenhuma parcela encontrada"
            copy="Limpe a busca ou escolha outra situação para ver as parcelas."
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onFilterChange("all");
              onSearchChange("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div
          className={`finance-table finance-list receivables-table${canManage ? " selectable" : ""}`}
        >
          <div className="finance-row finance-head" aria-hidden="true">
            {canManage && <span />}
            <span>Cliente e plano</span>
            <span>Vencimento</span>
            <span className="finance-amount">Valor</span>
            <span>Situação</span>
            <span className="finance-actions">Ações</span>
          </div>
          {visible.map(({ item, situation }) => (
            <div className="finance-row" key={item.id}>
              {canManage &&
                (item.status === "open" ? (
                  <input
                    type="checkbox"
                    className="row-check"
                    aria-label={`Selecionar parcela de ${item.patientName}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                ) : (
                  <span />
                ))}
              <div className="finance-item">
                <strong title={item.patientName}>{item.patientName}</strong>
                <span title={item.description}>{item.description}</span>
              </div>
              <span className="finance-due">
                <span className="finance-label">Vencimento </span>
                {shortDate.format(new Date(`${item.dueDate}T12:00:00`))}
              </span>
              {item.status === "cancelled" ? (
                // Cancelada não é entrada: valor neutro, riscado e sem sinal,
                // com o selo em texto logo ao lado.
                <strong className="finance-amount cancelled-amount">
                  <s>{currency.format(item.amountInCents / 100)}</s>{" "}
                  <span className={`status-pill ${situation.pill}`}>
                    {situation.label}
                  </span>
                </strong>
              ) : (
                <strong
                  className={`finance-amount ${item.amountInCents < 0 ? "cash-out" : "cash-in"}`}
                >
                  {signedCurrency(item.amountInCents)}
                </strong>
              )}
              <span>
                {item.status !== "cancelled" && (
                  <span className={`status-pill ${situation.pill}`}>
                    {situation.label}
                  </span>
                )}
              </span>
              <div className="finance-actions">
                {item.status === "open" && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onContact(item, situation.key === "overdue")}
                  >
                    Entrar em contato
                  </button>
                )}
                {canManage &&
                  item.status === "open" &&
                  can("finance.adjust") && (
                    <button
                      className="secondary-button button-sm"
                      onClick={() => onAdjust(item)}
                    >
                      Ajustar
                    </button>
                  )}
                {item.status === "paid" && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onReceipt(item.id)}
                  >
                    Recibo
                  </button>
                )}
                {item.status === "paid" && (
                  <button
                    className="secondary-button button-sm"
                    aria-label={`Comprovantes de ${item.description}`}
                    onClick={() => onProofs(item)}
                  >
                    Comprovantes
                  </button>
                )}
                {canManage &&
                  item.status === "open" &&
                  can("finance.receive") && (
                    <button
                      className="primary-button button-sm"
                      onClick={() => onSettle(item)}
                    >
                      Dar baixa
                    </button>
                  )}
                {canManage &&
                  item.status === "paid" &&
                  can("finance.receivables_reverse") && (
                    <button
                      className="danger-button button-sm"
                      onClick={() => onReverse(item.id)}
                    >
                      Estornar
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
