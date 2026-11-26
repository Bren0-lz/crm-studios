import { z } from "zod";

/**
 * Escopos da chave de integração (API externa `/external/v1`): leitura dos dados de vendas
 * e gravação (leads, clientes, inscrições em turma, venda de plano e lista de espera).
 */
export const integrationScopeSchema = z.enum(["sales:read", "sales:write"]);

/**
 * Nome de cada escopo na tela. Diz o alcance real em `/external/v1`
 * (`apps/api/src/modules/external/endpoints.ts`), não só as vendas.
 */
export const integrationScopeLabels: Record<
  z.infer<typeof integrationScopeSchema>,
  string
> = {
  "sales:read": "Consultar dados da clínica",
  "sales:write": "Cadastrar e alterar leads e vendas",
};

/** Descrição curta do que cada escopo libera, exibida junto da permissão em Nova chave. */
export const integrationScopeDescriptions: Record<
  z.infer<typeof integrationScopeSchema>,
  string
> = {
  "sales:read":
    "Vendas, a receber, clientes e seus pagamentos e planos, filiais, serviços, profissionais, turmas, catálogo de planos, leads e lista de espera.",
  "sales:write":
    "Leads (contatos, tarefas e conversão), novos clientes, inscrições em turma, venda de plano e lista de espera.",
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
