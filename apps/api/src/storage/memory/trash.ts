import {
  trashImpactLabels,
  type TrashImpact,
  type TrashImpactItem,
  type TrashItem,
  type TrashKind,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { now } from "./helpers.js";

type Row = Record<string, unknown> & { id?: string };

/** Coleção de cada tópico e o campo pelo qual os registros ligados apontam para ele. */
const roots: Record<TrashKind, { collection: string; reference: string[] }> = {
  patients: { collection: "patients", reference: ["patientId"] },
  leads: { collection: "leads", reference: ["leadId"] },
  appointments: {
    collection: "appointments",
    reference: ["appointmentId", "sourceAppointmentId"],
  },
  "patient-plans": {
    collection: "patientPlans",
    reference: ["planId", "patientPlanId"],
  },
};
/** Registros apagados junto que também têm dependentes (seguidos pelo mesmo campo). */
const nested: Record<string, string[]> = {
  appointments: ["appointmentId", "sourceAppointmentId"],
  patientPlans: ["planId", "patientPlanId"],
  patientTabs: ["tabId", "patientTabId"],
  receivables: ["receivableId"],
  clinicalRecords: ["recordId", "clinicalRecordId"],
  leads: ["leadId"],
};
/** Ponteiros que só citam o item: viram vazios e o outro registro continua (como no MySQL). */
const detachedFields = new Set([
  "convertedPatientId",
  "mergedIntoPatientId",
  "renewedFromPlanId",
  "renewedByPlanId",
  "predecessorId",
]);
/** Nome da tabela equivalente, para o rótulo do aviso ser o mesmo nos dois armazenamentos. */
const tableNames: Record<string, string> = {
  commissions: "commission_entries",
};
const tableOf = (collection: string) =>
  tableNames[collection] ??
  collection.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const auditEntities: Record<TrashKind, string> = {
  patients: "patient",
  leads: "lead",
  appointments: "appointment",
  "patient-plans": "patient_plan",
};

const notFound = () =>
  new DomainError("TRASH_ITEM_NOT_FOUND", "Item não encontrado.", 404);
const notInTrash = () =>
  new DomainError(
    "TRASH_ITEM_NOT_IN_TRASH",
    "Este item não está na lixeira.",
    409,
  );

export function createTrashRepository(context: MemoryRepositoryContext) {
  const collections = () =>
    Object.entries(context as unknown as Record<string, unknown>).filter(
      (entry): entry is [string, Row[]] =>
        Array.isArray(entry[1]) &&
        entry[0] !== "adminAuditEvents" &&
        entry[1].every((item) => item && typeof item === "object"),
    );
  const collection = (name: string) =>
    (context as unknown as Record<string, Row[]>)[name]!;

  function find(clinicId: string, kind: TrashKind, id: string) {
    return collection(roots[kind].collection).find(
      (item) => item.id === id && item.clinicId === clinicId,
    );
  }

  function describe(kind: TrashKind, row: Row): Omit<TrashItem, "deletedAt"> {
    const text = (value: unknown) =>
      typeof value === "string" ? value : undefined;
    if (kind === "appointments") {
      const who = text(row.patientName) || text(row.leadName) || "";
      return {
        id: row.id!,
        kind,
        title: `${text(row.serviceName) ?? ""} · ${who}`,
        ...(text(row.startsAt) ? { detail: text(row.startsAt)! } : {}),
      };
    }
    if (kind === "patient-plans")
      return {
        id: row.id!,
        kind,
        title: text(row.name) ?? "",
        ...(text(row.patientName) ? { detail: text(row.patientName)! } : {}),
      };
    return {
      id: row.id!,
      kind,
      title: text(row.fullName) ?? "",
      ...(text(row.phone) ? { detail: text(row.phone)! } : {}),
    };
  }

  function toItem(kind: TrashKind, row: Row): TrashItem {
    const state = context.trashed.get(`${kind}:${row.id}`)!;
    const user = context.users.find(
      (item) => item.id === state.deletedByUserId,
    );
    return {
      ...describe(kind, row),
      deletedAt: state.deletedAt,
      ...(user ? { deletedByName: user.fullName } : {}),
    };
  }

  /** Tudo que sai junto com o item, por coleção (sem apagar nada). */
  function planPurge(clinicId: string, kind: TrashKind, id: string) {
    const removed = new Map<string, Set<Row>>();
    const detach: { row: Row; field: string }[] = [];
    const queue: { fields: string[]; ids: Set<string> }[] = [
      { fields: roots[kind].reference, ids: new Set([id]) },
    ];
    const root = find(clinicId, kind, id);
    removed.set(roots[kind].collection, new Set(root ? [root] : []));
    while (queue.length) {
      const { fields, ids } = queue.shift()!;
      for (const [name, rows] of collections()) {
        for (const row of rows) {
          for (const [field, value] of Object.entries(row)) {
            if (typeof value !== "string" || !ids.has(value)) continue;
            if (detachedFields.has(field)) {
              detach.push({ row, field });
              continue;
            }
            if (!fields.includes(field)) continue;
            const set = removed.get(name) ?? new Set<Row>();
            if (set.has(row)) continue;
            set.add(row);
            removed.set(name, set);
            if (nested[name] && row.id)
              queue.push({ fields: nested[name], ids: new Set([row.id]) });
          }
        }
      }
    }
    return { removed, detach };
  }

  function impactItems(
    removed: Map<string, Set<Row>>,
    kind: TrashKind,
  ): TrashImpactItem[] {
    const grouped = new Map<string, TrashImpactItem>();
    for (const [name, rows] of removed) {
      const count = rows.size - (name === roots[kind].collection ? 1 : 0);
      if (count <= 0) continue;
      const table = tableOf(name);
      const label = trashImpactLabels[table];
      const key = label ? table : "other";
      const current = grouped.get(key) ?? {
        key,
        label: label ?? "Outros registros",
        count: 0,
      };
      current.count += count;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort(
      (a, b) =>
        Number(a.key === "other") - Number(b.key === "other") ||
        b.count - a.count ||
        a.label.localeCompare(b.label, "pt-BR"),
    );
  }

  function requireTrashed(clinicId: string, kind: TrashKind, id: string) {
    const row = find(clinicId, kind, id);
    if (!row) throw notFound();
    if (!context.isTrashed(kind, id)) throw notInTrash();
    return row;
  }

  return {
    async listTrash(clinicId: string, kind: TrashKind): Promise<TrashItem[]> {
      return collection(roots[kind].collection)
        .filter(
          (row) => row.clinicId === clinicId && context.isTrashed(kind, row.id),
        )
        .map((row) => toItem(kind, row))
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },

    async sendToTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<TrashItem> {
      const row = find(clinicId, kind, id);
      if (!row) throw notFound();
      if (context.isTrashed(kind, id))
        throw new DomainError(
          "TRASH_ITEM_ALREADY_IN_TRASH",
          "Este item já está na lixeira.",
          409,
        );
      if (kind === "patients" || kind === "patient-plans") {
        const field = kind === "patients" ? "patientId" : "planId";
        const total = context.appointments.filter(
          (item) =>
            item.clinicId === clinicId &&
            (item as unknown as Row)[field] === id &&
            !context.isTrashed("appointments", item.id) &&
            ["scheduled", "confirmed"].includes(item.status) &&
            new Date(item.startsAt).getTime() >= Date.now(),
        ).length;
        if (total)
          throw new DomainError(
            "TRASH_FUTURE_APPOINTMENTS",
            `${kind === "patients" ? "Este cliente" : "Este plano"} tem ${total} ${total === 1 ? "atendimento agendado" : "atendimentos agendados"} daqui para frente. Cancele ou exclua ${total === 1 ? "o atendimento" : "os atendimentos"} antes.`,
            409,
          );
      }
      context.trashed.set(`${kind}:${id}`, {
        deletedAt: now(),
        deletedByUserId: actorUserId,
      });
      const item = toItem(kind, row);
      context.addAdminAudit(
        actorUserId,
        `${auditEntities[kind]}.trashed`,
        auditEntities[kind],
        id,
        { title: item.title },
        clinicId,
      );
      return item;
    },

    async restoreFromTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<void> {
      const row = requireTrashed(clinicId, kind, id);
      if (
        (kind === "appointments" || kind === "patient-plans") &&
        context.isTrashed("patients", row.patientId as string | undefined)
      )
        throw new DomainError(
          "TRASH_RESTORE_PATIENT_IN_TRASH",
          "O cliente deste item está na lixeira. Restaure o cliente antes.",
          409,
        );
      if (kind === "appointments") {
        if (context.isTrashed("leads", row.leadId as string | undefined))
          throw new DomainError(
            "TRASH_RESTORE_LEAD_IN_TRASH",
            "O lead deste atendimento está na lixeira. Restaure o lead antes.",
            409,
          );
        const appointment = context.appointments.find(
          (item) => item.id === id,
        )!;
        const overlaps = (startsAt: string, endsAt: string) =>
          new Date(startsAt) < new Date(appointment.endsAt) &&
          new Date(endsAt) > new Date(appointment.startsAt);
        const conflict =
          appointment.status !== "cancelled" &&
          (context.appointments.some(
            (item) =>
              item.id !== id &&
              item.clinicId === clinicId &&
              item.status !== "cancelled" &&
              !context.isTrashed("appointments", item.id) &&
              (item.professionalId === appointment.professionalId ||
                item.roomId === appointment.roomId) &&
              overlaps(item.startsAt, item.endsAt),
          ) ||
            context.scheduleBlocks.some(
              (item) =>
                item.clinicId === clinicId &&
                item.status === "active" &&
                (item.professionalId === appointment.professionalId ||
                  item.roomId === appointment.roomId) &&
                overlaps(item.startsAt, item.endsAt),
            ));
        if (conflict)
          throw new DomainError(
            "TRASH_RESTORE_CONFLICT",
            "O horário deste atendimento já foi ocupado por outro. Libere o horário antes de restaurar.",
            409,
          );
      }
      const title = toItem(kind, row).title;
      context.trashed.delete(`${kind}:${id}`);
      context.addAdminAudit(
        actorUserId,
        `${auditEntities[kind]}.restored`,
        auditEntities[kind],
        id,
        { title },
        clinicId,
      );
    },

    async trashImpact(
      clinicId: string,
      kind: TrashKind,
      id: string,
    ): Promise<TrashImpact> {
      const row = requireTrashed(clinicId, kind, id);
      const items = impactItems(planPurge(clinicId, kind, id).removed, kind);
      return {
        id,
        kind,
        title: describe(kind, row).title,
        items,
        total: items.reduce((sum, item) => sum + item.count, 0),
      };
    },

    async purgeFromTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<void> {
      const row = requireTrashed(clinicId, kind, id);
      const title = describe(kind, row).title;
      const { removed, detach } = planPurge(clinicId, kind, id);
      for (const { row: target, field } of detach) delete target[field];
      let removedCount = 0;
      for (const [name, rows] of removed) {
        const list = collection(name);
        for (let index = list.length - 1; index >= 0; index -= 1)
          if (rows.has(list[index]!)) list.splice(index, 1);
        removedCount += rows.size - (name === roots[kind].collection ? 1 : 0);
      }
      for (const [name, rows] of removed) {
        const trashKind = (Object.keys(roots) as TrashKind[]).find(
          (item) => roots[item].collection === name,
        );
        if (trashKind)
          for (const item of rows)
            context.trashed.delete(`${trashKind}:${item.id}`);
      }
      context.addAdminAudit(
        actorUserId,
        `${auditEntities[kind]}.purged`,
        auditEntities[kind],
        id,
        { title, removedCount },
        clinicId,
      );
    },
  };
}
