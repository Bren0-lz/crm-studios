import type { PatientOption, PatientPlan } from "@crm/contracts";
import { createContext, type ReactNode } from "react";

/** Venda de um plano cadastrado ao cliente, aberta de outra tela (ex.: agendamento). */
export interface PlanSaleRequest {
  patient: PatientOption;
  /** Plano cadastrado já escolhido (avulso do serviço). */
  planTemplateId: string;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
}

/**
 * Abre a venda de plano da ficha do cliente. Fornecido pela raiz do app: a agenda não importa
 * a ficha (a contratação de plano já importa a agenda). Ausente = venda indisponível.
 */
export const PlanSaleContext = createContext<
  ((request: PlanSaleRequest) => ReactNode) | null
>(null);
