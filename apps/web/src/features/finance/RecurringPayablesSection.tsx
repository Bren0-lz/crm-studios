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
import {
  formatCompetence,
  recurringPayableInput,
  recurringReminderLabel,
  recurringPayableStatus,
  signedCurrency,
} from "./model";
import { PayableAmountModal } from "./PayableAmountModal";
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
  const [editing, setEditing] = useState<RecurringPayable | null>(null);
  const [ending, setEnding] = useState<RecurringPayable | null>(null);
  const [informing, setInforming] = useState<Payable | null>(null);
  const today = saoPauloToday();
  const currentMonth = today.slice(0, 7);
  const reminders = items
    ? recurringPayableReminders(items, workspace.payables, today)
    : [];
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
              Contas que se repetem todo mês, de valor fixo (aluguel, internet)
              ou variável (água, luz). Cada mês vira uma conta a pagar no dia do
              vencimento; com aviso, o sino lembra alguns dias antes.
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
            role="region"
            aria-label="Avisos de vencimento"
          >
            <h3>
              <BellRing size={16} aria-hidden="true" /> Avisos de vencimento
            </h3>
            <ul>
              {reminders.map((reminder) => {
                const payable = reminder.payableId
                  ? workspace.payables.find(
                      (item) => item.id === reminder.payableId,
                    )
                  : undefined;
                return (
                  <li
                    key={`${reminder.recurringPayableId}-${reminder.competence}`}
                  >
                    <span className="recurring-reminder-text">
                      <strong>{reminder.description}</strong>
                      <span>
                        {recurringReminderLabel(reminder, today)} ·{" "}
                        {signedCurrency(-reminder.amountInCents)}
                        {reminder.amountPending && " (estimado)"}
                      </span>
                    </span>
                    {canInform && payable && reminder.amountPending && (
                      <button
                        className="secondary-button button-sm"
                        aria-label={`Informar valor de ${reminder.description} (${formatCompetence(reminder.competence)})`}
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
              const reminder = reminders.find(
                (entry) => entry.recurringPayableId === item.id,
              );
              // Conta variável mais antiga ainda sem o valor do mês.
              const pendingPayable = workspace.payables
                .filter(
                  (payable) =>
                    payable.recurringPayableId === item.id &&
                    payable.status === "open" &&
                    payable.amountPending,
                )
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
              const settings = [
                item.amountType === "variable"
                  ? "Valor variável (estimativa)"
                  : "Valor fixo",
                item.reminderDaysBefore === undefined
                  ? "Sem aviso"
                  : item.reminderDaysBefore === 0
                    ? "Aviso no dia do vencimento"
                    : `Aviso ${item.reminderDaysBefore} ${item.reminderDaysBefore === 1 ? "dia" : "dias"} antes`,
              ].join(" · ");
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
                    <span title={settings}>{settings}</span>
                    {reminder && (
                      <span className="recurring-reminder">
                        {recurringReminderLabel(reminder, today)}
                      </span>
                    )}
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
                    {canInform && pendingPayable && (
                        <button
                          className="primary-button button-sm"
                          aria-label={`Informar valor de ${item.description}`}
                          onClick={() => setInforming(pendingPayable)}
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
