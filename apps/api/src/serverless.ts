import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Entrada da função serverless. Carrega a aplicação com `import()` dinâmico para que um
 * erro na inicialização (variável de ambiente inválida, banco inacessível…) vire uma
 * resposta JSON com o motivo, em vez da página genérica "A server error has occurred" da
 * Vercel, que o site não consegue ler. O detalhe completo vai para o log da função.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const { default: appHandler } =
      await import("./infrastructure/serverless-app.js");
    await appHandler(req, res);
  } catch (error) {
    console.error("Falha ao iniciar a API:", error);
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        code: "SERVER_START_FAILED",
        message: `A API não conseguiu iniciar: ${describeStartupError(error)}`,
      }),
    );
  }
}

/** Mensagem legível sem expor valores: o zod lista só o nome da variável e a regra violada. */
export function describeStartupError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return (error.issues as { path?: unknown[]; message?: string }[])
      .map(
        (issue) =>
          `${(issue.path ?? []).join(".") || "configuração"}: ${issue.message ?? "inválido"}`,
      )
      .join("; ");
  }
  const message = error instanceof Error ? error.message : String(error);
  // Mensagens do driver do banco podem trazer a URL de conexão; nunca devolva a senha.
  return message.replace(/mysql:\/\/[^\s@]+@/gi, "mysql://***@");
}
