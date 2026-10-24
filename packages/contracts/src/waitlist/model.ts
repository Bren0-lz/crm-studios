import { z } from "zod";
import type { WaitlistDemand, WaitlistEntry, WaitlistStatus } from "./types.js";

// Lista de espera: clientes aguardando turma de um serviço ou reposição de um produto.

export const waitlistKindSchema = z.enum(["service", "product"]);

export const waitlistStatusSchema = z.enum([
  "waiting",
  "contacted",
  "served",
  "cancelled",
]);

export const waitlistKindLabels = {
  service: "Serviço",
  product: "Produto",
} as const;

export const waitlistStatusLabels: Record<WaitlistStatus, string> = {
  waiting: "Aguardando",
  contacted: "Avisado",
  served: "Atendido",
  cancelled: "Desistiu",
};

/** Aguardando e avisado ainda ocupam lugar na fila. */
export const activeWaitlistStatuses: readonly WaitlistStatus[] = [
  "waiting",
  "contacted",
];

const notesSchema = z.string().trim().max(500);

export const waitlistEntryInputSchema = z
  .object({
    patientId: z.uuid(),
    kind: waitlistKindSchema,
    serviceId: z.uuid().optional(),
    productId: z.uuid().optional(),
    notes: notesSchema.default(""),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "service" && !value.serviceId)
      ctx.addIssue({
        code: "custom",
        path: ["serviceId"],
        message: "Informe o serviço.",
      });
    if (value.kind === "product" && !value.productId)
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message: "Informe o produto.",
      });
  })
  .transform(({ serviceId, productId, ...value }) =>
    value.kind === "service"
      ? { ...value, serviceId: serviceId!, productId: null }
      : { ...value, serviceId: null, productId: productId! },
  );

export const waitlistEntryUpdateSchema = z
  .object({
    status: waitlistStatusSchema.optional(),
    notes: notesSchema.optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.notes !== undefined,
    "Informe a situação ou as observações.",
  );

/** Chave do item aguardado (serviço ou produto). */
export function waitlistItemKey(
  entry: Pick<WaitlistEntry, "kind" | "serviceId" | "productId">,
) {
  return `${entry.kind}:${entry.serviceId ?? entry.productId}`;
}

/**
 * Procura por item: só quem ainda está na fila (aguardando ou avisado), da maior fila para
 * a menor; no empate, quem espera há mais tempo vem antes.
 */
export function waitlistDemand(
  entries: readonly WaitlistEntry[],
): WaitlistDemand[] {
  const groups = new Map<string, WaitlistDemand>();
  for (const entry of entries) {
    if (!activeWaitlistStatuses.includes(entry.status)) continue;
    const key = waitlistItemKey(entry);
    const group = groups.get(key) ?? {
      key,
      kind: entry.kind,
      itemId: (entry.serviceId ?? entry.productId)!,
      itemName: entry.itemName,
      total: 0,
      waiting: 0,
      contacted: 0,
      oldestSince: entry.createdAt,
    };
    group.total += 1;
    if (entry.status === "waiting") group.waiting += 1;
    else group.contacted += 1;
    if (entry.createdAt < group.oldestSince)
      group.oldestSince = entry.createdAt;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      right.total - left.total ||
      left.oldestSince.localeCompare(right.oldestSince) ||
      left.itemName.localeCompare(right.itemName, "pt-BR"),
  );
}

/** Posição na fila do item (1 = próximo); fora da fila, `null`. */
export function waitlistPosition(
  entry: WaitlistEntry,
  entries: readonly WaitlistEntry[],
) {
  if (!activeWaitlistStatuses.includes(entry.status)) return null;
  const key = waitlistItemKey(entry);
  return (
    entries.filter(
      (item) =>
        activeWaitlistStatuses.includes(item.status) &&
        waitlistItemKey(item) === key &&
        (item.createdAt < entry.createdAt ||
          (item.createdAt === entry.createdAt && item.id < entry.id)),
    ).length + 1
  );
}
