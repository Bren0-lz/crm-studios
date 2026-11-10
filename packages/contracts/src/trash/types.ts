import type { z } from "zod";
import type { trashKindSchema, trashPurgeInputSchema } from "./model.js";

export type TrashKind = z.infer<typeof trashKindSchema>;
export type TrashPurgeInput = z.infer<typeof trashPurgeInputSchema>;

/** Item na lixeira de um tópico. */
export interface TrashItem {
  id: string;
  kind: TrashKind;
  /** Nome do cliente/lead ou resumo do atendimento/plano. */
  title: string;
  /** Detalhe curto (ex.: cliente e data do atendimento). */
  detail?: string;
  deletedAt: string;
  deletedByName?: string;
}

/** Registros apagados junto na exclusão definitiva, por tipo. */
export interface TrashImpactItem {
  key: string;
  label: string;
  count: number;
}
export interface TrashImpact {
  id: string;
  kind: TrashKind;
  title: string;
  items: TrashImpactItem[];
  /** Soma dos registros ligados (sem contar o próprio item). */
  total: number;
}
