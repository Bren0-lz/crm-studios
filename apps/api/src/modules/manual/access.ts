import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const configuration = z.object({
  MCP_PUBLIC_ORIGIN: z.string().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  }),
  MCP_ACCESS_TOKEN_SHA256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ManualAccessConfig = z.infer<typeof configuration>;
export function manualAccessFromEnv(): ManualAccessConfig | undefined {
  // Configuração incompleta ou inválida desliga só o MCP, sem impedir o CRM de subir.
  const result = configuration.safeParse(process.env);
  return result.success ? result.data : undefined;
}

/** Um token exclusivo do piloto, sem vínculo com usuários, JWT ou banco do CRM. */
export function createManualAccess(config: ManualAccessConfig) {
  const expected = Buffer.from(config.MCP_ACCESS_TOKEN_SHA256, "hex");
  let windowStart = Date.now();
  let requests = 0;
  return {
    resource: `${config.MCP_PUBLIC_ORIGIN}/api/mcp`,
    authenticate(header: string | undefined) {
      if (!header?.startsWith("Bearer ")) return false;
      const token = header.slice(7);
      if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) return false;
      return timingSafeEqual(
        createHash("sha256").update(token).digest(),
        expected,
      );
    },
    allow() {
      if (Date.now() - windowStart >= 60_000) {
        requests = 0;
        windowStart = Date.now();
      }
      return ++requests <= 120;
    },
  };
}
