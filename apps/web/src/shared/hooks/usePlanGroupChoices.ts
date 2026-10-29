import type { GroupClass } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { groupOperationRange } from "../lib/formatting";
import type { GroupChoices } from "../workflows/types";

/**
 * Turmas para a contratação de plano (matrícula na mesma operação). `undefined` quando o
 * usuário não pode matricular: aí a turma fica para depois e não é exigida.
 */
export function usePlanGroupChoices(
  enabled: boolean,
): GroupChoices | undefined {
  const [items, setItems] = useState<GroupClass[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const dates = groupOperationRange();
    api
      .groupWorkspace(dates.from, dates.to)
      .then((data) => {
        // Resposta fora do formato conta como sem turmas.
        if (active) setItems(Array.isArray(data?.groups) ? data.groups : []);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);
  if (!enabled) return undefined;
  return {
    items,
    error,
    retry: () => {
      setError("");
      setItems(null);
      setAttempt((value) => value + 1);
    },
  };
}
