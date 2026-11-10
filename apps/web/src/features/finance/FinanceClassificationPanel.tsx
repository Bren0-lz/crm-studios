import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { FinancialDatesModal } from "./FinancialDatesModal";
import type {
  DreGroup,
  FinancialWorkspace,
  ManualReceivableInput,
  FinancialClassification,
  PatientOption,
  Receivable,
  Payable,
} from "@crm/contracts";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { PatientPicker } from "../../PatientPicker";
import { EmptyState } from "../../shared/components/EmptyState";
import { currency, localIsoDate, shortDate } from "../../shared/lib/formatting";

import { dreGroupLabels } from "./dre-labels";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp, formatCompetence, normalizeSearch } from "./model";

type EntryFilter = "all" | "receivable" | "payable" | "unclassified";
const entryFilterLabels: Record<EntryFilter, string> = {
  all: "Todos",
  receivable: "Receitas",
  payable: "Despesas",
  unclassified: "Sem classificação",
};

export function FinanceClassificationPanel({
  workspace,
  onChanged,
}: {
  workspace: FinancialWorkspace;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const patientId = usePatientContext();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<EntryFilter>("all"),
    [search, setSearch] = useState("");
  const [dates, setDates] = useState<{
    kind: "receivable" | "payable";
    item: Receivable | Payable;
  } | null>(null);
  const [creating, setCreating] = useState(false),
    [patients, setPatients] = useState<PatientOption[]>([]),
    [selected, setSelected] = useState<{
      kind: "receivable" | "payable";
      item: Receivable | Payable;
    } | null>(null);
  const [input, setInput] = useState<ManualReceivableInput>({
      patientId: patientId,
      description: "",
      amountInCents: 0,
      dueDate: localIsoDate(),
      competence: localIsoDate().slice(0, 7),
    }),
    [classification, setClassification] = useState<FinancialClassification>({
      competence: localIsoDate().slice(0, 7),
    });
  const dirty = useFormDirty(
    creating ? input : classification,
    creating || Boolean(selected),
  );
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
      setSelected(null);
      setCreating(false);
      setNotice(message);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setError("");
    try {
      setPatients(await api.patientOptions());
      setInput({
        patientId,
        description: "",
        amountInCents: 0,
        dueDate: localIsoDate(),
        competence: localIsoDate().slice(0, 7),
      });
      setCreating(true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function select(kind: "receivable" | "payable", item: Receivable | Payable) {
    setClassification({
      competence:
        ("dreCompetence" in item ? item.dreCompetence : undefined) ??
        item.competence ??
        item.createdAt.slice(0, 7),
      categoryId: item.categoryId ?? null,
      costCenterId: item.costCenterId ?? null,
    });
    setSelected({ kind, item });
  }
  const kind = creating ? "receivable" : selected?.kind;
  const canList = can("finance.classify") || can("finance.dates_manage");
  const categoryNames = new Map(
    workspace.categories.map((item) => [item.id, item.name]),
  );
  const costCenterNames = new Map(
    workspace.costCenters.map((item) => [item.id, item.name]),
  );
  const entries = [
    ...workspace.summary.receivables
      .filter((item) => !patientId || item.patientId === patientId)
      .map((item) => ({ kind: "receivable" as const, item })),
    ...workspace.payables
      .filter(() => !patientId)
      .map((item) => ({ kind: "payable" as const, item })),
  ]
    .map((entry) => ({
      ...entry,
      who:
        entry.kind === "receivable"
          ? (entry.item as Receivable).patientName
          : ((entry.item as Payable).supplier ?? ""),
      category: entry.item.categoryId
        ? categoryNames.get(entry.item.categoryId)
        : undefined,
      costCenter: entry.item.costCenterId
        ? costCenterNames.get(entry.item.costCenterId)
        : undefined,
      competence:
        ("dreCompetence" in entry.item
          ? entry.item.dreCompetence
          : undefined) ??
        entry.item.competence ??
        entry.item.createdAt.slice(0, 7),
    }))
    .sort((a, b) => b.item.dueDate.localeCompare(a.item.dueDate));
  const term = normalizeSearch(search);
  const searched = entries.filter(
    (entry) =>
      !term ||
      normalizeSearch(`${entry.item.description} ${entry.who}`).includes(term),
  );
  const matches = (entry: (typeof entries)[number], key: EntryFilter) =>
    key === "all" ||
    (key === "unclassified"
      ? !entry.category || !entry.costCenter
      : entry.kind === key);
  const visible = searched.filter((entry) => matches(entry, filter));
  return (
    <>
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <h2>Lançamentos e competência</h2>
            <p className="panel-context">
              Escolha em que mês cada receita e despesa entra no resultado e a
              que categoria e centro de custo ela pertence.
            </p>
          </div>
          {can("finance.receivables_create") && (
            <div className="page-actions">
              <button className="primary-button" onClick={() => void create()}>
                <Plus size={18} /> Nova conta a receber
              </button>
            </div>
          )}
        </div>
        {(error || notice) && !creating && !selected && (
          <div className="entries-feedback">
            {error && <ErrorBanner error={error} />}
            {notice && (
              <p className="success-banner" role="status">
                {notice}
              </p>
            )}
          </div>
        )}
        {canList &&
          (entries.length === 0 ? (
            <EmptyState
              title="Nenhum lançamento"
              copy="As receitas e despesas da clínica aparecem aqui para classificar."
            />
          ) : (
            <>
              <div className="list-toolbar finance-filters">
                <div
                  className="tag-filter-list"
                  role="group"
                  aria-label="Filtrar lançamentos"
                >
                  {(Object.keys(entryFilterLabels) as EntryFilter[])
                    .filter((key) => !patientId || key !== "payable")
                    .map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="tag-filter"
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                      >
                        {entryFilterLabels[key]}{" "}
                        <small>
                          {
                            searched.filter((entry) => matches(entry, key))
                              .length
                          }
                        </small>
                      </button>
                    ))}
                </div>
                <div className="search-box">
                  <Search size={18} />
                  <input
                    type="search"
                    aria-label="Buscar lançamento"
                    placeholder="Buscar lançamento"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
              {visible.length === 0 ? (
                <div className="finance-filter-empty">
                  <EmptyState
                    title="Nenhum lançamento encontrado"
                    copy="Limpe a busca ou escolha outro filtro."
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setFilter("all");
                      setSearch("");
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <div className="finance-table finance-list entries-table">
                  <div className="finance-row finance-head" aria-hidden="true">
                    <span>Lançamento</span>
                    <span>Classificação</span>
                    <span>Competência</span>
                    <span className="finance-amount">Valor</span>
                    <span className="finance-actions">Ações</span>
                  </div>
                  {visible.map((entry) => (
                    <div
                      className="finance-row"
                      key={`${entry.kind}:${entry.item.id}`}
                    >
                      <div className="finance-item">
                        <strong title={entry.item.description}>
                          {entry.item.description}
                        </strong>
                        <span>
                          {entry.kind === "receivable" ? "Receita" : "Despesa"}
                          {entry.who && ` · ${entry.who}`}
                          {" · vence "}
                          {shortDate.format(
                            new Date(`${entry.item.dueDate}T12:00:00`),
                          )}
                        </span>
                      </div>
                      <div className="entry-classification">
                        {!entry.category && !entry.costCenter ? (
                          <span className="status-pill paused">
                            Não classificado
                          </span>
                        ) : (
                          <>
                            <span>{entry.category ?? "Sem categoria"}</span>
                            <small>
                              {entry.costCenter ?? "Sem centro de custo"}
                            </small>
                          </>
                        )}
                      </div>
                      <span className="finance-due">
                        <span className="finance-label">Competência </span>
                        {formatCompetence(entry.competence)}
                      </span>
                      <strong
                        className={`finance-amount ${entry.kind === "payable" ? "cash-out" : "cash-in"}`}
                      >
                        {currency.format(entry.item.amountInCents / 100)}
                      </strong>
                      <div className="finance-actions">
                        {can("finance.dates_manage") && (
                          <button
                            className="secondary-button button-sm"
                            onClick={() => setDates(entry)}
                          >
                            Datas financeiras
                          </button>
                        )}
                        {can("finance.classify") && (
                          <button
                            className="secondary-button button-sm"
                            onClick={() => select(entry.kind, entry.item)}
                          >
                            Classificar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ))}
        {dates && (
          <FinancialDatesModal
            kind={dates.kind}
            entry={dates.item}
            onClose={() => setDates(null)}
            onSaved={onChanged}
          />
        )}
        {(creating || selected) && (
          <Modal
            title={creating ? "Nova conta a receber" : "Classificar lançamento"}
            subtitle={
              selected?.item.description ??
              "Registre uma receita manual e sua competência."
            }
            busy={busy}
            dirty={dirty}
            onClose={() => {
              setCreating(false);
              setSelected(null);
            }}
          >
            <form
              className="clinical-form"
              onSubmit={(event) => {
                event.preventDefault();
                void act(
                  () =>
                    creating
                      ? api.createManualReceivable(input)
                      : api.classifyFinancialEntry(
                          selected!.kind,
                          selected!.item.id,
                          classification,
                        ),
                  "Lançamento salvo.",
                );
              }}
            >
              {error && <ErrorBanner error={error} />}
              <fieldset className="form-fields form-grid" disabled={busy}>
                {creating && (
                  <>
                    <div className="span-2">
                      <PatientPicker
                        required
                        popover
                        disabled={Boolean(patientId)}
                        patients={patients}
                        value={input.patientId}
                        onChange={(value) =>
                          setInput({ ...input, patientId: value })
                        }
                      />
                    </div>
                    <label>
                      Descrição
                      <input
                        required
                        minLength={3}
                        maxLength={200}
                        value={input.description}
                        onChange={(event) =>
                          setInput({
                            ...input,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <CurrencyField
                      required
                      label="Valor"
                      value={input.amountInCents}
                      onChange={(value) =>
                        setInput({ ...input, amountInCents: value })
                      }
                    />
                    <label>
                      Vencimento
                      <input
                        type="date"
                        required
                        value={input.dueDate}
                        onChange={(event) =>
                          setInput({
                            ...input,
                            dueDate: event.target.value,
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label>
                  <span className="label-with-help">
                    Competência
                    <HelpTip
                      term="Competência"
                      text={financeTermHelp.competence}
                    />
                  </span>
                  <input
                    type="month"
                    required
                    value={
                      creating ? input.competence : classification.competence
                    }
                    onChange={(event) =>
                      creating
                        ? setInput({
                            ...input,
                            competence: event.target.value,
                          })
                        : setClassification({
                            ...classification,
                            competence: event.target.value,
                          })
                    }
                  />
                </label>
                <label>
                  Categoria
                  <select
                    required={kind === "payable"}
                    value={
                      (creating
                        ? input.categoryId
                        : classification.categoryId) ?? ""
                    }
                    onChange={(event) =>
                      creating
                        ? setInput({
                            ...input,
                            categoryId: event.target.value || undefined,
                          })
                        : setClassification({
                            ...classification,
                            categoryId: event.target.value || null,
                          })
                    }
                  >
                    <option value="">Não classificado</option>
                    {workspace.categories
                      .filter(
                        (item) =>
                          item.kind ===
                          (kind === "payable" ? "expense" : "income"),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span className="label-with-help">
                    Centro de custo
                    <HelpTip
                      term="Centro de custo"
                      text={financeTermHelp.costCenter}
                    />
                  </span>
                  <select
                    required={kind === "payable"}
                    value={
                      (creating
                        ? input.costCenterId
                        : classification.costCenterId) ?? ""
                    }
                    onChange={(event) =>
                      creating
                        ? setInput({
                            ...input,
                            costCenterId: event.target.value || undefined,
                          })
                        : setClassification({
                            ...classification,
                            costCenterId: event.target.value || null,
                          })
                    }
                  >
                    <option value="">Não informado</option>
                    {workspace.costCenters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <div className="modal-actions">
                <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
                <button className="primary-button" disabled={busy}>
                  Salvar lançamento
                </button>
              </div>
            </form>
          </Modal>
        )}
      </section>
      {can("finance.classify") && workspace.categories.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Grupos da DRE</h2>
              <p className="panel-context">
                Em que linha do resultado cada categoria entra. O vencimento e
                os pagamentos continuam no caixa e nas contas.
              </p>
            </div>
          </div>
          <div className="dre-category-grid">
            {workspace.categories.map((item) => (
              <label className="dre-category" key={item.id}>
                <span>
                  {item.name}
                  <small>
                    {item.kind === "income" ? "Receita" : "Despesa"}
                  </small>
                </span>
                <select
                  disabled={busy}
                  value={item.dreGroup ?? "unclassified"}
                  onChange={(event) =>
                    void act(
                      () =>
                        api.setCategoryDreGroup(
                          item.id,
                          event.target.value as DreGroup,
                        ),
                      "Classificação da categoria atualizada.",
                    )
                  }
                >
                  {Object.entries(dreGroupLabels)
                    .filter(
                      ([key]) =>
                        key === "unclassified" ||
                        key === "financial_result" ||
                        (item.kind === "income"
                          ? key.endsWith("revenue")
                          : !key.endsWith("revenue")),
                    )
                    .map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
