import type { Appointment } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "./ErrorBanner";
import { shortDate } from "../lib/formatting";

/**
 * Aviso "Já tem aula experimental" (EX2): experimental repetida não é bloqueada, só avisada.
 * Sem cliente/lead escolhido ou sem histórico, não mostra nada.
 */
export function TrialHistoryHint({
  patientId = "",
  leadId = "",
}: {
  patientId?: string | undefined;
  leadId?: string | undefined;
}) {
  const key = patientId
    ? `patient:${patientId}`
    : leadId
      ? `lead:${leadId}`
      : "";
  const [state, setState] = useState<{
    key: string;
    trials: Appointment[];
    error: string;
  }>({ key: "", trials: [], error: "" });
  useEffect(() => {
    if (!patientId && !leadId) return;
    let active = true;
    const current = patientId ? `patient:${patientId}` : `lead:${leadId}`;
    api
      .trialAppointments(patientId ? { patientId } : { leadId })
      .then((trials) => {
        if (active) setState({ key: current, trials, error: "" });
      })
      .catch((cause: Error) => {
        if (active)
          setState({ key: current, trials: [], error: cause.message });
      });
    return () => {
      active = false;
    };
  }, [patientId, leadId]);
  if (!key || state.key !== key) return null;
  if (state.error)
    return (
      <div className="span-2">
        <ErrorBanner
          error={`Não foi possível conferir experimentais anteriores: ${state.error}`}
        />
      </div>
    );
  if (state.trials.length === 0) return null;
  const items = state.trials
    .map(
      (item) =>
        `${item.serviceName} em ${shortDate.format(new Date(item.startsAt))}`,
    )
    .join("; ");
  return (
    <p className="field-hint span-2" role="status">
      Já tem aula experimental: {items}
    </p>
  );
}
