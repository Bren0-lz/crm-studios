/** Prefixo público das rotas da API no mesmo domínio do site. */
export const apiPrefix = "/api";

export function isApiPath(url: string) {
  return (
    url === apiPrefix ||
    url.startsWith(`${apiPrefix}/`) ||
    url.startsWith(`${apiPrefix}?`)
  );
}

/** Remove o prefixo `/api` para casar com as rotas registradas no Fastify. */
export function stripApiPrefix(url: string) {
  if (!isApiPath(url)) return url;
  const rest = url.slice(apiPrefix.length);
  return rest.startsWith("/") ? rest : `/${rest}`;
}
