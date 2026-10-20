import type { z } from "zod";
import type { branchInputSchema, userBranchAccessSchema } from "./model.js";

export type BranchInput = z.input<typeof branchInputSchema>;

export type UserBranchAccess = z.infer<typeof userBranchAccessSchema>;

export interface Branch {
  id: string;
  clinicId: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  /** Filial que recebe o que é gravado sem filial; não pode ser desativada. */
  isDefault: boolean;
}

/**
 * Filtro de filiais de uma leitura: `null` = todas da rede (consolidado), lista = só essas.
 * Gravações usam `writeBranchId` (ausente = filial padrão da clínica).
 */
export interface BranchScope {
  branchIds: string[] | null;
  writeBranchId?: string;
}

/** Entidade que pertence a uma filial. */
export function inBranchScope(
  scope: BranchScope | undefined,
  item: { branchId?: string },
) {
  return (
    !scope?.branchIds ||
    (item.branchId !== undefined && scope.branchIds.includes(item.branchId))
  );
}
