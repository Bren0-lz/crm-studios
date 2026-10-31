import { z } from "zod";

/**
 * Escopos da chave de integração (API externa `/external/v1`): leitura dos dados de vendas
 * e gravação (leads, clientes, inscrições em turma, venda de plano e lista de espera).
 */
export const integrationScopeSchema = z.enum(["sales:read", "sales:write"]);

export const integrationScopeLabels: Record<
  z.infer<typeof integrationScopeSchema>,
  string
> = {
  "sales:read": "Ler vendas",
  "sales:write": "Gravar vendas",
};

export const integrationKeyInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Informe um nome com pelo menos 3 caracteres.")
    .max(80, "Use no máximo 80 caracteres no nome."),
  scopes: z
    .array(integrationScopeSchema)
    .min(1, "Escolha pelo menos um escopo.")
    .transform((scopes) => [...new Set(scopes)]),
});

/** Prefixo fixo dos tokens de integração (`crm_<prefixo>_<segredo>`). */
export const INTEGRATION_TOKEN_PREFIX = "crm_";
