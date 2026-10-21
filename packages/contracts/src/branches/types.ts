import type { z } from "zod";
import type { branchInputSchema, userBranchAccessSchema } from "./model.js";

export type BranchInput = z.input<typeof branchInputSchema>;

export type UserBranchAccess = z.infer<typeof userBranchAccessSchema>;

export interface Branch {
  id: string;
  clinicId: string;
  name: string;
  /** Telefone só com dígitos (ver `formatPhone`). */
  phone?: string;
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  /** Sigla da UF. */
  state?: string;
  reference?: string;
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

/** "Rua das Flores, 10 · Sala 2 · Centro · Campinas/SP" (só as partes informadas). */
export function branchAddressLine(branch: Branch) {
  const street = [branch.street, branch.number].filter(Boolean).join(", ");
  const place = [branch.city, branch.state].filter(Boolean).join("/");
  return [street, branch.complement, branch.neighborhood, place]
    .filter(Boolean)
    .join(" · ");
}
