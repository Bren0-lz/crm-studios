import { INTEGRATION_TOKEN_PREFIX } from "@crm/contracts";
import { createHash, randomBytes } from "node:crypto";

/** Hash guardado no banco: o token em si nunca é gravado. */
export function hashIntegrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Token novo `crm_<8 hex>_<segredo>`; o prefixo (`crm_<8 hex>`) identifica a chave na lista. */
export function generateIntegrationToken() {
  const prefix = `${INTEGRATION_TOKEN_PREFIX}${randomBytes(4).toString("hex")}`;
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { token, prefix, tokenHash: hashIntegrationToken(token) };
}
