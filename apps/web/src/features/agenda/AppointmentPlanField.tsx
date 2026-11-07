import type {
  AppointmentPlanPrice,
  AppointmentPricing,
  PatientOption,
} from "@crm/contracts";
import { AlertTriangle, Plus } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PlanSaleContext } from "../../shared/workflows/PlanSaleContext";

/** Plano com saldo para todas as ocorrências (recorrente vale pela frequência). */
function planCoversSessions(plan: AppointmentPlanPrice, sessions: number) {
  return Boolean(plan.unlimited) || plan.remainingSessions >= sessions;
}

function planOptionLabel(plan: AppointmentPlanPrice) {
  return plan.unlimited
    ? `${plan.planName} · recorrente`
    : `${plan.planName} · ${plan.remainingSessions} ${plan.remainingSessions === 1 ? "sessão" : "sessões"}`;
}

/**
 * Campo "Plano" do agendamento (AP4): planos do cliente vigentes na data, com o serviço e
 * saldo para as ocorrências; o padrão é o que vence antes. Sem plano válido, oferece
 * vender o plano avulso do serviço e já seleciona o plano novo.
 */
export function AppointmentPlanField({
  patient,
  serviceId,
  startsAt,
  sessions = 1,
  value,
  onChange,
  disabled = false,
  noneLabel,
  onNestedModalChange,
  onPlanSold,
}: {
  patient: PatientOption | undefined;
  serviceId: string;
  /** Início da 1ª ocorrência (ISO); vazio usa o dia de hoje. */
  startsAt: string | undefined;
  /** Quantas sessões o pedido marca (recorrência). */
  sessions?: number | undefined;
  value: string;
  onChange: (planId: string) => void;
  disabled?: boolean | undefined;
  /**
   * Atendimento agendado antes da exigência de plano: mantém a opção de seguir sem vínculo
   * (rótulo da opção vazia) em vez de escolher um plano sozinho.
   */
  noneLabel?: string | undefined;
  onNestedModalChange?: ((open: boolean) => void) | undefined;
  /** Plano avulso vendido aqui (o formulário recarrega os planos do cliente). */
  onPlanSold?: (() => void) | undefined;
}) {
  const { can, canEdit } = useAuthorization();
  const renderPlanSale = useContext(PlanSaleContext);
  const patientId = patient?.id ?? "";
  const key = `${patientId}:${serviceId}:${startsAt ?? ""}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    pricing?: AppointmentPricing;
    error?: string;
  } | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  useEffect(() => {
    if (!patientId || !serviceId) return;
    let active = true;
    api
      .appointmentPricing(patientId, serviceId, startsAt)
      .then((pricing) => {
        if (!active) return;
        setState(
          pricing && Array.isArray(pricing.plans)
            ? { key, pricing }
            : { key, error: "Não foi possível carregar os planos do cliente." },
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar os planos do cliente.",
          });
      });
    return () => {
      active = false;
    };
  }, [patientId, serviceId, startsAt, key, attempt]);
  const loaded = state?.key === key ? state : null;
  const eligible =
    loaded?.pricing?.plans.filter((plan) =>
      planCoversSessions(plan, sessions),
    ) ?? [];
  const valid =
    eligible.some((plan) => plan.planId === value) ||
    (noneLabel !== undefined && value === "");
  const fallback = noneLabel !== undefined ? "" : (eligible[0]?.planId ?? "");
  // Padrão: o plano que vence antes (ordem do consumo). Sai do plano que deixou de valer.
  useEffect(() => {
    if (!loaded?.pricing || valid || value === fallback) return;
    onChange(fallback);
  }, [loaded?.pricing, valid, value, fallback, onChange]);
  if (!patientId || !serviceId) return null;
  if (!loaded) return <LoadingBlock />;
  if (loaded.error)
    return (
      <div className="span-2">
        <ErrorBanner error={loaded.error} />
        <button
          type="button"
          className="secondary-button button-sm"
          onClick={() => setAttempt((current) => current + 1)}
        >
          Tentar novamente
        </button>
      </div>
    );
  const single = loaded.pricing?.single;
  const canSell =
    Boolean(renderPlanSale) && canEdit("plans") && can("plans.create");
  function toggleSelling(templateId: string | null) {
    setSelling(templateId);
    onNestedModalChange?.(templateId !== null);
  }
  return (
    <>
      {eligible.length > 0 || noneLabel !== undefined ? (
        <div>
          <label>
            Plano
            <select
              required={noneLabel === undefined}
              value={valid ? value : fallback}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value)}
            >
              {noneLabel !== undefined && <option value="">{noneLabel}</option>}
              {eligible.map((plan) => (
                <option value={plan.planId} key={plan.planId}>
                  {planOptionLabel(plan)}
                </option>
              ))}
            </select>
          </label>
          <span className="field-hint">
            {value
              ? "A sessão é descontada deste plano ao finalizar."
              : "Sem vínculo, a sessão sai do plano que vence antes ao finalizar."}
          </span>
        </div>
      ) : (
        <div className="appointment-patient-warnings span-2" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <ul>
            <li>
              <strong>Cliente sem plano para este serviço</strong>
              <span>
                {sessions > 1
                  ? `Nenhum plano do cliente tem saldo para as ${sessions} sessões nas datas escolhidas.`
                  : "Nenhum plano do cliente vale nesta data com saldo para este serviço."}{" "}
                {single
                  ? canSell
                    ? "Venda o plano avulso do serviço para agendar."
                    : "Peça a quem vende planos para contratar o plano avulso do serviço."
                  : "Para vender a sessão, cadastre o plano avulso do serviço em Configurações › Planos."}
              </span>
              {single && canSell && patient && (
                <button
                  type="button"
                  className="secondary-button button-sm"
                  disabled={disabled}
                  onClick={() => toggleSelling(single.planTemplateId)}
                >
                  <Plus size={15} aria-hidden="true" />
                  Vender plano avulso
                </button>
              )}
            </li>
          </ul>
        </div>
      )}
      {selling &&
        patient &&
        renderPlanSale &&
        createPortal(
          renderPlanSale({
            patient,
            planTemplateId: selling,
            onClose: () => toggleSelling(null),
            onSaved: (plan) => {
              toggleSelling(null);
              // Recarrega os planos: o novo entra na lista e fica selecionado.
              setState(null);
              onChange(plan.id);
              setAttempt((current) => current + 1);
              onPlanSold?.();
            },
          }),
          document.body,
        )}
    </>
  );
}
