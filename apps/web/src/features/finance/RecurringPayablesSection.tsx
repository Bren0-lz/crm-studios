import {
  saoPauloToday,
  type FinancialWorkspace,
  type RecurringPayable,
  type RecurringPayableInput,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import {
  formatCompetence,
  recurringPayableInput,
  recurringPayableStatus,
  signedCurrency,
} from "./model";
import { RecurringPayableEndModal } from "./RecurringPayableEndModal";
import { RecurringPayableModal } from "./RecurringPayableModal";

export function RecurringPayablesSection({
  workspace,
  onGenerated,
  editable,
}: {
  workspace: FinancialWorkspace;
  onGenerated: () => Promise<void>;
  /** Sem edição do Financeiro: lista só para consulta. */
  editable: boolean;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [items, setItems] = useState<RecurringPayable[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [modal, setModal] = useState(false);
  const [ending, setEnding] = useState<RecurringPayable | null>(null);
  const currentMonth = saoPauloToday().slice(0, 7);
  useEffect(() => {
    let active = true;
    api
      .recurringPayables()
      .then((data) => active && setItems(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    // O workspace gera as contas do mês; a lista vem depois, já com a última competência.
    await onGenerated();
    setItems(await api.recurringPayables());
  }
  async function update(
    item: RecurringPayable,
    changes: Partial<RecurringPayableInput>,
  ) {
    setError("");
    setBusyId(item.id);
    try {
      await api.updateRecurringPayable(
        item.id,
        recurringPayableInput(item, changes),
      );
      toast.success("Despesa fixa atualizada.");
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="recurring-payables">
      {error && <ErrorBanner error={error} />}
      <section className="panel finance-panel">
        <div className="panel-head">
          <div>
            <h2>Despesas fixas</h2>
            <p className="panel-help">
              Contas que se repetem todo mês, como aluguel e internet. Cada mês
              vira uma conta a pagar no dia do vencimento.
            </p>
          </div>
          {editable && can("finance.recurring_create") && (
            <button className="primary-button" onClick={() => setModal(true)}>
              <Plus size={18} /> Nova despesa fixa
            </button>
          )}
        </div>
        {!items ? (
          !error && <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma despesa fixa"
            copy="Cadastre aluguel, internet e outras contas mensais para gerá-las automaticamente."
          />
        ) : (
          <div className="finance-table finance-list recurring-table">
            <div className="finance-row finance-head" aria-hidden="true">
              <span>Descrição e período</span>
              <span>Vencimento</span>
              <span className="finance-amount">Valor mensal</span>
              <span>Situação</span>
              <span className="finance-actions">Ações</span>
            </div>
            {items.map((item) => {
              const status = recurringPayableStatus(item, currentMonth);
              const period = [
                `Desde ${formatCompetence(item.startMonth)}`,
                item.endMonth && `até ${formatCompetence(item.endMonth)}`,
                item.resumedFromMonth &&
                  `Reativada em ${formatCompetence(item.resumedFromMonth)}`,
                item.lastCompetence
                  ? `Última gerada: ${formatCompetence(item.lastCompetence)}`
                  : "Nenhuma conta gerada",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div className="finance-row" key={item.id}>
                  <div className="finance-item">
                    <strong title={item.description}>{item.description}</strong>
                    <span>
                      {item.supplier || item.categoryName} ·{" "}
                      {item.costCenterName}
                    </span>
                    <span title={period}>{period}</span>
                  </div>
                  <span className="finance-due">
                    <span className="finance-label">Vencimento </span>
                    <span>Dia {item.dayOfMonth}</span>
                  </span>
                  <strong className="finance-amount cash-out">
                    {signedCurrency(-item.amountInCents)}
                  </strong>
                  <span>
                    <span className={`status-pill ${status}`}>
                      {status === "ended"
                        ? "Encerrada"
                        : status === "paused"
                          ? "Pausada"
                          : "Ativa"}
                    </span>
                  </span>
                  <div className="finance-actions">
                    {editable && status !== "ended" && (
                      <>
                        {can("finance.recurring_update") && (
                          <button
                            className="secondary-button button-sm"
                            aria-label={`${item.active ? "Pausar" : "Reativar"} ${item.description}`}
                            disabled={busyId === item.id}
                            onClick={() =>
                              void update(item, { active: !item.active })
                            }
                          >
                            {item.active ? "Pausar" : "Reativar"}
                          </button>
                        )}
                        {can("finance.recurring_update") && (
                          <button
                            className="danger-button button-sm"
                            aria-label={`Encerrar ${item.description}`}
                            disabled={busyId === item.id}
                            onClick={() => setEnding(item)}
                          >
                            Encerrar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {modal && (
        <RecurringPayableModal
          workspace={workspace}
          currentMonth={currentMonth}
          onClose={() => setModal(false)}
          onCreated={() => {
            toast.success("Despesa fixa criada.");
            setModal(false);
            void refresh().catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
      {ending && (
        <RecurringPayableEndModal
          item={ending}
          currentMonth={currentMonth}
          onClose={() => setEnding(null)}
          onEnded={() => {
            toast.success("Despesa fixa encerrada.");
            setEnding(null);
            void refresh().catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
    </div>
  );
}
