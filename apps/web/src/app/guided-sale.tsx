import {
  GuidedSaleFollowUp,
  GuidedSaleScheduling,
} from "../features/plan-purchase/index";
import type {
  GuidedFollowUpRequest,
  GuidedSchedulingRequest,
} from "../shared/workflows/GuidedSaleContext";

/** Agendamento do avulso e passos finais da venda no cadastro de cliente (RC8). */
export const guidedSale = {
  renderScheduling: (request: GuidedSchedulingRequest) => (
    <GuidedSaleScheduling {...request} />
  ),
  renderFollowUp: (request: GuidedFollowUpRequest) => (
    // Um estágio por vez: o `key` recomeça os passos ao trocar de estágio.
    <GuidedSaleFollowUp key={request.stage} {...request} />
  ),
};
