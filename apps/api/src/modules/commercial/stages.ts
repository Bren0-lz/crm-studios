import { withQuotedPrefix } from "@crm/contracts";
import {
  LEAD_WON_STAGE,
  type LeadStageConfig,
  type LeadStagesInput,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../repository.js";

export interface LeadStagesPlan {
  /** Funil salvo, na ordem, com as chaves definitivas. */
  stages: Array<{ stage: string; label: string; color?: string }>;
  /** Etapas que precisam estar sem leads: removidas ou escolhidas como final. */
  mustBeEmpty: Array<{
    stage: string;
    label: string;
    reason: "removed" | "final";
  }>;
}

const newStageKey = () =>
  `stage_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

/**
 * Traduz o funil enviado em chaves. A etapa final sempre usa a chave `won` (onde estão os
 * leads convertidos): escolher outra etapa como final passa a chave para ela, e a antiga
 * etapa final vira uma etapa aberta com chave nova, vazia. Assim nenhum lead muda de chave.
 */
export function planLeadStages(
  current: readonly LeadStageConfig[],
  input: LeadStagesInput,
  newKey: () => string = newStageKey,
): LeadStagesPlan {
  const known = new Map(current.map((item) => [item.stage, item]));
  for (const item of input.stages)
    if (item.stage && !known.has(item.stage))
      throw new DomainError(
        "LEAD_STAGE_NOT_FOUND",
        "Etapa do funil não encontrada. Recarregue a página e tente de novo.",
        409,
      );
  const explicit = input.stages.findIndex((item) => item.final);
  const finalIndex =
    explicit >= 0
      ? explicit
      : input.stages.findIndex((item) => item.stage === LEAD_WON_STAGE);
  const mustBeEmpty: LeadStagesPlan["mustBeEmpty"] = [];
  const stages = input.stages.map((item, index) => {
    const color =
      item.color ?? (item.stage ? known.get(item.stage)?.color : undefined);
    const colorEntry = color ? { color } : {};
    if (index === finalIndex) {
      if (item.stage && item.stage !== LEAD_WON_STAGE)
        mustBeEmpty.push({
          stage: item.stage,
          label: known.get(item.stage)!.label,
          reason: "final",
        });
      return { stage: LEAD_WON_STAGE, label: item.label, ...colorEntry };
    }
    return {
      stage:
        item.stage && item.stage !== LEAD_WON_STAGE ? item.stage : newKey(),
      label: item.label,
      ...colorEntry,
    };
  });
  const kept = new Set(input.stages.map((item) => item.stage));
  for (const item of current)
    if (item.stage !== LEAD_WON_STAGE && !kept.has(item.stage))
      mustBeEmpty.push({
        stage: item.stage,
        label: item.label,
        reason: "removed",
      });
  return { stages, mustBeEmpty };
}

/** Erro de etapa com leads (removida ou escolhida como final). */
export function stageNotEmptyError(
  item: LeadStagesPlan["mustBeEmpty"][number],
  leads: number,
) {
  const count = leads === 1 ? "1 lead" : `${leads} leads`;
  return new DomainError(
    "LEAD_STAGE_NOT_EMPTY",
    item.reason === "removed"
      ? `A ${withQuotedPrefix("etapa", item.label, ['"', '"'])} tem ${count}. Mova-os para outra etapa antes de removê-la.`
      : `A ${withQuotedPrefix("etapa", item.label, ['"', '"'])} tem ${count} em aberto. Mova-os para outra etapa antes de torná-la a etapa final.`,
    409,
  );
}

export function stageNotFoundError() {
  return new DomainError(
    "LEAD_STAGE_NOT_FOUND",
    "Etapa do funil não encontrada.",
    400,
  );
}
