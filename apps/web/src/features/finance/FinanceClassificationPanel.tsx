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
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { PatientPicker } from "../../PatientPicker";
import { currency, localIsoDate } from "../../shared/lib/formatting";

import { dreGroupLabels } from "./dre-labels";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp } from "./model";
export function FinanceClassificationPanel({
  workspace,
  onChanged,
}: {
  workspace: FinancialWorkspace;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const patientId = usePatientContext();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
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
  return (
    <section className="panel">
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="panel-head">Lançamentos e competência</summary>
        {open && (
          <div className="inventory-body">
            {error && <ErrorBanner error={error} />}
            {notice && <p role="status">{notice}</p>}
            {can("finance.receivables_create") && (
              <button className="primary-button" onClick={() => void create()}>
                Nova conta a receber
              </button>
            )}
            {(can("finance.classify") || can("finance.dates_manage")) && (
              <>
                <h3>Classificação dos lançamentos</h3>
                {[
                  ...workspace.summary.receivables
                    .filter(
                      (item) => !patientId || item.patientId === patientId,
                    )
                    .map((item) => ({
                      kind: "receivable" as const,
                      item,
                    })),
                  ...workspace.payables
                    .filter(() => !patientId)
                    .map((item) => ({
                      kind: "payable" as const,
                      item,
                    })),
                ].map((entry) => (
                  <div
                    className="table-row"
                    key={`${entry.kind}:${entry.item.id}`}
                  >
                    <span>
                      {entry.kind === "receivable" ? "Receita" : "Despesa"}
                    </span>
                    <strong>{entry.item.description}</strong>
                    <span className="numeric-value">
                      {currency.format(entry.item.amountInCents / 100)}
                    </span>
                    {can("finance.dates_manage") && (
                      <button
                        className="secondary-button"
                        onClick={() => setDates(entry)}
                      >
                        Datas financeiras
                      </button>
                    )}
                    {can("finance.classify") && (
                      <button
                        className="secondary-button"
                        onClick={() => select(entry.kind, entry.item)}
                      >
                        Classificar
                      </button>
                    )}
                  </div>
                ))}
                {can("finance.classify") && (
                  <>
                    <h3>Grupos da DRE</h3>
                    <p className="muted-copy">
                      A competência define o mês do resultado. O vencimento e os
                      pagamentos continuam no caixa e nas contas.
                    </p>
                    {workspace.categories.map((item) => (
                      <label key={item.id}>
                        {item.name}
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
                  </>
                )}
              </>
            )}
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
                title={
                  creating ? "Nova conta a receber" : "Classificar lançamento"
                }
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
                        <label>
                          Cliente
                          <PatientPicker
                            required
                            disabled={Boolean(patientId)}
                            patients={patients}
                            value={input.patientId}
                            onChange={(value) =>
                              setInput({ ...input, patientId: value })
                            }
                          />
                        </label>
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
                          creating
                            ? input.competence
                            : classification.competence
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
                    <ModalCancelButton disabled={busy}>
                      Cancelar
                    </ModalCancelButton>
                    <button className="primary-button" disabled={busy}>
                      Salvar lançamento
                    </button>
                  </div>
                </form>
              </Modal>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
