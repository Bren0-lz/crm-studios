import type {
  Appointment,
  IssuedDocument,
  PatientPlan,
  PatientPlanInput,
  PlanPurchaseInput,
} from "@crm/contracts";
import { createContext, type ReactNode } from "react";

/** Sessões do avulso escolhidas no cadastro guiado (reservadas junto com o cadastro). */
export interface GuidedSchedulingRequest {
  /** Termos do avulso do bloco (o cliente ainda não existe: `patientId` vazio). */
  plan: PatientPlanInput;
  appointments: PlanPurchaseInput["appointments"];
  onChange: (appointments: PlanPurchaseInput["appointments"]) => void;
  onNestedChange: (open: boolean) => void;
  /** Motivo que impede concluir o cadastro (sessões em conflito…); vazio = liberado. */
  onBlockedChange: (message: string) => void;
}

/** Plano vendido no cadastro guiado, com o contrato emitido e as sessões reservadas. */
export interface GuidedSaleItem {
  plan: PatientPlan;
  document?: IssuedDocument | undefined;
  appointments?: Appointment[] | undefined;
}

/**
 * Passos finais do cadastro guiado: `send` (link de cada contrato e horários pelo WhatsApp)
 * e, depois da cobrança Pix, `payment` ("O cliente já fez o pagamento?" e recibo).
 */
export interface GuidedFollowUpRequest {
  stage: "send" | "payment";
  patientName: string;
  sales: GuidedSaleItem[];
  onDone: () => void;
}

/**
 * Agendamento e passos finais da venda no cadastro de cliente. Fornecido pela raiz do app: o
 * cadastro não importa a contratação de plano (que importa a agenda, que abre o cadastro).
 * Ausente = cadastro sem agendamento nem passos finais.
 */
export const GuidedSaleContext = createContext<{
  renderScheduling: (request: GuidedSchedulingRequest) => ReactNode;
  renderFollowUp: (request: GuidedFollowUpRequest) => ReactNode;
} | null>(null);
