import { CommissionReconciliationModal } from "./CommissionReconciliationModal";
import {
  matchesFinancialEntry,
  settlementBreakdown,
  type SettlementAdjustments,
  type FinancialEntryFilter,
} from "@crm/contracts";
import { FinanceEntryFilters } from "./FinanceEntryFilters";
import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import { ExternalOperationsPanel } from "./ExternalOperationsPanel";
import { FinanceClassificationPanel } from "./FinanceClassificationPanel";
import type {
  CommissionEntry,
  FinancialWorkspace,
  PaymentTiming,
  PaymentMethod,
  PaymentReceipt,
  Professional,
  Receivable,
} from "@crm/contracts";
import { Building2, Plus, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { currency, localIsoDate } from "../../shared/lib/formatting";
import {
  type CommissionRuleDraft,
  CommissionRuleModal,
} from "./CommissionRuleModal";
import { CommissionsList } from "./CommissionsList";
import { DailyCashSection } from "./DailyCashSection";
import { FinanceForecastSection } from "./FinanceForecastSection";
import { FinanceRegistryModal } from "./FinanceRegistryModal";
import { PayableModal } from "./PayableModal";
import { PayablesList } from "./PayablesList";
import { ReceiptModal } from "./ReceiptModal";
import { ReceivableAdjustModal } from "./ReceivableAdjustModal";
import { ReceivablesList } from "./ReceivablesList";
import { RecurringPayablesSection } from "./RecurringPayablesSection";
import { RenegotiateModal } from "./RenegotiateModal";
import { SettleModal } from "./SettleModal";
import { useToast } from "../../shared/feedback/toast-context";
import type { ReceivableFilter, SettleTarget } from "./types";

export function FinancePage() {
  const { can, canEdit } = useAuthorization();
  const contextPatientId = usePatientContext();
  const [entryFilters, setEntryFilters] = useState<FinancialEntryFilter>({
    dateField: "dueDate",
  });
  const [expenseFilters, setExpenseFilters] = useState<FinancialEntryFilter>({
    dateField: "dueDate",
  });
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  useEffect(() => {
    let active = true;
    api
      .clinicBranding()
      .then((branding) => {
        if (active && branding.timezone) setTimezone(branding.timezone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [data, setData] = useState<FinancialWorkspace | null>(null);
  const [tab, setTab] = useState<
    "receivables" | "payables" | "commissions" | "dailyCash" | "forecast"
  >("receivables");
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedReceivables, setSelectedReceivables] = useState<string[]>([]);
  const [receivableFilter, setReceivableFilter] =
    useState<ReceivableFilter>("all");
  const [receivableSearch, setReceivableSearch] = useState("");
  const [settling, setSettling] = useState<SettleTarget | null>(null);
  const [payableModal, setPayableModal] = useState(false);
  const [adjusting, setAdjusting] = useState<Receivable | null>(null);
  const [registry, setRegistry] = useState<"category" | "costCenter" | null>(
    null,
  );
  const [renegotiating, setRenegotiating] = useState(false);
  const [reconcilingCommission, setReconcilingCommission] = useState<
    string | null
  >(null);
  const [commissionRuleOpen, setCommissionRuleOpen] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");
  const canManage = canEdit("finance");
  async function reload() {
    setData(await api.financialWorkspace());
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.financialWorkspace(), api.professionals()])
      .then(([workspace, professionalData]) => {
        if (active) {
          setData(workspace);
          setProfessionals(professionalData);
        }
      })
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, []);
  const toast = useToast();
  async function reverseReceivable(id: string) {
    setError("");
    try {
      await api.reverseReceivable(id);
      toast.success("Pagamento estornado.");
      // A parcela mudou de situação: a seleção antiga não vale mais para renegociar.
      setSelectedReceivables([]);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function reversePayable(id: string) {
    setError("");
    try {
      await api.reversePayable(id);
      toast.success("Pagamento da conta estornado.");
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function settle(
    target: SettleTarget,
    method: PaymentMethod,
    timing?: PaymentTiming,
    adjustments?: SettlementAdjustments,
  ) {
    if (target.kind === "receivable")
      await api.settleReceivable(target.id, method, timing, adjustments);
    else await api.settlePayable(target.id, method, timing);
    const balance =
      target.kind === "receivable" && adjustments
        ? settlementBreakdown(target.amountInCents, adjustments).balanceInCents
        : 0;
    toast.success(
      target.kind !== "receivable"
        ? "Conta paga."
        : balance > 0
          ? `Pagamento parcial recebido. O saldo de ${currency.format(balance / 100)} virou uma nova parcela.`
          : "Pagamento recebido.",
    );
    // A baixa foi feita: fecha o modal e, se o recarregamento falhar, avisa na página.
    setSettling(null);
    if (target.kind === "receivable") setSelectedReceivables([]);
    setError("");
    try {
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function changeReceivableFilter(filter: ReceivableFilter) {
    setReceivableFilter(filter);
    setSelectedReceivables([]);
  }
  function changeReceivableSearch(value: string) {
    setReceivableSearch(value);
    setSelectedReceivables([]);
  }
  // Ações em modal: o erro da API fica no modal; feito o pedido, o modal fecha e, se o
  // recarregamento falhar, o aviso vai para a página (como na baixa).
  async function reloadAfterAction() {
    setError("");
    try {
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function adjustReceivable(
    id: string,
    amountInCents: number,
    reason: string,
  ) {
    await api.adjustReceivable(id, amountInCents, reason);
    toast.success("Valor da parcela ajustado.");
    setAdjusting(null);
    setSelectedReceivables([]);
    await reloadAfterAction();
  }
  async function createRegistry(kind: "category" | "costCenter", name: string) {
    if (kind === "category")
      await api.createFinancialCategory({ name, kind: "expense" });
    else await api.createCostCenter({ name });
    toast.success(
      kind === "category"
        ? "Categoria cadastrada."
        : "Centro de custo cadastrado.",
    );
    setRegistry(null);
    await reloadAfterAction();
  }
  async function renegotiate(input: {
    totalAmountInCents: number;
    installments: number;
    firstDueDate: string;
    reason: string;
  }) {
    await api.renegotiateReceivables({
      receivableIds: selectedReceivables,
      ...input,
    });
    toast.success("Parcelas renegociadas.");
    setRenegotiating(false);
    setSelectedReceivables([]);
    await reloadAfterAction();
  }
  async function toggleCommission(item: CommissionEntry) {
    setError("");
    try {
      if (item.status === "paid") await api.reverseCommission(item.id);
      else await api.settleCommission(item.id);
      toast.success(
        item.status === "paid"
          ? "Pagamento da comissão estornado."
          : "Comissão paga.",
      );
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function generateCommissions() {
    setError("");
    try {
      await api.generateCommissions(localIsoDate().slice(0, 7));
      toast.success("Comissões do mês geradas.");
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createCommissionRule(input: CommissionRuleDraft) {
    if ("userId" in input) await api.setUserCommission(input.userId, input);
    else await api.createCommissionRule(input);
    toast.success("Regra de comissão salva.");
    setCommissionRuleOpen(false);
    await reloadAfterAction();
  }
  return (
    <>
      <PatientContextNotice
        patientId={contextPatientId}
        patients={
          data?.summary.receivables.map((item) => ({
            id: item.patientId,
            fullName: item.patientName,
            tags: [],
          })) ?? []
        }
      />
      <PageHeader
        eyebrow="Saúde financeira"
        title="Financeiro"
        description="Controle entradas, despesas, pagamentos e fluxo de caixa."
        action={
          canManage && (
            <div className="page-actions">
              {can("finance.categories_create") && (
                <button
                  className="secondary-button"
                  onClick={() => setRegistry("category")}
                >
                  <Tags size={18} /> Nova categoria
                </button>
              )}
              {can("finance.cost_centers_create") && (
                <button
                  className="secondary-button"
                  onClick={() => setRegistry("costCenter")}
                >
                  <Building2 size={18} /> Novo centro de custo
                </button>
              )}
              {can("finance.payables_create") && (
                <button
                  className="primary-button"
                  onClick={() => setPayableModal(true)}
                >
                  <Plus size={18} /> Nova despesa
                </button>
              )}
            </div>
          )
        }
      />
      {!canManage && <ReadOnlyNotice module="finance" />}
      {error && <ErrorBanner error={error} />}
      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="metric-grid finance-metrics">
            <article className="metric-card accent">
              <span>Saldo do mês</span>
              <strong>
                {currency.format(data.cashBalanceThisMonthInCents / 100)}
              </strong>
              <small className="metric-note">
                Entradas e saídas disponíveis no caixa neste mês.
              </small>
            </article>
            <article className="metric-card">
              <span>Recebido no mês</span>
              <strong>
                {currency.format(data.summary.paidThisMonthInCents / 100)}
              </strong>
              <small className="metric-note">
                Parcelas de clientes com baixa neste mês, descontados os
                estornos.
              </small>
            </article>
            <article className="metric-card">
              <span>Despesas pagas</span>
              <strong>
                {currency.format(
                  (data.paidExpensesThisMonthInCents +
                    data.paidCommissionsThisMonthInCents) /
                    100,
                )}
              </strong>
              <small className="metric-note">
                Contas e comissões quitadas neste mês, descontados os estornos.
              </small>
            </article>
            <article className="metric-card">
              <span>Compromissos em aberto</span>
              <strong>{currency.format(data.payableOpenInCents / 100)}</strong>
              <small className="metric-note">
                Contas a pagar que ainda não foram quitadas.
              </small>
            </article>
          </section>
          <section className="finance-controls">
            <div className="activity-tabs finance-tabs">
              <button
                className={`tab-button ${tab === "receivables" ? "active" : ""}`}
                aria-label={`Contas a receber (${data.summary.receivables.length})`}
                onClick={() => setTab("receivables")}
              >
                Contas a receber
                <span className="tab-count">
                  {data.summary.receivables.length}
                </span>
              </button>
              <button
                className={`tab-button ${tab === "payables" ? "active" : ""}`}
                aria-label={`Contas a pagar (${data.payables.length})`}
                onClick={() => setTab("payables")}
              >
                Contas a pagar
                <span className="tab-count">{data.payables.length}</span>
              </button>
              <button
                className={`tab-button ${tab === "commissions" ? "active" : ""}`}
                aria-label={`Comissões (${data.commissions.length})`}
                onClick={() => setTab("commissions")}
              >
                Comissões
                <span className="tab-count">{data.commissions.length}</span>
              </button>
              <button
                className={`tab-button ${tab === "dailyCash" ? "active" : ""}`}
                onClick={() => setTab("dailyCash")}
              >
                Caixa do dia
              </button>
              <button
                className={`tab-button ${tab === "forecast" ? "active" : ""}`}
                onClick={() => setTab("forecast")}
              >
                Previsão
              </button>
            </div>
          </section>
          {tab === "dailyCash" ? (
            <DailyCashSection />
          ) : tab === "forecast" ? (
            <FinanceForecastSection />
          ) : tab === "receivables" ? (
            <section className="panel finance-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Entradas</span>
                  <h2>Parcelas</h2>
                </div>
              </div>
              <FinanceEntryFilters
                workspace={data}
                value={entryFilters}
                onChange={(filter) => {
                  setEntryFilters(filter);
                  setSelectedReceivables([]);
                }}
              />
              <ReceivablesList
                receivables={data.summary.receivables.filter(
                  (item) =>
                    (!contextPatientId ||
                      item.patientId === contextPatientId) &&
                    matchesFinancialEntry(item, entryFilters, timezone),
                )}
                canManage={canManage}
                filter={receivableFilter}
                search={receivableSearch}
                selected={selectedReceivables}
                onFilterChange={changeReceivableFilter}
                onSearchChange={changeReceivableSearch}
                onSelectedChange={setSelectedReceivables}
                onRenegotiate={() => setRenegotiating(true)}
                onSettle={(item) =>
                  setSettling({
                    kind: "receivable",
                    id: item.id,
                    title: item.patientName,
                    description: item.description,
                    amountInCents: item.amountInCents,
                    dueDate: item.dueDate,
                  })
                }
                onReverse={(id) => void reverseReceivable(id)}
                onAdjust={(item) => setAdjusting(item)}
                onReceipt={(id) =>
                  void api
                    .paymentReceipt(id)
                    .then(setReceipt)
                    .catch((cause: Error) => setError(cause.message))
                }
              />
            </section>
          ) : tab === "payables" ? (
            <section className="panel finance-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Saídas</span>
                  <h2>Contas a pagar</h2>
                  <p className="panel-help">
                    Despesas da clínica pelo vencimento, em aberto e já pagas.
                    As despesas fixas logo abaixo geram uma conta por mês
                    automaticamente.
                  </p>
                </div>
              </div>
              <FinanceEntryFilters
                workspace={data}
                value={expenseFilters}
                onChange={setExpenseFilters}
                payables
              />
              <PayablesList
                payables={data.payables.filter((item) =>
                  matchesFinancialEntry(item, expenseFilters, timezone),
                )}
                canManage={canManage}
                onCreate={() => setPayableModal(true)}
                onReverse={(id) => void reversePayable(id)}
                onSettle={(item) =>
                  setSettling({
                    kind: "payable",
                    id: item.id,
                    title: item.description,
                    description: item.supplier || item.categoryName,
                    amountInCents: item.amountInCents,
                  })
                }
              />
            </section>
          ) : (
            <section className="panel finance-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">Profissionais</span>
                  <h2>Comissões</h2>
                  <p className="panel-help">
                    Quanto cada profissional tem a receber pelos atendimentos
                    concluídos: o percentual da regra sobre a base de cálculo de
                    cada atendimento.
                  </p>
                  <p className="panel-help">
                    Para quem tem usuário ligado, vale a comissão definida no
                    usuário (Configurações › Usuários); a regra daqui só conta
                    enquanto o usuário não tiver uma.
                  </p>
                </div>
                {canManage && (
                  <div className="page-actions">
                    {can("finance.commission_rules") && (
                      <button
                        className="secondary-button"
                        onClick={() => setCommissionRuleOpen(true)}
                      >
                        <Plus size={18} /> Nova regra
                      </button>
                    )}
                    {can("finance.commissions_generate") && (
                      <button
                        className="primary-button"
                        onClick={() => void generateCommissions()}
                      >
                        Gerar comissões do mês
                      </button>
                    )}
                  </div>
                )}
              </div>
              <CommissionsList
                payables={data.payables}
                adjustments={data.commissionAdjustments ?? []}
                onReconcile={setReconcilingCommission}
                commissions={data.commissions}
                canManage={canManage}
                onToggle={(item) => void toggleCommission(item)}
              />
            </section>
          )}
          {tab === "payables" && (
            <RecurringPayablesSection
              editable={canManage}
              workspace={data}
              onGenerated={reload}
            />
          )}
        </>
      )}
      {data && (
        <>
          <FinanceClassificationPanel workspace={data} onChanged={reload} />
          <ExternalOperationsPanel workspace={data} />
        </>
      )}
      {reconcilingCommission && (
        <CommissionReconciliationModal
          id={reconcilingCommission}
          onClose={() => setReconcilingCommission(null)}
          onChanged={reload}
        />
      )}
      {payableModal && data && (
        <PayableModal
          workspace={data}
          onClose={() => setPayableModal(false)}
          onCreated={() => {
            setPayableModal(false);
            void reload();
          }}
        />
      )}
      {receipt && (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      )}
      {adjusting && (
        <ReceivableAdjustModal
          receivable={adjusting}
          onClose={() => setAdjusting(null)}
          onConfirm={(amountInCents, reason) =>
            adjustReceivable(adjusting.id, amountInCents, reason)
          }
        />
      )}
      {registry && (
        <FinanceRegistryModal
          kind={registry}
          onClose={() => setRegistry(null)}
          onConfirm={(name) => createRegistry(registry, name)}
        />
      )}
      {renegotiating && data && (
        <RenegotiateModal
          receivables={data.summary.receivables.filter((item) =>
            selectedReceivables.includes(item.id),
          )}
          onClose={() => setRenegotiating(false)}
          onConfirm={renegotiate}
        />
      )}
      {commissionRuleOpen && (
        <CommissionRuleModal
          professionals={professionals}
          onClose={() => setCommissionRuleOpen(false)}
          onConfirm={createCommissionRule}
        />
      )}
      {settling && (
        <SettleModal
          target={settling}
          onClose={() => setSettling(null)}
          onConfirm={(method, timing, adjustments) =>
            settle(settling, method, timing, adjustments)
          }
        />
      )}
    </>
  );
}
