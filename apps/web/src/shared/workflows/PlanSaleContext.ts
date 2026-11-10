import type { PatientOption, PatientPlan } from "@crm/contracts";
import { createContext, type ReactNode } from "react";

/**
 * Venda de um plano cadastrado ao cliente, aberta de outra tela: o avulso do serviço no
 * agendamento, ou o recorrente com a turma na matrícula pela Lista de espera (TW3).
 */
export interface PlanSaleRequest {
  patient: PatientOption;
  /** Catálogo mostrado; padrão `single` (avulso do agendamento). */
  kind?: "single" | "recurring";
  /** Plano cadastrado já escolhido (avulso do serviço). */
  planTemplateId?: string;
  /** Só planos cadastrados que incluem o serviço. */
  initialServiceId?: string;
  /** Turma já escolhida quando o plano cobre o serviço dela. */
  initialGroupId?: string;
  onClose: () => void;
  /** `notice`: aviso da matrícula na turma, quando houver. */
  onSaved: (plan: PatientPlan, notice?: string) => void;
}

/**
 * Abre a venda de plano da ficha do cliente. Fornecido pela raiz do app: a agenda não importa
 * a ficha (a contratação de plano já importa a agenda). Ausente = venda indisponível.
 */
export const PlanSaleContext = createContext<
  ((request: PlanSaleRequest) => ReactNode) | null
>(null);
