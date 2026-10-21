import { z } from "zod";
import { phoneDigits } from "../common/model.js";

/** Cabeçalho HTTP com a filial ativa; ausente = todas as filiais que o usuário acessa. */
export const BRANCH_HEADER = "x-branch-id";

/** Siglas das unidades da federação, em ordem alfabética. */
export const brazilianStates = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

/** Partes do endereço da filial; todas opcionais (vazio = não informado). */
export const branchAddressFields = [
  "postalCode",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "reference",
] as const;

export const branchInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /** Só os dígitos, com DDD (10 ou 11); a tela mostra com máscara. */
  phone: z
    .string()
    .transform(phoneDigits)
    .refine((value) => value === "" || value.length >= 10, {
      message: "Informe o telefone com DDD.",
    })
    .optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5}-\d{3})?$/, "Informe o CEP no formato 00000-000.")
    .optional(),
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  neighborhood: optionalText(100),
  city: optionalText(100),
  state: z.enum(brazilianStates).optional().or(z.literal("")),
  reference: optionalText(160),
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
