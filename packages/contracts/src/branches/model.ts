import { z } from "zod";

/** Cabeçalho HTTP com a filial ativa; ausente = todas as filiais que o usuário acessa. */
export const BRANCH_HEADER = "x-branch-id";

export const branchInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  active: z.boolean().default(true),
});

/**
 * Filiais que um usuário comum acessa: todas, ou a lista (pelo menos uma). Admin sempre acessa
 * todas e ignora a lista.
 */
export const userBranchAccessSchema = z
  .object({
    allBranches: z.boolean(),
    branchIds: z.array(z.uuid()).max(100).default([]),
  })
  .refine((value) => value.allBranches || value.branchIds.length > 0, {
    message: "Selecione ao menos uma filial.",
    path: ["branchIds"],
  });
