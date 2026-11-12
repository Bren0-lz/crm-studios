import { z } from "zod";
import { defaultLeadStageKeys, leadStageSchema } from "../patients/model.js";
import type { Lead } from "./types.js";

/** Etapa final do funil: o lead só chega nela pela conversão em cliente. */
export const LEAD_WON_STAGE = "won";
/** Etapa de perda: pede o motivo e não pode ser removida. */
export const LEAD_LOST_STAGE = "lost";
export const LEAD_STAGE_LABEL_MAX = 40;
export const LEAD_STAGES_MAX = 15;

export type LeadStageKind = "open" | "won" | "lost";
export interface LeadStageConfig {
  stage: Lead["stage"];
  label: string;
  kind: LeadStageKind;
  color?: string;
}

/** Nomes padrão das etapas do funil (clínica que ainda não editou o funil). */
export const defaultLeadStageLabels: Readonly<
  Record<(typeof defaultLeadStageKeys)[number], string>
> = {
  new_contact: "Novos",
  contacted: "Em contato",
  evaluation: "Avaliação",
  proposal: "Proposta",
  won: "Ganhos",
  lost: "Perdidos",
};

/** Cor padrão de etapa sem cor própria. */
export const DEFAULT_LEAD_STAGE_COLOR = "#8a948f";

/** Cores padrão da bolinha de cada etapa inicial do funil. */
export const defaultLeadStageColors: Readonly<
  Record<(typeof defaultLeadStageKeys)[number], string>
> = {
  new_contact: "#8a948f",
  contacted: "#3f7cc0",
  evaluation: "#8a62b8",
  proposal: "#c8901f",
  won: "#26705f",
  lost: "#b5544a",
};

/** Paleta sugerida ao escolher a cor da bolinha da etapa no funil. */
export const leadStagePalette = [
  { name: "Cinza", color: "#8a948f" },
  { name: "Azul", color: "#3f7cc0" },
  { name: "Roxo", color: "#8a62b8" },
  { name: "Âmbar", color: "#c8901f" },
  { name: "Verde", color: "#26705f" },
  { name: "Terracota", color: "#b5544a" },
  { name: "Turquesa", color: "#0d9488" },
  { name: "Rosa", color: "#db2777" },
  { name: "Laranja", color: "#ea580c" },
] as const;

export const leadStageColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.")
  .transform((value) => value.toLowerCase());

/** Cor exibida na bolinha da etapa: a escolhida para a etapa ou a padrão da chave. */
export function leadStageColor(stage: {
  stage?: string | undefined;
  color?: string | null | undefined;
}): string {
  if (typeof stage.color === "string" && /^#[0-9a-f]{6}$/i.test(stage.color))
    return stage.color.toLowerCase();
  if (stage.stage && stage.stage in defaultLeadStageColors)
    return defaultLeadStageColors[
      stage.stage as keyof typeof defaultLeadStageColors
    ];
  return DEFAULT_LEAD_STAGE_COLOR;
}

export function leadStageKind(stage: string): LeadStageKind {
  return stage === LEAD_WON_STAGE
    ? "won"
    : stage === LEAD_LOST_STAGE
      ? "lost"
      : "open";
}

/** Etapas da clínica na ordem; sem configuração salva, as padrão. */
export function resolveLeadStages(
  saved: Iterable<{
    stage: string;
    label: string;
    color?: string | null | undefined;
  }>,
): LeadStageConfig[] {
  const items = [...saved];
  const source = items.length
    ? items
    : defaultLeadStageKeys.map((stage) => ({
        stage,
        label: defaultLeadStageLabels[stage],
        color: undefined,
      }));
  return source.map(({ stage, label, color }) => ({
    stage,
    label,
    kind: leadStageKind(stage),
    ...(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ? { color: color.toLowerCase() }
      : {}),
  }));
}

/** Primeira etapa aberta: onde entram os leads novos. */
export function firstOpenLeadStage(stages: readonly LeadStageConfig[]) {
  return stages.find((item) => item.kind === "open")?.stage ?? "new_contact";
}

const labelSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da etapa.")
  .max(
    LEAD_STAGE_LABEL_MAX,
    `O nome da etapa deve ter até ${LEAD_STAGE_LABEL_MAX} caracteres.`,
  );

/**
 * Funil completo, na ordem. Etapa sem `stage` é nova. `final` escolhe a etapa de ganhos
 * (sem nenhuma marcada, continua a atual). A etapa de perdidos precisa continuar na lista.
 */
export const leadStagesInputSchema = z
  .object({
    stages: z
      .array(
        z.object({
          stage: leadStageSchema.optional(),
          label: labelSchema,
          color: leadStageColorSchema.optional(),
          final: z.boolean().optional(),
        }),
      )
      .min(
        3,
        "O funil precisa de pelo menos uma etapa aberta, ganhos e perdidos.",
      )
      .max(LEAD_STAGES_MAX, `O funil pode ter até ${LEAD_STAGES_MAX} etapas.`),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string, path: (string | number)[] = ["stages"]) =>
      ctx.addIssue({ code: "custom", path, message });
    const keys = value.stages.flatMap((item) =>
      item.stage ? [item.stage] : [],
    );
    if (new Set(keys).size !== keys.length)
      issue("Envie cada etapa uma única vez.");
    const finals = value.stages.filter((item) => item.final);
    if (finals.length > 1) issue("Escolha uma única etapa final.");
    const final =
      finals[0] ?? value.stages.find((item) => item.stage === LEAD_WON_STAGE);
    if (!final) issue("Escolha a etapa final do funil.");
    const lost = value.stages.find((item) => item.stage === LEAD_LOST_STAGE);
    if (!lost) issue("A etapa de perdidos não pode ser removida.");
    else if (lost === final)
      issue("A etapa de perdidos não pode ser a etapa final.");
    if (!value.stages.some((item) => item !== final && item !== lost))
      issue("O funil precisa de pelo menos uma etapa aberta.");
    const seen = new Set<string>();
    value.stages.forEach((item, index) => {
      const key = item.label.toLocaleLowerCase("pt-BR");
      if (seen.has(key))
        issue("Duas etapas não podem ter o mesmo nome.", [
          "stages",
          index,
          "label",
        ]);
      seen.add(key);
    });
  });
export type LeadStagesInput = z.infer<typeof leadStagesInputSchema>;
