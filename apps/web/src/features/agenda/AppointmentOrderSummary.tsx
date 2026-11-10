import {
  appointmentSummary,
  withPrefix,
  withQuotedPrefix,
  type AppointmentPricing,
  type AutoCampaignPromotionOffer,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { currency, shortDate, timeLabel } from "../../shared/lib/formatting";

const money = (cents: number) => currency.format(cents / 100);
const completeDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function occurrenceLabel(startsAt: string) {
  if (!completeDateTime.test(startsAt)) return "Data a definir";
  const date = new Date(startsAt);
  return `${shortDate.format(date)}, ${timeLabel.format(date)}`;
}

/**
 * Resumo do agendamento no estilo da sacola do cadastro: o valor de cada atendimento (saldo
 * dos planos do cliente ou plano avulso do serviço), o desconto da campanha marcada — que
 * fica com a 1ª ocorrência — e o valor final.
 */
export function AppointmentOrderSummary({
  patientId,
  serviceId,
  serviceName,
  starts,
  promotion,
  planId,
}: {
  patientId: string;
  serviceId: string;
  serviceName: string;
  /** Datas/horários (aaaa-mm-ddThh:mm) de cada ocorrência, em ordem; "" = a definir. */
  starts: readonly string[];
  promotion?: AutoCampaignPromotionOffer | undefined;
  /** Plano escolhido no agendamento: as sessões saem só dele (AP4). */
  planId?: string | undefined;
}) {
  const first = starts[0] ?? "";
  const startsAt =
    completeDateTime.test(first) && Number.isFinite(new Date(first).getTime())
      ? new Date(first).toISOString()
      : undefined;
  const key = `${patientId}:${serviceId}:${startsAt ?? ""}`;
  const [state, setState] = useState<{
    key: string;
    pricing?: AppointmentPricing;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!patientId || !serviceId) return;
    const requestKey = key;
    let active = true;
    api
      .appointmentPricing(patientId, serviceId, startsAt)
      .then((pricing) => {
        if (!active) return;
        const valid =
          pricing && Array.isArray(pricing.plans) ? pricing : undefined;
        setState(
          valid ? { key: requestKey, pricing: valid } : { key: requestKey },
        );
      })
      .catch(
        () =>
          active &&
          setState({
            key: requestKey,
            error: "Não foi possível calcular os valores do atendimento.",
          }),
      );
    return () => {
      active = false;
    };
  }, [patientId, serviceId, startsAt, key]);
  if (!patientId || !serviceId || starts.length === 0) return null;
  const loaded = state?.key === key ? state : null;
  if (!loaded)
    return (
      <fieldset className="form-fieldset span-2 order-summary">
        <legend>Resumo do atendimento</legend>
        <LoadingBlock />
      </fieldset>
    );
  if (!loaded.pricing && !loaded.error) return null;
  if (!loaded.pricing)
    return (
      <fieldset className="form-fieldset span-2 order-summary">
        <legend>Resumo do atendimento</legend>
        <ErrorBanner error={loaded.error ?? ""} />
      </fieldset>
    );
  const pricing =
    planId === undefined
      ? loaded.pricing
      : {
          ...loaded.pricing,
          plans: loaded.pricing.plans.filter((plan) => plan.planId === planId),
        };
  const summary = appointmentSummary({ starts, pricing, promotion });
  const several = summary.lines.length > 1;
  const campaign = promotion
    ? withQuotedPrefix("campanha", promotion.campaignName)
    : "";
  const firstPlan = summary.lines[0]?.planName;
  return (
    <fieldset className="form-fieldset span-2 order-summary">
      <legend>Resumo do atendimento</legend>
      <ul className="order-lines" aria-label="Atendimentos do resumo">
        {summary.lines.map((line) => (
          <li key={line.index}>
            <div className="order-line">
              <span>
                <strong>
                  {serviceName}
                  {several ? ` · ${line.index + 1}ª sessão` : ""}
                </strong>
                <span className="muted-copy">
                  {occurrenceLabel(line.startsAt)} ·{" "}
                  {line.source === "plan"
                    ? `Saldo do ${withPrefix("plano", line.planName ?? "")}`
                    : line.source === "single"
                      ? `Avulso: ${line.planName}`
                      : "Sem plano avulso com valor para este serviço"}
                </span>
              </span>
              <span className="numeric-value">{money(line.valueInCents)}</span>
            </div>
            {line.discountInCents > 0 && (
              <div className="order-line order-discount">
                <span>Desconto da {campaign}</span>
                <span className="numeric-value">
                  − {money(line.discountInCents)}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {summary.discountNotApplicable && (
        <p className="muted-copy">
          O desconto da {campaign} não vale para{" "}
          {firstPlan
            ? `o ${withPrefix("plano", firstPlan)}`
            : "atendimento sem plano"}
          .
        </p>
      )}
      <dl className="order-totals">
        <div>
          <dt>Subtotal</dt>
          <dd className="numeric-value">{money(summary.subtotalInCents)}</dd>
        </div>
        {summary.discountInCents > 0 && (
          <div className="order-discount">
            <dt>Desconto da campanha</dt>
            <dd className="numeric-value">
              − {money(summary.discountInCents)}
            </dd>
          </div>
        )}
        <div className="order-total">
          <dt>Total</dt>
          <dd className="numeric-value">{money(summary.totalInCents)}</dd>
        </div>
      </dl>
      <p className="muted-copy">
        {several && promotion?.discount
          ? "A campanha vale só na 1ª sessão. "
          : ""}
        Sessões do saldo de um plano usam o valor por sessão do plano; as demais
        seguem o plano avulso do serviço.
      </p>
    </fieldset>
  );
}
