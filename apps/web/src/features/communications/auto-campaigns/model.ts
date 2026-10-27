import {
  autoCampaignBlockedReasonLabels,
  autoCampaignSkipReasonLabels,
  autoCampaignTriggerSchema,
  autoCampaignTriggerTiming,
  type AutoCampaign,
  type AutoCampaignInput,
  type AutoCampaignItem,
  type AutoCampaignItemStatus,
  type AutoCampaignTrigger,
} from "@crm/contracts";

export const autoCampaignTriggers = autoCampaignTriggerSchema.options;

export const autoCampaignStatusLabels: Record<AutoCampaignItemStatus, string> =
  {
    pending: "Pendente",
    sent: "Enviada",
    skipped: "Não enviada",
  };

export const autoCampaignStatusPill: Record<AutoCampaignItemStatus, string> = {
  pending: "in_progress",
  sent: "completed",
  skipped: "cancelled",
};

/** Por que a mensagem não foi enviada: motivo escolhido pela equipe ou apontado pelo sistema. */
export function skippedReason(item: AutoCampaignItem) {
  if (item.blockedReason)
    return autoCampaignBlockedReasonLabels[item.blockedReason];
  const delivery = item.delivery;
  if (!delivery?.skipReason) return "";
  const label = autoCampaignSkipReasonLabels[delivery.skipReason];
  return delivery.note ? `${label}: ${delivery.note}` : label;
}

/** Texto do campo do momento: "dias antes", "dias depois" ou "sessões restantes". */
export function offsetUnit(trigger: AutoCampaignTrigger) {
  const timing = autoCampaignTriggerTiming[trigger];
  return timing === "before"
    ? "dias antes"
    : timing === "after"
      ? "dias depois"
      : "sessões restantes";
}

export interface StepDraft {
  key: string;
  id?: string | undefined;
  offset: string;
  message: string;
}

export interface AutoCampaignDraft {
  name: string;
  trigger: AutoCampaignTrigger;
  active: boolean;
  steps: StepDraft[];
}

let stepKey = 0;
export const newStepKey = () => `step-${++stepKey}`;

export function autoCampaignDraft(campaign?: AutoCampaign): AutoCampaignDraft {
  if (!campaign)
    return {
      name: "",
      trigger: "birthday",
      active: true,
      steps: [{ key: newStepKey(), offset: "0", message: "" }],
    };
  return {
    name: campaign.name,
    trigger: campaign.trigger,
    active: campaign.active,
    // Do momento mais distante para o mais próximo do evento.
    steps: [...campaign.steps]
      .sort((a, b) =>
        autoCampaignTriggerTiming[campaign.trigger] === "after"
          ? a.offset - b.offset
          : b.offset - a.offset,
      )
      .map((step) => ({
        key: newStepKey(),
        id: step.id,
        offset: String(step.offset),
        message: step.message,
      })),
  };
}

export function autoCampaignInput(draft: AutoCampaignDraft): AutoCampaignInput {
  return {
    name: draft.name.trim(),
    trigger: draft.trigger,
    active: draft.active,
    steps: draft.steps.map((step) => ({
      ...(step.id ? { id: step.id } : {}),
      offset: Number(step.offset),
      message: step.message.trim(),
    })),
  };
}
