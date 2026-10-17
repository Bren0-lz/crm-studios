import {
  type Appointment,
  type IssuedDocument,
  type Patient,
  type PatientPlan,
  type Receivable,
  formatPhone,
  planDisplayStatus,
  planDisplayStatusLabels,
} from "@crm/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import {
  currency,
  formatIsoDate,
  localIsoDate,
  statusLabel,
  tagColorLookup,
  timeLabel,
  emergencyContactLabel,
} from "../../shared/lib/formatting";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { ClinicalWorkspacePanel } from "../clinical/index";
import { InventoryPanel } from "./InventoryPanel";
import { PatientTimelineSection } from "./PatientTimelineSection";

type TabKey =
  | "agenda"
  | "plans"
  | "finance"
  | "contracts"
  | "tabs"
  | "clinical"
  | "history";

/** Consulta de dados do cliente com carregando/erro, refeita ao trocar de cliente. */
function usePatientData<T>(
  enabled: boolean,
  patientId: string,
  load: () => Promise<T>,
) {
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
    // `load` muda a cada render; o cliente e a permissão definem a consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, patientId]);
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

function dateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("pt-BR")} às ${timeLabel.format(date)}`;
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
  const { can, canView } = useAuthorization();
  const id = patient.id;
  const tags = usePatientTags(patient.tags.length > 0);
  const tagColor = tagColorLookup(tags.tags);
  const plans = usePatientData(canView("plans"), id, () => api.plans(id));
  const appointments = usePatientData(canView("agenda"), id, async () => {
    const range = appointmentWindow();
    return (await api.appointments(range.from, range.to)).filter(
      (item) => item.patientId === id,
    );
  });
  const finance = usePatientData(
    canView("finance") && can("finance.view"),
    id,
    async () =>
      (await api.financialSummary()).receivables.filter(
        (item) => item.patientId === id,
      ),
  );
  const contracts = usePatientData(canView("contracts"), id, async () =>
    (await api.documents()).filter((item) => item.patientId === id),
  );
  const today = localIsoDate();
  // Instante em que a ficha abriu: referência para o "próximo atendimento".
  const [openedAt] = useState(() => Date.now());
  const currentPlan = plans.data?.find(
    (plan) =>
      plan.status === "active" &&
      plan.validFrom <= today &&
      (!plan.validUntil || plan.validUntil >= today),
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
    { key: "tabs", label: "Comandas", visible: true },
    { key: "clinical", label: "Prontuário", visible: canView("clinical") },
    { key: "history", label: "Histórico", visible: can("patients.timeline") },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const [selected, setSelected] = useState<TabKey | null>(null);
  const active = selected ?? visibleTabs[0]?.key ?? null;
  const moduleLink = (to: string) =>
    `${to}?patientId=${encodeURIComponent(id)}`;

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
            <dd>{patient.email || "Não informado"}</dd>
          </div>
          {canView("plans") && (
            <div>
              <dt>Plano ativo</dt>
              <dd>
                {plans.loading
                  ? "Carregando…"
                  : currentPlan
                    ? `${currentPlan.name} · ${currentPlan.remainingSessions} de ${currentPlan.totalSessions} sessões`
                    : "Sem plano ativo"}
              </dd>
            </div>
          )}
          {canView("agenda") && (
            <div>
              <dt>Próximo atendimento</dt>
              <dd>
                {appointments.loading
                  ? "Carregando…"
                  : nextAppointment
                    ? `${dateTime(nextAppointment.startsAt)} · ${nextAppointment.serviceName}`
                    : "Nenhum agendado"}
              </dd>
            </div>
          )}
          <div
            className={`emergency-contact${emergencyContactLabel(patient) ? "" : " is-missing"}`}
          >
            <dt>Contato de emergência</dt>
            <dd>{emergencyContactLabel(patient) || "Não informado"}</dd>
          </div>
          <div className="patient-overview-tags">
            <dt>Etiquetas</dt>
            <dd>
              {patient.tags.length ? (
                patient.tags.map((tag) => (
                  <PatientTagBadge key={tag} name={tag} color={tagColor(tag)} />
                ))
              ) : (
                <span>Sem etiquetas</span>
              )}
            </dd>
          </div>
        </dl>
      </section>
      {visibleTabs.length > 0 && active && (
        <section className="panel patient-record-tabs">
          <div className="panel-head">
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
                link={{ to: moduleLink("/agenda"), label: "Abrir na Agenda" }}
                render={(items: Appointment[]) =>
                  [...items]
                    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                    .map((item) => (
                      <li key={item.id}>
                        <strong>{dateTime(item.startsAt)}</strong>
                        <span>
                          {item.serviceName} · {item.professionalName}
                        </span>
                        <span className={`status-pill ${item.status}`}>
                          {statusLabel(item.status)}
                        </span>
                      </li>
                    ))
                }
              />
            )}
            {active === "plans" && (
              <TabList
                state={plans}
                empty="Nenhum plano contratado."
                link={{ to: moduleLink("/planos"), label: "Abrir em Planos" }}
                render={(items: PatientPlan[]) =>
                  items.map((plan) => (
                    <li key={plan.id}>
                      <strong>{plan.name}</strong>
                      <span>
                        {plan.remainingSessions} de {plan.totalSessions} sessões
                        · {formatIsoDate(plan.validFrom)}
                        {plan.validUntil
                          ? ` a ${formatIsoDate(plan.validUntil)}`
                          : " · contínuo"}
                      </span>
                      <span
                        className={`status-pill ${planDisplayStatus(plan)}`}
                      >
                        {planDisplayStatusLabels[planDisplayStatus(plan)]}
                      </span>
                    </li>
                  ))
                }
              />
            )}
            {active === "finance" && (
              <TabList
                state={finance}
                empty="Nenhuma parcela registrada."
                link={{
                  to: moduleLink("/financeiro"),
                  label: "Abrir no Financeiro",
                }}
                render={(items: Receivable[]) =>
                  [...items]
                    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
                    .map((item) => (
                      <li key={item.id}>
                        <strong>{item.description}</strong>
                        <span>
                          Vence em {formatIsoDate(item.dueDate)} ·{" "}
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
                      </li>
                    ))
                }
              />
            )}
            {active === "contracts" && (
              <TabList
                state={contracts}
                empty="Nenhum contrato emitido."
                link={{
                  to: moduleLink("/contratos"),
                  label: "Abrir em Contratos",
                }}
                render={(items: IssuedDocument[]) =>
                  items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.templateName}</span>
                      <span className={`status-pill ${item.status}`}>
                        {item.status === "issued"
                          ? "Emitido"
                          : item.status === "cancelled"
                            ? "Cancelado"
                            : "Rascunho"}
                      </span>
                    </li>
                  ))
                }
              />
            )}
            {active === "tabs" && <InventoryPanel patientId={id} />}
            {active === "clinical" && (
              <ClinicalWorkspacePanel
                key={id}
                patients={[patient]}
                editable={canEditClinical}
              />
            )}
            {active === "history" && <PatientTimelineSection patientId={id} />}
          </div>
        </section>
      )}
    </>
  );
}

function TabList<T>({
  state,
  empty,
  link,
  render,
}: {
  state: { data: T[] | null; error: string; loading: boolean };
  empty: string;
  link: { to: string; label: string };
  render: (items: T[]) => ReactNode;
}) {
  return (
    <div className="patient-tab-list">
      <div className="page-actions">
        <Link className="secondary-button button-sm" to={link.to}>
          {link.label}
        </Link>
      </div>
      {state.error ? (
        <ErrorBanner error={state.error} />
      ) : state.loading || !state.data ? (
        <LoadingBlock />
      ) : state.data.length === 0 ? (
        <EmptyState title="Nada por aqui" copy={empty} />
      ) : (
        <ul>{render(state.data)}</ul>
      )}
    </div>
  );
}
