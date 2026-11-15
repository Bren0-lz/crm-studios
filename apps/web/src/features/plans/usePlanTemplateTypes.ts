import type { PatientPlan, PlanType } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";

/**
 * Tipo do catálogo ("Plano trimestral", "Plano mensal"…) de cada modelo de plano, para o
 * cartão do plano contratado mostrar o tipo escolhido no cadastro, e não o `kind` derivado.
 * Falha ao carregar o catálogo não bloqueia a tela: o cartão segue com o rótulo do `kind`.
 */
export function usePlanTemplateTypes(enabled: boolean) {
  const [types, setTypes] = useState<ReadonlyMap<string, PlanType>>(
    () => new Map(),
  );
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api.planTemplates().then(
      (templates) => {
        if (!active || !Array.isArray(templates)) return;
        setTypes(
          new Map(
            templates.flatMap((item) =>
              item.planType ? [[item.id, item.planType] as const] : [],
            ),
          ),
        );
      },
      () => {
        /* Sem catálogo, o cartão mostra o rótulo do `kind`. */
      },
    );
    return () => {
      active = false;
    };
  }, [enabled]);
  return (plan: Pick<PatientPlan, "planTemplateId">) =>
    plan.planTemplateId ? types.get(plan.planTemplateId) : undefined;
}
