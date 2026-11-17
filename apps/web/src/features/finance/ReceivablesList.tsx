import { type Receivable, saoPauloToday } from "@crm/contracts";
import { MoreHorizontal, Search } from "lucide-react";
import { useAuthorization } from "../../authorization-context";
import { ActionMenu } from "../../shared/components/ActionMenu";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, shortDate } from "../../shared/lib/formatting";
import type { ActionMenuItem } from "../../shared/lib/types";
import {
  hasUnsignedReceipt,
  normalizeSearch,
  receiptMomentLabel,
  receiptSignatureLabels,
  receiptSignatureSteps,
  receivableFilterLabels,
  receivableInstallmentLine,
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
  unsignedOnly,
  onFilterChange,
  onUnsignedOnlyChange,
  onSearchChange,
  onSelectedChange,
  onRenegotiate,
  onSettle,
  onReverse,
  onAdjust,
  onReceipt,
  onProofs,
  onContact,
  proofIds,
}: {
  receivables: Receivable[];
  canManage: boolean;
  filter: ReceivableFilter;
  search: string;
  selected: string[];
  /** Recorte "Recibo não assinado" (RC4), somado ao filtro por situação. */
  unsignedOnly: boolean;
  onFilterChange: (filter: ReceivableFilter) => void;
  onUnsignedOnlyChange: (value: boolean) => void;
  onSearchChange: (value: string) => void;
  onSelectedChange: (ids: string[]) => void;
  onRenegotiate: () => void;
  onSettle: (item: Receivable) => void;
  onReverse: (id: string) => void;
  onAdjust: (item: Receivable) => void;
  onReceipt: (id: string) => void;
  onProofs: (item: Receivable) => void;
  onContact: (item: Receivable, overdue: boolean) => void;
  /** Parcelas com comprovante: os da baixa estornada seguem acessíveis. */
  proofIds?: ReadonlySet<string>;
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
  const matchingSearch = rows.filter(
    (row) => !term || normalizeSearch(row.item.patientName).includes(term),
  );
  const unsignedCount = matchingSearch.filter((row) =>
    hasUnsignedReceipt(row.item),
  ).length;
  const searched = unsignedOnly
    ? matchingSearch.filter((row) => hasUnsignedReceipt(row.item))
    : matchingSearch;
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
        <button
          type="button"
          className="tag-filter"
          aria-pressed={unsignedOnly}
          onClick={() => onUnsignedOnlyChange(!unsignedOnly)}
        >
          Recibo não assinado <small>{unsignedCount}</small>
        </button>
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
              onUnsignedOnlyChange(false);
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
            <span className="finance-col-center">Vencimento</span>
            <span className="finance-amount finance-col-center">Valor</span>
            <span className="finance-col-center">Situação</span>
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
                {receivableInstallmentLine(item) && (
                  <span className="finance-installment">
                    {receivableInstallmentLine(item)}
                  </span>
                )}
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
              <span className="finance-situation">
                {item.status !== "cancelled" && (
                  <span className={`status-pill ${situation.pill}`}>
                    {situation.label}
                  </span>
                )}
                {item.status === "paid" && item.receiptSignature && (
                  <>
                    <span
                      className={`status-pill ${item.receiptSignature.status === "signed" ? "paid" : "open"}`}
                    >
                      {receiptSignatureLabels[item.receiptSignature.status]}
                    </span>
                    <ReceiptLatestStep summary={item.receiptSignature} />
                  </>
                )}
              </span>
              <div className="finance-actions">
                {/* Uma ação principal à vista (em aberto: "Dar baixa"; paga: "Recibo") e as
                    demais no "Mais" (D1), para a linha caber numa fileira só. */}
                <ReceivableMoreMenu
                  item={item}
                  items={[
                    ...(item.status === "open"
                      ? [
                          {
                            label: "Entrar em contato",
                            onSelect: () =>
                              onContact(item, situation.key === "overdue"),
                          },
                        ]
                      : []),
                    ...(canManage &&
                    item.status === "open" &&
                    can("finance.adjust")
                      ? [{ label: "Ajustar", onSelect: () => onAdjust(item) }]
                      : []),
                    ...(item.status === "paid" || proofIds?.has(item.id)
                      ? [
                          {
                            label: "Comprovantes",
                            onSelect: () => onProofs(item),
                          },
                        ]
                      : []),
                    ...(canManage &&
                    item.status === "paid" &&
                    can("finance.receivables_reverse")
                      ? [
                          {
                            label: "Estornar",
                            danger: true,
                            onSelect: () => onReverse(item.id),
                          },
                        ]
                      : []),
                  ]}
                />
                {item.status === "paid" && (
                  <button
                    className="secondary-button button-sm"
                    onClick={() => onReceipt(item.id)}
                  >
                    Recibo
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
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * "Mais" da linha (D1): as ações secundárias ("Entrar em contato", "Ajustar", "Comprovantes",
 * "Estornar") ficam no menu para a ação principal caber inteira, numa fileira só, sem a tabela
 * rolar para o lado. Lista presa à tela (`fixed`):
 * a tabela tem `overflow` e cortaria a lista.
 */
function ReceivableMoreMenu({
  item,
  items,
}: {
  item: Receivable;
  items: ActionMenuItem[];
}) {
  if (items.length === 0) return null;
  return (
    <ActionMenu
      label={`Mais ações de ${item.description}`}
      align="end"
      fixed
      items={items}
      trigger={{
        className: "secondary-button button-sm",
        content: (
          <>
            <MoreHorizontal size={16} /> Mais
          </>
        ),
      }}
    />
  );
}

/**
 * Só a etapa mais recente do recibo (ex.: "Assinado em 06 de nov. às 22:56"), para a linha
 * não crescer; as três datas ficam no título e no modal do recibo.
 */
function ReceiptLatestStep({
  summary,
}: {
  summary: Parameters<typeof receiptSignatureSteps>[0];
}) {
  const done = receiptSignatureSteps(summary).flatMap((step) =>
    step.at ? [`${step.label} ${receiptMomentLabel(step.at)}`] : [],
  );
  const latest = done.at(-1);
  if (!latest) return null;
  return (
    <small className="receipt-step" title={done.join("\n")}>
      {latest}
    </small>
  );
}
