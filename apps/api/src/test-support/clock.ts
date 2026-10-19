import type { UserSummary } from "@crm/contracts";
import { vi } from "vitest";
import type { TestApp } from "./legacy-fixtures.js";

/**
 * Executa `run` com o relógio (só `Date`) parado em `instant` e devolve o relógio como estava.
 * Realizado/falta e evolução só valem a partir de 15 min antes do início do atendimento,
 * então testes com atendimentos em datas futuras registram o desfecho "depois" do início.
 */
export async function atInstant<T>(
  instant: string,
  run: () => Promise<T>,
): Promise<T> {
  const alreadyFake = vi.isFakeTimers();
  const previous = Date.now();
  if (!alreadyFake) vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
  try {
    return await run();
  } finally {
    if (alreadyFake) vi.setSystemTime(previous);
    else vi.useRealTimers();
  }
}

/** Reemite o token do cabeçalho no relógio atual (o login expira em 8h). */
export function reissuedHeaders(
  app: TestApp,
  headers: { authorization: string },
): { authorization: string } {
  const decoded = app.jwt.decode<{
    sub: string;
    clinicId: string;
    role: UserSummary["role"];
    sessionVersion?: number;
  }>(headers.authorization.replace(/^Bearer /, ""));
  if (!decoded) throw new Error("Token de teste inválido.");
  const { sub, clinicId, role, sessionVersion } = decoded;
  return {
    authorization: `Bearer ${app.jwt.sign({ sub, clinicId, role, ...(sessionVersion === undefined ? {} : { sessionVersion }) })}`,
  };
}

/** PATCH de status do atendimento com o relógio em `instant` (após o início). */
export function patchStatusAt(
  app: TestApp,
  headers: { authorization: string },
  instant: string,
  appointmentId: string,
  payload: { status: string; absenceReason?: string },
) {
  return atInstant(instant, () =>
    app.inject({
      method: "PATCH",
      url: `/appointments/${appointmentId}/status`,
      headers: reissuedHeaders(app, headers),
      payload,
    }),
  );
}
