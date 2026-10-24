import { z } from "zod";
import { leadStageSchema } from "../patients/model.js";
import type { Lead } from "./types.js";

/** Nomes padrão das etapas do funil; a clínica pode renomeá-los (permissão crm.stages_manage). */
export const defaultLeadStageLabels: Record<Lead["stage"], string> = {
  new_contact: "Novos",
  contacted: "Em contato",
  evaluation: "Avaliação",
  proposal: "Proposta",
  won: "Ganhos",
  lost: "Perdidos",
};

export const LEAD_STAGE_LABEL_MAX = 40;

export interface LeadStageLabel {
  stage: Lead["stage"];
  label: string;
}

const labelSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da etapa.")
  .max(
    LEAD_STAGE_LABEL_MAX,
    `O nome da etapa deve ter até ${LEAD_STAGE_LABEL_MAX} caracteres.`,
  );

/** Todas as etapas, cada uma uma vez, com nomes distintos (sem diferenciar maiúsculas). */
export const leadStageLabelsInputSchema = z
  .object({
    stages: z
      .array(z.object({ stage: leadStageSchema, label: labelSchema }))
      .length(leadStageSchema.options.length),
  })
  .superRefine((value, ctx) => {
    const stages = new Set(value.stages.map((item) => item.stage));
    if (stages.size !== leadStageSchema.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Envie o nome de cada etapa uma única vez.",
      });
    const seen = new Set<string>();
    value.stages.forEach((item, index) => {
      const key = item.label.toLocaleLowerCase("pt-BR");
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["stages", index, "label"],
          message: "Duas etapas não podem ter o mesmo nome.",
        });
      seen.add(key);
    });
  });
export type LeadStageLabelsInput = z.infer<typeof leadStageLabelsInputSchema>;

/** Nomes de todas as etapas na ordem do funil, usando o padrão onde a clínica não renomeou. */
export function resolveLeadStageLabels(
  saved: Iterable<LeadStageLabel>,
): LeadStageLabel[] {
  const custom = new Map(
    [...saved].map((item) => [item.stage, item.label] as const),
  );
  return leadStageSchema.options.map((stage) => ({
    stage,
    label: custom.get(stage) ?? defaultLeadStageLabels[stage],
  }));
}
