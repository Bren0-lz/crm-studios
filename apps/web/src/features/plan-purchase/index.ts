// Contratação de plano com sessões agendadas (dias fixos, resumo com conflitos, exceções e
// envio pelo WhatsApp). Fica fora de `plans` porque usa a agenda, que usa o cadastro de
// clientes: dentro de `plans/index.ts` fecharia um ciclo com `patients`.
export {
  PlanPurchaseOptions,
  type PurchaseOptions,
} from "./PlanPurchaseOptions";
export { PlanSessionsSentStep } from "./PlanSessionsSentStep";
