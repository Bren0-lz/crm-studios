import type { z } from "zod";
import type { integrationKeyInputSchema, integrationScopeSchema } from "./model.js";

export type IntegrationScope = z.infer<typeof integrationScopeSchema>;
export type IntegrationKeyInput = z.infer<typeof integrationKeyInputSchema>;

/** Chave de integração sem o segredo (só o hash fica guardado). */
export interface IntegrationKey {
  id: string;
  name: string;
  /** Início visível do token, para reconhecer a chave na lista. */
  prefix: string;
  scopes: IntegrationScope[];
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

/** Resposta da criação: o token completo aparece só aqui, uma única vez. */
export interface IntegrationKeyCreated {
  key: IntegrationKey;
  token: string;
}
