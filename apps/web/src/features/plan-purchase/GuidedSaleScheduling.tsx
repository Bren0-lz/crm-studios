import type { Service } from "@crm/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import type { GuidedSchedulingRequest } from "../../shared/workflows/GuidedSaleContext";
import { PlanPurchaseOptions } from "./PlanPurchaseOptions";

/**
 * Sessões do avulso no cadastro de cliente: o mesmo "Agendar sessões" do Novo plano avulso,
 * reservadas junto com o cadastro.
 */
export function GuidedSaleScheduling({
  plan,
  appointments,
  onChange,
  onNestedChange,
  onBlockedChange,
}: GuidedSchedulingRequest) {
  const [services, setServices] = useState<Service[] | null>(null);
  // Funções estáveis: o agendamento avisa o bloqueio em efeito (mudar a função a cada
  // renderização do cadastro faria o aviso ir e voltar sem parar).
  const latest = useRef({ onChange, onNestedChange, onBlockedChange });
  useEffect(() => {
    latest.current = { onChange, onNestedChange, onBlockedChange };
  });
  const blockedChange = useCallback(
    (message: string) => latest.current.onBlockedChange(message),
    [],
  );
  const nestedChange = useCallback(
    (open: boolean) => latest.current.onNestedChange(open),
    [],
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .services()
      .then((items) => alive && setServices(items))
      .catch((cause: Error) => alive && setError(cause.message));
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return (
      <div className="span-2">
        <ErrorBanner
          error={`Não foi possível carregar o agendamento: ${error}`}
        />
      </div>
    );
  if (!services || !plan.planTemplateId || !plan.services.length) return null;
  return (
    <PlanPurchaseOptions
      plan={plan}
      patients={[]}
      services={services}
      value={{ appointments }}
      onChange={(value) => latest.current.onChange(value.appointments)}
      onNestedChange={nestedChange}
      onBlockedChange={blockedChange}
    />
  );
}
