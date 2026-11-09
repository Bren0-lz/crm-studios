import { type PatientPlan, planSessionProgress } from "@crm/contracts";

/**
 * Barra de sessões do plano: mede as sessões usadas sobre o total contratado, com a legenda
 * "N de M usadas". Plano sem saldo de sessões (recorrente) não tem barra — quem usa mostra o
 * texto do ciclo.
 */
export function PlanProgress({
  plan,
}: {
  plan: Pick<PatientPlan, "kind" | "totalSessions" | "remainingSessions">;
}) {
  const progress = planSessionProgress(plan);
  if (!progress.tracked) return null;
  return (
    <div className="plan-progress">
      <progress
        max={progress.total}
        value={progress.used}
        aria-label="Sessões usadas"
        aria-valuetext={progress.label}
      />
      <span aria-hidden="true">{progress.label}</span>
    </div>
  );
}
