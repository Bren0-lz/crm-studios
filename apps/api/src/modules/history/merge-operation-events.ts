import type { AdminAuditEvent } from "@crm/contracts";

/** Distância máxima entre o registro da operação e o do domínio do mesmo comando. */
const PAIR_WINDOW_MS = 10_000;

const isOperation = (event: AdminAuditEvent) =>
  event.action.startsWith("operation.");

const isEdit = (event: AdminAuditEvent) =>
  event.metadata.method === "PUT" || event.metadata.method === "PATCH";

/**
 * 0 quando o registro do domínio é do mesmo tipo do comando (POST → "….created", DELETE →
 * "….deleted", edição → nenhum dos dois); 1 quando não é. Desempata registros com a mesma
 * distância: criar, editar e excluir em sequência (ou com o relógio parado nos testes)
 * não pode trocar os pares e deixar uma operação sobrando no histórico.
 */
function kindMismatch(operation: AdminAuditEvent, item: AdminAuditEvent) {
  const created = item.action.endsWith(".created"),
    deleted = item.action.endsWith(".deleted");
  const matches =
    operation.metadata.method === "POST"
      ? created
      : operation.metadata.method === "DELETE"
        ? deleted
        : !created && !deleted;
  return matches ? 0 : 1;
}

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
    let mismatch = Infinity;
    for (const item of items) {
      if (
        isOperation(item) ||
        paired.has(item.id) ||
        item.entityId !== operation.entityId ||
        (item.actorUserId && item.actorUserId !== operation.actorUserId) ||
        // Edição feita logo após o cadastro não vira o registro "… cadastrado".
        (isEdit(operation) && item.action.endsWith(".created"))
      )
        continue;
      const gap = Math.abs(Date.parse(item.createdAt) - time);
      const kind = kindMismatch(operation, item);
      if (
        gap <= PAIR_WINDOW_MS &&
        (gap < distance || (gap === distance && kind < mismatch))
      ) {
        match = item;
        distance = gap;
        mismatch = kind;
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
        // Campos alterados e motivo informados na edição ficam no registro exibido.
        ...(operation.metadata.changes === undefined
          ? {}
          : { changes: operation.metadata.changes }),
        ...(typeof operation.metadata.reason === "string"
          ? { reason: operation.metadata.reason }
          : {}),
      },
    });
  }
  return items
    .filter((item) => !dropped.has(item.id))
    .map((item) => merged.get(item.id) ?? item);
}
