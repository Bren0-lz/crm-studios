import {
  autoCampaignBlockedReasonLabels,
  autoCampaignSkipReasonLabels,
  autoCampaignTriggerSchema,
  autoCampaignTriggerTiming,
  autoCampaignTriggerVariables,
  type AutoCampaign,
  type AutoCampaignInput,
  type AutoCampaignItem,
  type AutoCampaignItemStatus,
  type AutoCampaignTrigger,
} from "@crm/contracts";

export const autoCampaignTriggers = autoCampaignTriggerSchema.options;

/** Rótulo e exemplo de cada código das campanhas automáticas (etiquetas verdes do editor). */
const autoCampaignVariableInfo: Record<
  string,
  { label: string; example: string }
> = {
  nome: { label: "Nome", example: "Maria" },
  nome_completo: { label: "Nome completo", example: "Maria Souza" },
  data: { label: "Data", example: "23/10" },
  idade: { label: "Idade", example: "35" },
  hora: { label: "Hora", example: "09:00" },
  servico: { label: "Serviço", example: "Pilates" },
  plano: { label: "Plano", example: "Pilates 2x semana" },
  sessoes: { label: "Sessões", example: "2 sessões" },
  parcelas: { label: "Parcelas", example: "2 parcelas" },
  nota: { label: "Nota", example: "5" },
};

/**
 * Códigos oferecidos no editor para o evento: `{{nome}}`, `{{nome_completo}}` e os do
 * evento. Um array por evento, sempre o mesmo (o editor pede `variables` estável).
 */
export const autoCampaignEditorVariables = Object.fromEntries(
  autoCampaignTriggerSchema.options.map((trigger) => [
    trigger,
    ["nome", "nome_completo", ...autoCampaignTriggerVariables[trigger]].map(
      (name) => ({
        code: `{{${name}}}`,
        label: autoCampaignVariableInfo[name]?.label ?? name,
        example: autoCampaignVariableInfo[name]?.example ?? name,
      }),
    ),
  ]),
) as Record<
  AutoCampaignTrigger,
  { code: string; label: string; example: string }[]
>;

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
