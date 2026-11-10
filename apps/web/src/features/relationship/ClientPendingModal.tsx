import {
  type ContactSuggestion,
  type IssuedDocument,
  type PatientPlan,
  type Receivable,
  isTabCreditPlan,
  patientFirstName,
  planHasSessionBalance,
} from "@crm/contracts";
import { ArrowUpRight, MessageCircle, PhoneCall } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { allBranches, api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  currency,
  formatIsoDate,
  localIsoDate,
} from "../../shared/lib/formatting";
import { contactReasonLabels, suggestionKey } from "./model";

type Loaded<T> = { data: T[] | null; error: string };

/** Carrega uma lista do cliente só quando o perfil tem acesso ao módulo. */
function usePendingList<T>(enabled: boolean, load: () => Promise<T[]>) {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    load()
      .then((data) => active && setState({ data, error: "" }))
      .catch(
        (cause: Error) =>
          active && setState({ data: null, error: cause.message }),
      );
    return () => {
      active = false;
    };
    // `load` muda a cada render; a permissão define a consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return state;
}

/** Plano com sessões sobrando: em uso, pausado ou vencido sem ter sido usado por inteiro. */
function hasPendingBalance(plan: PatientPlan) {
  return (
    !isTabCreditPlan(plan) &&
    planHasSessionBalance(plan) &&
    plan.remainingSessions > 0 &&
    (plan.status === "active" ||
      plan.status === "paused" ||
      plan.status === "expired")
  );
}

function planStatus(plan: PatientPlan, today: string) {
  if (plan.status === "paused") return "Pausado";
  if (plan.status === "expired" || (plan.validUntil && plan.validUntil < today))
    return "Vencido";
  return "Em uso";
}

/** O que o cliente tem em aberto no sistema, aberto a partir de um contato sugerido. */
export function ClientPendingModal({
  suggestions,
  whatsappHref,
  onRecord,
  onClose,
}: {
  suggestions: ContactSuggestion[];
  /** Link do WhatsApp com a mensagem da situação principal já preenchida. */
  whatsappHref: string;
  /** Ausente quando o perfil não pode registrar contato. */
  onRecord?: (() => void) | undefined;
  onClose: () => void;
}) {
  const suggestion = suggestions[0]!;
  const patientId = suggestion.patientId;
  const { canView } = useAuthorization();
  const today = localIsoDate();
  const receivables = usePendingList<Receivable>(canView("finance"), async () =>
    (await api.financialSummary(allBranches)).receivables
      .filter((item) => item.patientId === patientId && item.status === "open")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  );
  const plans = usePendingList<PatientPlan>(canView("plans"), async () =>
    (await api.plans(patientId))
      .filter(hasPendingBalance)
      .sort((a, b) =>
        (a.validUntil ?? "9999").localeCompare(b.validUntil ?? "9999"),
      ),
  );
  const documents = usePendingList<IssuedDocument>(
    canView("contracts"),
    async () =>
      (await api.documents()).filter(
        (item) => item.patientId === patientId && item.status === "draft",
      ),
  );
  const overdueTotal = (receivables.data ?? [])
    .filter((item) => item.overdue)
    .reduce((sum, item) => sum + item.amountInCents, 0);

  return (
    <Modal
      eyebrow="Relacionamento"
      title={`Pendências de ${patientFirstName(suggestion.patientName)}`}
      subtitle={suggestion.patientName}
      onClose={onClose}
    >
      <div className="client-pending">
        <PendingSection title="Situações" count={suggestions.length}>
          <ul className="patient-tab-items">
            {suggestions.map((item) => (
              <li key={suggestionKey(item)}>
                <div className="patient-tab-item-main">
                  <strong>{contactReasonLabels[item.reason]}</strong>
                  <span>{item.detail}</span>
                </div>
                {item.dueDate && (
                  <div className="patient-tab-item-side">
                    <span>{formatIsoDate(item.dueDate)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </PendingSection>
        {canView("finance") && (
          <PendingList
            title="Parcelas em aberto"
            state={receivables}
            empty="Nenhuma parcela em aberto."
            context={
              overdueTotal > 0
                ? `${currency.format(overdueTotal / 100)} em atraso`
                : undefined
            }
            link={{ to: "/financeiro", label: "Abrir no Financeiro" }}
            patientId={patientId}
            render={(item) => (
              <li key={item.id}>
                <div className="patient-tab-item-main">
                  <strong>{item.description}</strong>
                  <span>
                    Parcela {item.installmentNumber} de {item.installmentCount}{" "}
                    · vence em {formatIsoDate(item.dueDate)}
                  </span>
                </div>
                <div className="patient-tab-item-side">
                  <span className="patient-tab-amount">
                    {currency.format(item.amountInCents / 100)}
                  </span>
                  <span
                    className={`status-pill ${item.overdue ? "overdue" : "open"}`}
                  >
                    {item.overdue ? "Vencida" : "Em aberto"}
                  </span>
                </div>
              </li>
            )}
          />
        )}
        {canView("plans") && (
          <PendingList
            title="Planos com saldo"
            state={plans}
            empty="Nenhum plano com sessões sobrando."
            link={{ to: "/planos", label: "Abrir em Planos" }}
            patientId={patientId}
            render={(plan) => (
              <li key={plan.id}>
                <div className="patient-tab-item-main">
                  <strong>{plan.name}</strong>
                  <span>
                    {plan.remainingSessions} de {plan.totalSessions}{" "}
                    {plan.totalSessions === 1 ? "sessão" : "sessões"} restantes
                    {plan.validUntil
                      ? ` · validade ${formatIsoDate(plan.validUntil)}`
                      : ""}
                  </span>
                </div>
                <div className="patient-tab-item-side">
                  <span className="status-pill">{planStatus(plan, today)}</span>
                </div>
              </li>
            )}
          />
        )}
        {canView("contracts") && (
          <PendingList
            title="Contratos em rascunho"
            state={documents}
            empty="Nenhum contrato aguardando emissão."
            link={{ to: "/contratos", label: "Abrir em Contratos" }}
            patientId={patientId}
            render={(item) => (
              <li key={item.id}>
                <div className="patient-tab-item-main">
                  <strong>{item.title}</strong>
                  <span>{item.templateName}</span>
                </div>
                <div className="patient-tab-item-side">
                  <span className="status-pill draft">Rascunho</span>
                </div>
              </li>
            )}
          />
        )}
      </div>
      <div className="modal-actions">
        {canView("patients") && (
          <Link
            className="secondary-button"
            to={`/clientes/${encodeURIComponent(patientId)}`}
          >
            Abrir ficha do cliente
          </Link>
        )}
        {onRecord && (
          <button type="button" className="secondary-button" onClick={onRecord}>
            <PhoneCall size={16} aria-hidden="true" />
            Registrar contato
          </button>
        )}
        <a
          className="whatsapp-button"
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={16} aria-hidden="true" />
          WhatsApp
        </a>
      </div>
    </Modal>
  );
}

function PendingSection({
  title,
  count,
  context,
  action,
  children,
}: {
  title: string;
  count?: number | undefined;
  context?: string | undefined;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="patient-tab-group" aria-label={title}>
      <div className="client-pending-head">
        <h3>
          {title} {count !== undefined && <span>{count}</span>}
        </h3>
        {action}
      </div>
      {context && <p className="client-pending-context">{context}</p>}
      {children}
    </section>
  );
}

function PendingList<T>({
  title,
  state,
  empty,
  context,
  link,
  patientId,
  render,
}: {
  title: string;
  state: Loaded<T>;
  empty: string;
  context?: string | undefined;
  link: { to: string; label: string };
  patientId: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <PendingSection
      title={title}
      count={state.data?.length || undefined}
      context={context}
      action={
        <Link
          className="text-button button-sm"
          to={`${link.to}?patientId=${encodeURIComponent(patientId)}`}
        >
          {link.label}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      }
    >
      {state.error ? (
        <ErrorBanner error={state.error} />
      ) : !state.data ? (
        <LoadingBlock />
      ) : state.data.length === 0 ? (
        <EmptyState title="Nada pendente" copy={empty} />
      ) : (
        <ul className="patient-tab-items">{state.data.map(render)}</ul>
      )}
    </PendingSection>
  );
}
