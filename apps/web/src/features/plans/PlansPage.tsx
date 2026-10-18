import { usePatientContext } from "../../shared/hooks/usePatientContext";
import { PatientContextNotice } from "../../shared/components/PatientContextNotice";
import {
  type PatientOption,
  type PatientPlan,
  type PlanStatus,
  type Service,
  isTabCreditPlan,
  nextPlanPeriod,
  planDisplayStatus,
} from "@crm/contracts";
import { FileClock, Pause, Play, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  clinicIsoDate,
  currency,
  formatIsoDate,
  shortDate,
} from "../../shared/lib/formatting";
import {
  planBadgeLabel,
  planKindLabels,
  planListFilterLabels,
  planMatchesFilter,
  planMatchesSearch,
  planSubtitle,
  type PlanListFilter,
} from "./model";
import { PlanCancelModal } from "./PlanCancelModal";
import { PlanModal } from "./PlanModal";
import { useToast } from "../../shared/feedback/toast-context";
import { PlanPauseModal } from "./PlanPauseModal";
import { SessionMovementsModal } from "./SessionMovementsModal";

export function PlansPage({ canManage }: { canManage: boolean }) {
  const { can } = useAuthorization();
  const contextPatientId = usePatientContext();
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [movementPlan, setMovementPlan] = useState<PatientPlan | null>(null);
  const [renewingPlan, setRenewingPlan] = useState<PatientPlan | null>(null);
  const [pausingPlan, setPausingPlan] = useState<PatientPlan | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState<PatientPlan | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<PlanListFilter>("all");

  useEffect(() => {
    let active = true;
    Promise.all([api.plans(), api.patientOptions(), api.services()])
      .then(([planData, patientData, serviceData]) => {
        if (!active) return;
        setPlans(planData);
        setPatients(patientData);
        setServices(serviceData);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const toast = useToast();
  function replacePlan(plan: PatientPlan) {
    setPlans((items) => [plan, ...items.filter((item) => item.id !== plan.id)]);
  }

  async function changeStatus(plan: PatientPlan, status: PlanStatus) {
    setError("");
    try {
      const updated = await api.updatePlanStatus(plan.id, status);
      replacePlan(updated);
      toast.success(
        status === "cancelled"
          ? "Plano cancelado."
          : updated.validUntil && updated.validUntil !== plan.validUntil
            ? `Plano reativado. Nova validade: ${formatIsoDate(updated.validUntil)}.`
            : "Plano reativado.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function toggleAutoRenew(plan: PatientPlan) {
    setError("");
    try {
      const updated = await api.setPlanAutoRenew(plan.id, !plan.autoRenew);
      toast.success(
        updated.autoRenew
          ? "Renovação automática ativada."
          : "Renovação automática desativada.",
      );
      setPlans((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const today = clinicIsoDate(new Date());
  const searchedPlans = plans.filter(
    (plan) =>
      (!contextPatientId || plan.patientId === contextPatientId) &&
      planMatchesSearch(plan, search),
  );
  const visiblePlans = searchedPlans.filter((plan) =>
    planMatchesFilter(plan, listFilter, today),
  );
  const filterCount = (filter: PlanListFilter) =>
    searchedPlans.filter((plan) => planMatchesFilter(plan, filter, today))
      .length;

  // Crédito pago na comanda não é plano contratado: fica fora dos totais.
  const contractedPlans = plans.filter((plan) => !isTabCreditPlan(plan));

  function planRenewalLabel(plan: PatientPlan) {
    if (plan.renewedByPlanId) {
      const next = plans.find((item) => item.id === plan.renewedByPlanId);
      return next
        ? `Renovado a partir de ${shortDate.format(new Date(`${next.validFrom}T12:00:00`))}`
        : "Renovado";
    }
    if (plan.autoRenew && plan.validUntil) {
      return `Automática em ${shortDate.format(new Date(`${nextPlanPeriod(plan)!.validFrom}T12:00:00`))}`;
    }
    return "Manual";
  }

  return (
    <>
      <PatientContextNotice patientId={contextPatientId} patients={patients} />
      <PageHeader
        eyebrow="Jornada contratada"
        title="Planos e sessões"
        description="Controle validade, saldo e consumo de cada pacote vendido."
        action={
          canManage
            ? can("plans.create") && (
                <button
                  className="primary-button"
                  onClick={() => setModalOpen(true)}
                >
                  <Plus size={18} />
                  Novo plano
                </button>
              )
            : undefined
        }
      />
      {error && <ErrorBanner error={error} />}
      <section className="plan-metrics">
        <div>
          <strong>
            {contractedPlans.filter((plan) => plan.status === "active").length}
          </strong>
          <span>planos ativos</span>
        </div>
        <div>
          <strong>
            {contractedPlans.reduce(
              (sum, plan) => sum + plan.remainingSessions,
              0,
            )}
          </strong>
          <span>sessões disponíveis</span>
        </div>
        <div>
          <strong>
            {
              contractedPlans.filter(
                (plan) =>
                  plan.remainingSessions <= 2 && plan.status === "active",
              ).length
            }
          </strong>
          <span>saldos baixos</span>
        </div>
      </section>
      <section className="panel plans-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Carteira</span>
            <h2>Planos dos clientes</h2>
          </div>
        </div>
        {!loading && plans.length > 0 && (
          <div className="list-toolbar plans-toolbar">
            <label className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar plano por cliente"
                placeholder="Buscar por cliente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="filter-group filter-tags">
              <span className="filter-label" id="plans-status-filter">
                Situação
              </span>
              <div
                className="tag-filter-list"
                role="group"
                aria-labelledby="plans-status-filter"
              >
                {(Object.keys(planListFilterLabels) as PlanListFilter[]).map(
                  (filter) => (
                    <button
                      type="button"
                      key={filter}
                      className="text-button tag-filter"
                      aria-pressed={listFilter === filter}
                      onClick={() => setListFilter(filter)}
                    >
                      {planListFilterLabels[filter]}
                      <small>{filterCount(filter)}</small>
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <LoadingBlock />
        ) : plans.length === 0 ? (
          <EmptyState
            title="Nenhum plano cadastrado"
            copy="Crie um pacote para gerar o saldo e as parcelas automaticamente."
          />
        ) : visiblePlans.length === 0 ? (
          <EmptyState
            title="Nenhum plano encontrado"
            copy="Mude a busca ou a situação para ver outros planos."
          />
        ) : (
          <div className="plans-grid">
            {visiblePlans.map((plan) => {
              const used = plan.totalSessions - plan.remainingSessions;
              const percent = Math.min(
                100,
                Math.round((used / plan.totalSessions) * 100),
              );
              return (
                <article className="plan-card" key={plan.id}>
                  <div className="plan-card-head">
                    <span className={`status-pill ${planDisplayStatus(plan)}`}>
                      {planBadgeLabel(plan)}
                    </span>
                    <span>{planKindLabels[plan.kind]}</span>
                  </div>
                  <h3>{plan.patientName}</h3>
                  <p>{planSubtitle(plan)}</p>
                  <div className="balance-line">
                    <strong>{plan.remainingSessions}</strong>
                    <span>de {plan.totalSessions} sessões restantes</span>
                  </div>
                  {plan.services.map((entry) => (
                    <p key={entry.serviceId}>
                      {entry.serviceName}: {entry.remainingSessions} de{" "}
                      {entry.totalSessions} sessões ·{" "}
                      {currency.format(entry.totalValueInCents / 100)}
                    </p>
                  ))}
                  <div className="progress-track">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="plan-meta">
                    <span>Validade</span>
                    <strong>
                      {shortDate.format(new Date(`${plan.validFrom}T12:00:00`))}
                      {plan.validUntil
                        ? ` — ${shortDate.format(new Date(`${plan.validUntil}T12:00:00`))}`
                        : " · contínuo"}
                    </strong>
                  </div>
                  {plan.status === "paused" && plan.pausedAt && (
                    <div className="plan-meta plan-pause">
                      <span>Pausa</span>
                      <strong>
                        Desde {shortDate.format(new Date(plan.pausedAt))}
                        {plan.pauseExpectedReturn
                          ? ` · retorno previsto ${shortDate.format(new Date(`${plan.pauseExpectedReturn}T12:00:00`))}`
                          : ""}
                        {plan.pauseReason ? ` · ${plan.pauseReason}` : ""}
                      </strong>
                    </div>
                  )}
                  {!plan.sourceTabId && plan.status !== "cancelled" && (
                    <div className="plan-meta plan-renewal">
                      <span>Renovação</span>
                      <strong>{planRenewalLabel(plan)}</strong>
                      {can("plans.auto_renew") &&
                        plan.validUntil &&
                        !plan.renewedByPlanId &&
                        plan.status !== "expired" && (
                          <label className="plan-auto-renew">
                            <input
                              type="checkbox"
                              checked={plan.autoRenew}
                              onChange={() => void toggleAutoRenew(plan)}
                            />
                            Renovar automaticamente
                          </label>
                        )}
                    </div>
                  )}
                  <div className="plan-actions">
                    <button
                      className="secondary-button button-sm"
                      onClick={() => setMovementPlan(plan)}
                    >
                      <FileClock size={15} />
                      Extrato
                    </button>
                    {canManage &&
                      !plan.sourceTabId &&
                      plan.status !== "cancelled" &&
                      !plan.renewedByPlanId &&
                      can("plans.renew") && (
                        <button
                          className="secondary-button button-sm"
                          onClick={() => setRenewingPlan(plan)}
                        >
                          <RefreshCw size={15} />
                          Renovar
                        </button>
                      )}
                    {canManage &&
                      !plan.sourceTabId &&
                      plan.status !== "cancelled" && (
                        <>
                          {plan.status === "active"
                            ? can("plans.status") && (
                                <button
                                  className="secondary-button button-sm"
                                  onClick={() => setPausingPlan(plan)}
                                >
                                  <Pause size={15} />
                                  Pausar
                                </button>
                              )
                            : can("plans.status") && (
                                <button
                                  className="secondary-button button-sm"
                                  onClick={() =>
                                    void changeStatus(plan, "active")
                                  }
                                >
                                  <Play size={15} />
                                  Ativar
                                </button>
                              )}
                          {can("plans.cancel") && (
                            <button
                              className="danger-button button-sm"
                              onClick={() => setCancellingPlan(plan)}
                            >
                              Cancelar
                            </button>
                          )}
                        </>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {modalOpen && (
        <PlanModal
          fixedPatient={patients.find((item) => item.id === contextPatientId)}
          patients={patients}
          services={services}
          onClose={() => setModalOpen(false)}
          onSaved={(plan) => {
            replacePlan(plan);
            setModalOpen(false);
          }}
        />
      )}
      {renewingPlan && (
        <PlanModal
          patients={patients}
          services={services}
          renewing={renewingPlan}
          onClose={() => setRenewingPlan(null)}
          onSaved={(plan) => {
            const renewedFrom = renewingPlan.id;
            setPlans((items) => [
              plan,
              ...items.map((item) =>
                item.id === renewedFrom
                  ? { ...item, renewedByPlanId: plan.id }
                  : item,
              ),
            ]);
            setRenewingPlan(null);
          }}
        />
      )}
      {pausingPlan && (
        <PlanPauseModal
          plan={pausingPlan}
          onClose={() => setPausingPlan(null)}
          onConfirm={async (pause) => {
            replacePlan(
              await api.updatePlanStatus(pausingPlan.id, "paused", pause),
            );
            toast.success("Plano pausado.");
            setPausingPlan(null);
          }}
        />
      )}
      {cancellingPlan && (
        <PlanCancelModal
          plan={cancellingPlan}
          onClose={() => setCancellingPlan(null)}
          onConfirm={async () => {
            replacePlan(
              await api.updatePlanStatus(cancellingPlan.id, "cancelled"),
            );
            setCancellingPlan(null);
          }}
        />
      )}
      {movementPlan && (
        <SessionMovementsModal
          plan={movementPlan}
          onClose={() => setMovementPlan(null)}
        />
      )}
    </>
  );
}
