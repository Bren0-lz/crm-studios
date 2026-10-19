import { DomainError } from "../../repository.js";

/**
 * Reposição só em encontro que ainda não começou e diferente do encontro em que a falta
 * gerou o crédito.
 */
export function assertReplacementTarget(
  sessionId: string,
  sourceSessionId: string,
  startsAt: string | Date,
  now: Date = new Date(),
) {
  if (sessionId === sourceSessionId)
    throw new DomainError(
      "REPLACEMENT_NOT_AVAILABLE",
      "A reposição precisa ser em outro encontro, não no da falta.",
      409,
    );
  if (new Date(startsAt).getTime() <= now.getTime())
    throw new DomainError(
      "REPLACEMENT_NOT_AVAILABLE",
      "Escolha um encontro futuro.",
      409,
    );
}
