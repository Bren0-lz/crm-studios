/**
 * Limite de requisições em memória com janela deslizante, no mesmo espírito do bloqueio de
 * tentativas de login. Vale por instância da API: em ambiente serverless (Vercel) cada
 * instância conta à parte, então é uma proteção parcial; um limite global exigiria banco/Redis.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  /** Descarta as chaves sem acesso dentro da janela, para o mapa não crescer sem fim. */
  function sweep(at: number) {
    if (at - lastSweep < windowMs) return;
    lastSweep = at;
    for (const [key, times] of hits)
      if (!times.length || times[times.length - 1]! <= at - windowMs)
        hits.delete(key);
  }

  return {
    /** Conta o acesso; se estourou o limite, devolve em quantos segundos tentar de novo. */
    hit(
      key: string,
    ): { allowed: true } | { allowed: false; retryAfter: number } {
      const at = now();
      sweep(at);
      const recent = (hits.get(key) ?? []).filter(
        (time) => time > at - windowMs,
      );
      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          retryAfter: Math.max(
            1,
            Math.ceil((recent[0]! + windowMs - at) / 1000),
          ),
        };
      }
      recent.push(at);
      hits.set(key, recent);
      return { allowed: true };
    },
  };
}
