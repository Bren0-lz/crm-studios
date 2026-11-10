import { z } from "zod";
import { commissionTermsSchema } from "./model.js";
import type { CommissionRuleSnapshot } from "./types.js";

/** Impressão digital da prévia do recálculo: o salvamento recusa se as comissões mudaram. */
export const commissionRecalculationDigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/);

/**
 * Campo opcional do corpo das rotas que gravam regras de comissão: a prévia confirmada na tela.
 * Sem ele, o recálculo é feito assim mesmo, sem conferir a prévia.
 */
export const commissionRecalculationConfirmationSchema = z.object({
  recalculationDigest: commissionRecalculationDigestSchema.optional(),
});

/**
 * Prévia do recálculo retroativo (`POST /finance/commission-rules/recalculation/preview`):
 * as regras que serão gravadas para um profissional ou para um usuário, sem gravar nada.
 */
export const commissionRecalculationPreviewInputSchema = z
  .object({
    professionalId: z.uuid().optional(),
    userId: z.uuid().optional(),
    rules: z.array(commissionTermsSchema).min(1).max(51),
  })
  .refine((value) => Boolean(value.professionalId) !== Boolean(value.userId), {
    message: "Informe o profissional ou o usuário da regra.",
    path: ["professionalId"],
  });
export type CommissionRecalculationPreviewInput = z.infer<
  typeof commissionRecalculationPreviewInputSchema
>;

/**
 * Comissão alcançada pela regra nova. `update`: comissão em aberto, sem ajuste nem despesa
 * vinculada, recebe o valor novo direto. `adjustment`: comissão paga (ou já conciliada/
 * vinculada a despesa) mantém o valor e ganha um ajuste com a diferença para o próximo
 * pagamento do profissional.
 */
export interface CommissionRecalculationItem {
  commissionId: string;
  professionalId: string;
  professionalName: string;
  competence: string;
  /** Dia do atendimento/presença no fuso da clínica (`aaaa-mm-dd`). */
  sourceDate: string;
  status: "open" | "paid";
  mode: "update" | "adjustment";
  /** Valor atual: comissão + ajustes já lançados para o profissional. */
  previousAmountInCents: number;
  amountInCents: number;
  differenceInCents: number;
  ruleSnapshot: CommissionRuleSnapshot;
}

export interface CommissionRecalculationPreview {
  /** Início da regra mais antiga gravada. */
  from: string;
  /** Fim da vigência ou hoje (fuso da clínica), o que vier antes. */
  until: string;
  items: CommissionRecalculationItem[];
  /** Soma das diferenças (abertas + ajustes). */
  differenceInCents: number;
  /** Parte da diferença que vira ajuste de comissão já paga. */
  adjustmentInCents: number;
  digest: string;
}
