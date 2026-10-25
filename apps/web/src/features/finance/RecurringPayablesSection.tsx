import {
  recurringPayableReminders,
  saoPauloToday,
  type FinancialWorkspace,
  type Payable,
  type RecurringPayable,
  type RecurringPayableInput,
} from "@crm/contracts";
import { BellRing, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { formatIsoDate } from "../../shared/lib/formatting";
import {
  dueInLabel,
  formatCompetence,
  recurringPayableInput,
  recurringPayableStatus,
  signedCurrency,
} from "./model";
import { RecurringPayableEndModal } from "./RecurringPayableEndModal";
import { RecurringPayableModal } from "./RecurringPayableModal";
import { PayableAmountModal } from "./PayableAmountModal";

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
  const [editing, setEditing] = useState<RecurringPayable | null>(null);
  const [ending, setEnding] = useState<RecurringPayable | null>(null);
  const [informing, setInforming] = useState<Payable | null>(null);
  const today = saoPauloToday();
  const currentMonth = today.slice(0, 7);
  const reminders = items
    ? recurringPayableReminders(items, workspace.payables, today)
    : [];
  // Conta em aberto mais recente que ainda espera o valor real do mês.
  const estimatedPayable = (item: RecurringPayable) =>
    workspace.payables
      .filter(
        (payable) =>
          payable.recurringPayableId === item.id &&
          payable.status === "open" &&
          payable.amountEstimated,
      )
      .sort((a, b) => (b.competence ?? "").localeCompare(a.competence ?? ""))
      .at(0);
  const canInform = editable && can("finance.recurring_update");
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
              Contas que se repetem todo mês. O valor pode ser fixo (aluguel,
              internet) ou variável (água, luz): na variável, a conta nasce com
              o valor estimado e você informa o valor real do mês.
            </p>
          </div>
          {editable && can("finance.recurring_create") && (
            <button className="primary-button" onClick={() => setModal(true)}>
              <Plus size={18} /> Nova despesa fixa
            </button>
          )}
        </div>
        {reminders.length > 0 && (
          <div
            className="recurring-reminders"
            aria-label="Avisos de vencimento"
          >
            <h3>
              <BellRing size={16} aria-hidden="true" /> Avisos de vencimento
            </h3>
            <ul>
              {reminders.map((reminder) => {
                const payable = workspace.payables.find(
                  (item) => item.id === reminder.payableId,
                );
                return (
                  <li
                    key={`${reminder.recurringPayableId}-${reminder.competence}`}
                  >
                    <span className="recurring-reminder-text">
                      <strong>{reminder.description}</strong>
                      <span>
                        {dueInLabel(reminder.daysUntilDue)} ·{" "}
                        {formatIsoDate(reminder.dueDate)} ·{" "}
                        {signedCurrency(-reminder.amountInCents)}
                        {reminder.amountEstimated && " (estimado)"}
                      </span>
                    </span>
                    {canInform && payable && reminder.variableAmount && (
                      <button
                        className="secondary-button button-sm"
                        aria-label={`Informar valor de ${reminder.description}`}
                        onClick={() => setInforming(payable)}
                      >
                        Informar valor
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
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
                item.variableAmount && "Valor variável (estimado)",
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
              const pending = item.variableAmount
                ? estimatedPayable(item)
                : undefined;
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
                    {item.reminderDaysBefore !== undefined && (
                      <span className="recurring-reminder-note">
                        {item.reminderDaysBefore === 0
                          ? "Aviso no dia"
                          : `Aviso ${item.reminderDaysBefore} ${item.reminderDaysBefore === 1 ? "dia" : "dias"} antes`}
                      </span>
                    )}
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
                    {canInform && pending && (
                      <button
                        className="primary-button button-sm"
                        aria-label={`Informar valor de ${item.description} (${formatCompetence(pending.competence!)})`}
                        onClick={() => setInforming(pending)}
                      >
                        Informar valor
                      </button>
                    )}
                    {editable && status !== "ended" && (
                      <>
                        {can("finance.recurring_update") && (
                          <button
                            className="secondary-button button-sm"
                            aria-label={`Editar ${item.description}`}
                            disabled={busyId === item.id}
                            onClick={() => setEditing(item)}
                          >
                            Editar
                          </button>
                        )}
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
      {editing && (
        <RecurringPayableModal
          workspace={workspace}
          currentMonth={currentMonth}
          item={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            toast.success("Despesa fixa atualizada.");
            setEditing(null);
            void refresh().catch((cause: Error) => setError(cause.message));
          }}
        />
      )}
      {informing && (
        <PayableAmountModal
          payable={informing}
          onClose={() => setInforming(null)}
          onSaved={() => {
            toast.success("Valor do mês informado.");
            setInforming(null);
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
