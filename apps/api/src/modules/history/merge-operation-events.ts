import type { AdminAuditEvent } from "@crm/contracts";

/** Distância máxima entre o registro da operação e o do domínio do mesmo comando. */
const PAIR_WINDOW_MS = 10_000;

const isOperation = (event: AdminAuditEvent) =>
  event.action.startsWith("operation.");

/**
 * Cada comando gera dois registros: o da operação na API ("Ação realizada: …", com o
 * responsável) e o do domínio ("Cliente cadastrado", gravado pelo banco sem responsável).
 * O histórico mostra um só: o do domínio, com o responsável da operação. Operações sem
 * par continuam como estão.
 */
export function mergeOperationEvents(
  items: AdminAuditEvent[],
): AdminAuditEvent[] {
  const paired = new Set<string>();
  const dropped = new Set<string>();
  const merged = new Map<string, AdminAuditEvent>();
  for (const operation of items.filter(isOperation)) {
    if (!operation.entityId) continue;
    const time = Date.parse(operation.createdAt);
    let match: AdminAuditEvent | undefined;
    let distance = Infinity;
    for (const item of items) {
      if (
        isOperation(item) ||
        paired.has(item.id) ||
        item.entityId !== operation.entityId ||
        (item.actorUserId && item.actorUserId !== operation.actorUserId)
      )
        continue;
      const gap = Math.abs(Date.parse(item.createdAt) - time);
      if (gap <= PAIR_WINDOW_MS && gap < distance) {
        match = item;
        distance = gap;
      }
    }
    if (!match) continue;
    paired.add(match.id);
    dropped.add(operation.id);
    const metadata = { ...match.metadata };
    delete metadata.actorUnavailable;
    merged.set(match.id, {
      ...match,
      ...(operation.actorUserId ? { actorUserId: operation.actorUserId } : {}),
      ...(operation.actorName ? { actorName: operation.actorName } : {}),
      metadata: {
        ...(typeof operation.metadata.subjectName === "string"
          ? { subjectName: operation.metadata.subjectName }
          : {}),
        ...metadata,
      },
    });
  }
  return items
    .filter((item) => !dropped.has(item.id))
    .map((item) => merged.get(item.id) ?? item);
}
