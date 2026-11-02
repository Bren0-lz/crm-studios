import {
  type Appointment,
  type IssuedDocument,
  type Patient,
  type PatientPlan,
  type Receivable,
  formatPhone,
  isTabCreditPlan,
  patientProfileLabels,
  patientProfileValueLabels,
  planHasSessionBalance,
  planUsedSessions,
} from "@crm/contracts";
import { ArrowUpRight, FileClock, Plus, Repeat } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { allBranches, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import {
  currency,
  formatIsoDate,
  localIsoDate,
  patientAge,
  statusLabel,
  tagColorLookup,
  timeLabel,
  emergencyContactLabel,
} from "../../shared/lib/formatting";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { useToast } from "../../shared/feedback/toast-context";
import { useDataVersion } from "../../shared/hooks/useDataVersion";
import type { DataDomain } from "../../shared/api/data-version";
import { ClinicalWorkspacePanel } from "../clinical/index";
import { PatientMessagePreferences } from "../communications/index";
import { SignatureLinkRecord } from "../contracts/index";
import {
  PlanCancelModal,
  PlanCard,
  SessionMovementsModal,
  planSubtitle,
  type PlanCatalogKind,
} from "../plans/index";
import { patientDiscountLabel } from "./model";
import { PatientPlanModal } from "./PatientPlanModal";
import { PatientTimelineSection } from "./PatientTimelineSection";

type TabKey =
  "agenda" | "plans" | "finance" | "contracts" | "clinical" | "history";

/**
 * Consulta de dados do cliente com carregando/erro, refeita ao trocar de cliente e, em
 * silêncio (mantendo os dados atuais), quando uma mutação muda o domínio (QC6).
 */
function usePatientData<T>(
  enabled: boolean,
  patientId: string,
  domain: DataDomain,
  load: () => Promise<T>,
) {
  const version = useDataVersion(domain);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load()
      .then((data) => active && setState({ key: patientId, data, error: "" }))
      .catch(
        (cause: Error) =>
          active &&
          setState({ key: patientId, data: null, error: cause.message }),
      );
    return () => {
      active = false;
    };
    // `load` muda a cada render; o cliente, a permissão e a versão definem a consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, patientId, version]);
  const current = state?.key === patientId ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: enabled && !current,
  };
}

function appointmentWindow() {
  const from = new Date();
  from.setDate(from.getDate() - 120);
  const to = new Date();
  to.setDate(to.getDate() + 120);
  return { from: from.toISOString(), to: to.toISOString() };
}

const appointmentDay = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

/** "qui., 09 de nov. · 09:00"; o ano só aparece quando não é o atual. */
function dateTime(value: string) {
  const date = new Date(value);
  const year =
    date.getFullYear() === new Date().getFullYear()
      ? ""
      : ` de ${date.getFullYear()}`;
  return `${appointmentDay.format(date)}${year} · ${timeLabel.format(date)}`;
}

/** Campos do cadastro preenchidos, já formatados: [chave, rótulo, valor]. */
function profileFields(patient: Patient) {
  const fields: [string, string, string][] = [];
  if (patient.birthDate)
    fields.push(["birthDate", "Nascimento", formatIsoDate(patient.birthDate)]);
  const age = patientAge(patient.birthDate || undefined);
  if (age !== undefined)
    fields.push(["age", "Idade", `${age} ${age === 1 ? "ano" : "anos"}`]);
  if (patient.cpf) fields.push(["cpf", "CPF", patient.cpf]);
  for (const [key, label] of Object.entries(patientProfileLabels)) {
    const value = patient[key as keyof typeof patientProfileLabels];
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      continue;
    fields.push([
      key,
      label,
      Array.isArray(value)
        ? value.join(", ")
        : typeof value === "boolean"
          ? value
            ? "Sim"
            : "Não"
          : key === "gender"
            ? (patientProfileValueLabels[
                value as keyof typeof patientProfileValueLabels
              ] ?? value)
            : key === "clientSince"
              ? formatIsoDate(value)
              : value,
    ]);
  }
  if (patient.discount)
    fields.push([
      "discount",
      "Desconto",
      patientDiscountLabel(patient.discount),
    ]);
  return fields;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Ficha do cliente: resumo no topo e abas com o conteúdo do próprio cliente (U14). Cada
 * aba tem o atalho para abrir o módulo completo já filtrado pelo cliente.
 */
export function PatientRecordTabs({
  patient,
  canEditClinical,
}: {
  patient: Patient;
  canEditClinical: boolean;
}) {
  const { can, canEdit, canView } = useAuthorization();
  const id = patient.id;
  const tags = usePatientTags(patient.tags.length > 0);
  const tagColor = tagColorLookup(tags.tags);
  const plans = usePatientData(canView("plans"), id, "plans", () =>
    api.plans(id),
  );
  const appointments = usePatientData(
    canView("agenda"),
    id,
    "agenda",
    async () => {
      const range = appointmentWindow();
      return (await api.appointments(range.from, range.to, allBranches)).filter(
        (item) => item.patientId === id,
      );
    },
  );
  const finance = usePatientData(
    canView("finance") && can("finance.view"),
    id,
    "finance",
    async () =>
      (await api.financialSummary(allBranches)).receivables.filter(
        (item) => item.patientId === id,
      ),
  );
  const contracts = usePatientData(
    canView("contracts"),
    id,
    "contracts",
    async () => (await api.documents()).filter((item) => item.patientId === id),
  );
  const today = localIsoDate();
  // Instante em que a ficha abriu: referência para o "próximo atendimento".
  const [openedAt] = useState(() => Date.now());
  // Todos os planos vigentes, o que vence primeiro no topo (sem validade por último).
  const currentPlans = (plans.data ?? [])
    .filter(
      (plan) =>
        !isTabCreditPlan(plan) &&
        plan.status === "active" &&
        plan.validFrom <= today &&
        (!plan.validUntil || plan.validUntil >= today),
    )
    .sort((a, b) =>
      (a.validUntil ?? "9999-12-31").localeCompare(
        b.validUntil ?? "9999-12-31",
      ),
    );
  const nextAppointment = appointments.data
    ?.filter(
      (item) =>
        Date.parse(item.startsAt) >= openedAt &&
        (item.status === "scheduled" || item.status === "confirmed"),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const tabs: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "agenda", label: "Agenda", visible: canView("agenda") },
    { key: "plans", label: "Planos", visible: canView("plans") },
    {
      key: "finance",
      label: "Financeiro",
      visible: canView("finance") && can("finance.view"),
    },
    { key: "contracts", label: "Contratos", visible: canView("contracts") },
    { key: "clinical", label: "Prontuário", visible: canView("clinical") },
    { key: "history", label: "Histórico", visible: can("patients.timeline") },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const [selected, setSelected] = useState<TabKey | null>(null);
  const [movementPlan, setMovementPlan] = useState<PatientPlan | null>(null);
  const [newPlanKind, setNewPlanKind] = useState<PlanCatalogKind | null>(null);
  const toast = useToast();
  const canCreatePlan = canEdit("plans") && can("plans.create");
  const [cancellingPlan, setCancellingPlan] = useState<PatientPlan | null>(
    null,
  );
  const canCancelPlan = canEdit("plans") && can("plans.cancel");
  const active = selected ?? visibleTabs[0]?.key ?? null;
  const moduleLink = (to: string) =>
    `${to}?patientId=${encodeURIComponent(id)}`;

  const emergency = emergencyContactLabel(patient);
  const patientOption = { id, fullName: patient.fullName, tags: patient.tags };

  return (
    <>
      <section
        className="panel patient-overview"
        aria-label="Resumo do cliente"
      >
        <dl className="patient-overview-grid">
          <div>
            <dt>Telefone</dt>
            <dd>{formatPhone(patient.phone)}</dd>
          </div>
          {patient.whatsapp && patient.whatsapp !== patient.phone && (
            <div>
              <dt>WhatsApp</dt>
              <dd>{formatPhone(patient.whatsapp)}</dd>
            </div>
          )}
          <div>
            <dt>E-mail</dt>
            <dd className={patient.email ? undefined : "is-empty"}>
              {patient.email || "Não informado"}
            </dd>
          </div>
          <div className={`emergency-contact${emergency ? "" : " is-missing"}`}>
            <dt>Contato de emergência</dt>
            <dd>{emergency || "Não informado"}</dd>
          </div>
          {profileFields(patient).map(([key, label, value]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {(canView("plans") || canView("agenda")) && (
          <dl className="patient-overview-highlights">
            {canView("plans") && (
              <div>
                <dt>
                  {currentPlans.length > 1
                    ? `Planos ativos (${currentPlans.length})`
                    : "Plano ativo"}
                </dt>
                {plans.loading ? (
                  <dd className="is-empty">Carregando…</dd>
                ) : currentPlans.length ? (
                  <dd>
                    <ul
                      className={`patient-overview-plans${currentPlans.length > 1 ? " is-multiple" : ""}`}
                    >
                      {currentPlans.map((plan) => (
                        <li key={plan.id}>
                          <strong>{plan.name}</strong>
                          <span>
                            {planHasSessionBalance(plan)
                              ? countLabel(
                                  plan.remainingSessions,
                                  "sessão restante",
                                  "sessões restantes",
                                )
                              : countLabel(
                                  planUsedSessions(plan),
                                  "aula feita",
                                  "aulas feitas",
                                )}{" "}
                            de {plan.totalSessions}
                            {plan.validUntil
                              ? ` · até ${formatIsoDate(plan.validUntil)}`
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                ) : (
                  <dd className="is-empty">Sem plano ativo</dd>
                )}
              </div>
            )}
            {canView("agenda") && (
              <div>
                <dt>Próximo atendimento</dt>
                {appointments.loading ? (
                  <dd className="is-empty">Carregando…</dd>
                ) : nextAppointment ? (
                  <dd>
                    <strong>{dateTime(nextAppointment.startsAt)}</strong>
                    <span>
                      {nextAppointment.serviceName} ·{" "}
                      {nextAppointment.professionalName}
                    </span>
                  </dd>
                ) : (
                  <dd className="is-empty">Nenhum agendado</dd>
                )}
              </div>
            )}
          </dl>
        )}
        <div className="patient-overview-tags">
          <span>Etiquetas</span>
          {patient.tags.length ? (
            <div className="patient-overview-tag-list">
              {patient.tags.map((tag) => (
                <PatientTagBadge key={tag} name={tag} color={tagColor(tag)} />
              ))}
            </div>
          ) : (
            <span className="is-empty">Sem etiquetas</span>
          )}
        </div>
        {canView("communications") && (
          <PatientMessagePreferences patientId={id} />
        )}
      </section>
      {visibleTabs.length > 0 && active && (
        <section className="panel patient-record-tabs">
          <div className="tabs" role="tablist" aria-label="Ficha do cliente">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`patient-tab-${tab.key}`}
                aria-selected={active === tab.key}
                aria-controls="patient-tab-panel"
                className={`tab-button ${active === tab.key ? "active" : ""}`}
                onClick={() => setSelected(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="patient-tab-panel"
            id="patient-tab-panel"
            role="tabpanel"
            aria-labelledby={`patient-tab-${active}`}
          >
            {active === "agenda" && (
              <TabList
                state={appointments}
                empty="Nenhum atendimento nos últimos ou próximos 4 meses."
                summary={(items) =>
                  countLabel(
                    items.length,
                    "atendimento nos últimos e próximos 4 meses",
                    "atendimentos nos últimos e próximos 4 meses",
                  )
                }
                link={{ to: moduleLink("/agenda"), label: "Abrir na Agenda" }}
                render={(items: Appointment[]) => {
                  const upcoming = items
                    .filter((item) => Date.parse(item.startsAt) >= openedAt)
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                  const past = items
                    .filter((item) => Date.parse(item.startsAt) < openedAt)
                    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
                  const row = (item: Appointment) => (
                    <li key={item.id}>
                      <div className="patient-tab-item-main">
                        <strong>{dateTime(item.startsAt)}</strong>
                        <span>
                          {item.serviceName} · {item.professionalName}
                        </span>
                      </div>
                      <div className="patient-tab-item-side">
                        <span className={`status-pill ${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                    </li>
                  );
                  return (
                    <>
                      {upcoming.length > 0 && (
                        <TabGroup title="Próximos" count={upcoming.length}>
                          {upcoming.map(row)}
                        </TabGroup>
                      )}
                      {past.length > 0 && (
                        <TabGroup title="Anteriores" count={past.length}>
                          {past.map(row)}
                        </TabGroup>
                      )}
                    </>
                  );
                }}
              />
            )}
            {active === "plans" && (
              <TabList
                state={plans}
                empty="Nenhum plano contratado."
                summary={(items) =>
                  countLabel(
                    items.length,
                    "plano contratado",
                    "planos contratados",
                  )
                }
                link={{ to: moduleLink("/planos"), label: "Abrir em Planos" }}
                actions={
                  canCreatePlan && (
                    <>
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        onClick={() => setNewPlanKind("recurring")}
                      >
                        <Repeat size={15} aria-hidden="true" />
                        Plano recorrente
                      </button>
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        onClick={() => setNewPlanKind("single")}
                      >
                        <Plus size={15} aria-hidden="true" />
                        Plano avulso
                      </button>
                    </>
                  )
                }
                render={(items: PatientPlan[]) => (
                  <div className="plans-grid">
                    {items.map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        plans={items}
                        title={planSubtitle(plan)}
                        actions={
                          <>
                            <button
                              type="button"
                              className="secondary-button button-sm"
                              onClick={() => setMovementPlan(plan)}
                            >
                              <FileClock size={15} />
                              Extrato
                            </button>
                            {canCancelPlan &&
                              !isTabCreditPlan(plan) &&
                              plan.status !== "cancelled" && (
                                <button
                                  type="button"
                                  className="danger-button button-sm"
                                  onClick={() => setCancellingPlan(plan)}
                                >
                                  Cancelar plano
                                </button>
                              )}
                          </>
                        }
                      />
                    ))}
                  </div>
                )}
              />
            )}
            {active === "finance" && (
              <TabList
                state={finance}
                empty="Nenhuma parcela registrada."
                summary={(items) => {
                  // Total de desconto do cliente já concedido nas cobranças.
                  const discount = items
                    .filter((item) => item.status !== "cancelled")
                    .reduce(
                      (sum, item) => sum + (item.customerDiscountInCents ?? 0),
                      0,
                    );
                  return discount
                    ? `${countLabel(items.length, "parcela", "parcelas")} · ${currency.format(discount / 100)} em descontos concedidos`
                    : countLabel(items.length, "parcela", "parcelas");
                }}
                link={{
                  to: moduleLink("/financeiro"),
                  label: "Abrir no Financeiro",
                }}
                render={(items: Receivable[]) => (
                  <ul className="patient-tab-items">
                    {[...items]
                      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
                      .map((item) => (
                        <li key={item.id}>
                          <div className="patient-tab-item-main">
                            <strong>{item.description}</strong>
                            <span>
                              Vence em {formatIsoDate(item.dueDate)}
                              {item.customerDiscountInCents
                                ? ` · desconto de ${currency.format(item.customerDiscountInCents / 100)}`
                                : ""}
                            </span>
                          </div>
                          <div className="patient-tab-item-side">
                            <span className="patient-tab-amount">
                              {currency.format(item.amountInCents / 100)}
                            </span>
                            <span
                              className={`status-pill ${item.overdue ? "overdue" : item.status}`}
                            >
                              {item.overdue
                                ? "Vencida"
                                : item.status === "paid"
                                  ? "Paga"
                                  : item.status === "cancelled"
                                    ? "Cancelada"
                                    : "Em aberto"}
                            </span>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              />
            )}
            {active === "contracts" && (
              <TabList
                state={contracts}
                empty="Nenhum contrato emitido."
                summary={(items) =>
                  countLabel(items.length, "documento", "documentos")
                }
                link={{
                  to: moduleLink("/contratos"),
                  label: "Abrir em Contratos",
                }}
                render={(items: IssuedDocument[]) => (
                  <ul className="patient-tab-items">
                    {items.map((item) => (
                      <li key={item.id}>
                        <div className="patient-tab-item-main">
                          <strong>{item.title}</strong>
                          <span>{item.templateName}</span>
                          {item.status !== "cancelled" && (
                            <SignatureLinkRecord document={item} />
                          )}
                        </div>
                        <div className="patient-tab-item-side">
                          <span className={`status-pill ${item.status}`}>
                            {item.status === "issued"
                              ? "Emitido"
                              : item.status === "cancelled"
                                ? "Cancelado"
                                : "Rascunho"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              />
            )}
            {active === "clinical" && (
              <ClinicalWorkspacePanel
                key={id}
                patientId={id}
                editable={canEditClinical}
              />
            )}
            {active === "history" && <PatientTimelineSection patientId={id} />}
          </div>
        </section>
      )}
      {newPlanKind && (
        <PatientPlanModal
          patient={patientOption}
          kind={newPlanKind}
          onClose={() => setNewPlanKind(null)}
          onSaved={(plan) => {
            setNewPlanKind(null);
            toast.success(`Plano ${plan.name} vinculado.`);
          }}
        />
      )}
      {cancellingPlan && (
        <PlanCancelModal
          plan={cancellingPlan}
          onClose={() => setCancellingPlan(null)}
          onConfirm={async (cancellation) => {
            await api.updatePlanStatus(
              cancellingPlan.id,
              "cancelled",
              undefined,
              cancellation,
            );
            toast.success(
              cancellation.refundedInCents
                ? `Plano cancelado. Estorno de ${currency.format(cancellation.refundedInCents / 100)} registrado.`
                : "Plano cancelado.",
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

function TabGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="patient-tab-group">
      <h3>
        {title} <span>{count}</span>
      </h3>
      <ul className="patient-tab-items">{children}</ul>
    </div>
  );
}

function TabList<T>({
  state,
  empty,
  summary,
  link,
  actions,
  render,
}: {
  state: { data: T[] | null; error: string; loading: boolean };
  empty: string;
  summary: (items: T[]) => string;
  link: { to: string; label: string };
  actions?: ReactNode;
  render: (items: T[]) => ReactNode;
}) {
  return (
    <div className="patient-tab-list">
      <div className="patient-tab-toolbar">
        <span>{state.data?.length ? summary(state.data) : ""}</span>
        <div className="patient-tab-toolbar-actions">
          {actions}
          <Link className="text-button button-sm" to={link.to}>
            {link.label}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      {state.error ? (
        <ErrorBanner error={state.error} />
      ) : state.loading || !state.data ? (
        <LoadingBlock />
      ) : state.data.length === 0 ? (
        <EmptyState title="Nada por aqui" copy={empty} />
      ) : (
        render(state.data)
      )}
    </div>
  );
}
