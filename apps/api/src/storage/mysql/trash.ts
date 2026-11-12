import {
  trashImpactLabels,
  type TrashImpact,
  type TrashImpactItem,
  type TrashItem,
  type TrashKind,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import type { MysqlRepositoryContext } from "./context.js";
import { hasDatabaseCode } from "./helpers.js";

type QueryClient = Parameters<
  Parameters<MysqlRepositoryContext["inTransaction"]>[0]
>[0];

/** Tabela de cada tópico da lixeira. */
const kindTables: Record<TrashKind, string> = {
  patients: "patients",
  leads: "leads",
  appointments: "appointments",
  "patient-plans": "patient_plans",
};
const auditEntities: Record<TrashKind, string> = {
  patients: "patient",
  leads: "lead",
  appointments: "appointment",
  "patient-plans": "patient_plan",
};

/**
 * Ponteiros que só citam o item excluído (de onde veio, em quem foi unificado): na exclusão
 * definitiva viram NULL e o outro registro continua. Todo o resto que aponta para o item é
 * apagado junto.
 */
const detachedReferences = new Set([
  "leads.converted_patient_id",
  "patients.merged_into_patient_id",
  "patient_plans.renewed_from_plan_id",
  "appointments.predecessor_id",
]);

interface ForeignKey {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
}

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const placeholders = (values: readonly unknown[], offset = 0) =>
  values.map((_, index) => `$${index + offset + 1}`).join(",");

/**
 * Chaves estrangeiras do banco (lidas do information_schema, então a migração nova entra sem
 * mexer aqui). Nas compostas `(clinic_id, x)` vale só a coluna `x`: tudo é da mesma clínica.
 */
async function loadForeignKeys(client: QueryClient) {
  const result = await client.query<{
    constraintName: string;
    tableName: string;
    columnName: string;
    refTable: string;
    refColumn: string;
  }>(
    `SELECT CONSTRAINT_NAME AS "constraintName", TABLE_NAME AS "tableName", COLUMN_NAME AS "columnName",
            REFERENCED_TABLE_NAME AS "refTable", REFERENCED_COLUMN_NAME AS "refColumn"
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
  );
  const byConstraint = new Map<string, ForeignKey[]>();
  for (const row of result.rows) {
    const key = `${row.tableName}.${row.constraintName}`;
    const list = byConstraint.get(key) ?? [];
    list.push({
      table: row.tableName,
      column: row.columnName,
      refTable: row.refTable,
      refColumn: row.refColumn,
    });
    byConstraint.set(key, list);
  }
  const keys: ForeignKey[] = [];
  // Ordem de exclusão: também as compostas de várias colunas (ex.: plano + serviço).
  const edges: ForeignKey[] = [];
  for (const columns of byConstraint.values()) {
    const own = columns.filter((item) => item.column !== "clinic_id");
    if (own.length === 1) keys.push(own[0]!);
    if (own.length) edges.push(own[0]!);
  }
  const ids = await client.query<{ tableName: string }>(
    `SELECT TABLE_NAME AS "tableName" FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'id'`,
  );
  return {
    keys,
    edges,
    withId: new Set(ids.rows.map((row) => row.tableName)),
  };
}

interface PurgePlan {
  /** Ids a apagar por tabela (tabelas com coluna `id`). */
  rows: Map<string, Set<string>>;
  /** Tabelas sem `id` (ligação pura): apagadas pela coluna que aponta para o item. */
  links: { table: string; column: string; values: string[] }[];
  detach: { table: string; column: string; values: string[] }[];
  counts: Map<string, number>;
}

/**
 * Levanta tudo que seria apagado junto com o item, seguindo as chaves estrangeiras a partir dele.
 * Não grava nada: a mesma lista serve para o aviso (impacto) e para a exclusão.
 */
async function planPurge(
  client: QueryClient,
  kind: TrashKind,
  id: string,
): Promise<PurgePlan> {
  const { keys, withId } = await loadForeignKeys(client);
  const plan: PurgePlan = {
    rows: new Map(),
    links: [],
    detach: [],
    counts: new Map(),
  };
  const root = kindTables[kind];
  plan.rows.set(root, new Set([id]));
  const queue: { table: string; ids: string[] }[] = [
    { table: root, ids: [id] },
  ];
  while (queue.length) {
    const { table, ids } = queue.shift()!;
    for (const key of keys.filter((item) => item.refTable === table)) {
      let values = ids;
      if (key.refColumn !== "id") {
        const referenced = await client.query<{ value: string }>(
          `SELECT DISTINCT ${quote(key.refColumn)} AS "value" FROM ${quote(table)} WHERE id IN (${placeholders(ids)})`,
          ids,
        );
        values = referenced.rows
          .map((row) => row.value)
          .filter((value) => value != null);
      }
      if (!values.length) continue;
      if (detachedReferences.has(`${key.table}.${key.column}`)) {
        plan.detach.push({ table: key.table, column: key.column, values });
        continue;
      }
      if (!withId.has(key.table)) {
        const count = await client.query<{ total: number }>(
          `SELECT COUNT(*) AS "total" FROM ${quote(key.table)} WHERE ${quote(key.column)} IN (${placeholders(values)})`,
          values,
        );
        const total = Number(count.rows[0]?.total ?? 0);
        if (!total) continue;
        plan.links.push({ table: key.table, column: key.column, values });
        plan.counts.set(key.table, (plan.counts.get(key.table) ?? 0) + total);
        continue;
      }
      const children = await client.query<{ id: string }>(
        `SELECT id FROM ${quote(key.table)} WHERE ${quote(key.column)} IN (${placeholders(values)})`,
        values,
      );
      const known = plan.rows.get(key.table) ?? new Set<string>();
      const fresh = children.rows
        .map((row) => row.id)
        .filter((child) => !known.has(child));
      if (!fresh.length) continue;
      fresh.forEach((child) => known.add(child));
      plan.rows.set(key.table, known);
      queue.push({ table: key.table, ids: fresh });
    }
  }
  for (const [table, ids] of plan.rows)
    if (table !== root || ids.size > 1)
      plan.counts.set(
        table,
        (plan.counts.get(table) ?? 0) + ids.size - (table === root ? 1 : 0),
      );
  return plan;
}

/** Ordem de exclusão: filhos antes dos pais; ciclo só se desfaz anulando a coluna opcional. */
async function executePurge(client: QueryClient, plan: PurgePlan) {
  const { edges: allEdges } = await loadForeignKeys(client);
  for (const item of plan.detach)
    await client.query(
      `UPDATE ${quote(item.table)} SET ${quote(item.column)} = NULL WHERE ${quote(item.column)} IN (${placeholders(item.values)})`,
      item.values,
    );
  const pending = new Set([
    ...plan.rows.keys(),
    ...plan.links.map((item) => item.table),
  ]);
  const edges = allEdges.filter(
    (key) =>
      pending.has(key.table) &&
      pending.has(key.refTable) &&
      !detachedReferences.has(`${key.table}.${key.column}`),
  );
  const remove = async (table: string) => {
    for (const link of plan.links.filter((item) => item.table === table))
      await client.query(
        `DELETE FROM ${quote(table)} WHERE ${quote(link.column)} IN (${placeholders(link.values)})`,
        link.values,
      );
    const ids = [...(plan.rows.get(table) ?? [])];
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      await client.query(
        `DELETE FROM ${quote(table)} WHERE id IN (${placeholders(chunk)})`,
        chunk,
      );
    }
    pending.delete(table);
  };
  // Autorreferência (ex.: parcela renegociada): anula antes, dentro do próprio conjunto.
  for (const edge of edges.filter((item) => item.table === item.refTable)) {
    const ids = [...(plan.rows.get(edge.table) ?? [])];
    if (!ids.length) continue;
    await client.query(
      `UPDATE ${quote(edge.table)} SET ${quote(edge.column)} = NULL WHERE id IN (${placeholders(ids)}) AND ${quote(edge.column)} IS NOT NULL`,
      ids,
    );
  }
  const crossEdges = edges.filter((item) => item.table !== item.refTable);
  while (pending.size) {
    const ready = [...pending].filter(
      (table) =>
        !crossEdges.some(
          (edge) => edge.refTable === table && pending.has(edge.table),
        ),
    );
    if (ready.length) {
      for (const table of ready) await remove(table);
      continue;
    }
    // Ciclo entre tabelas (ex.: atendimento ↔ plano): anula a coluna opcional de uma aresta
    // que fecha o ciclo; coluna obrigatória (ou presa a uma regra) é recusada pelo banco e fica.
    const reaches = (from: string, to: string) => {
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length) {
        const current = queue.shift()!;
        if (current === to) return true;
        for (const edge of crossEdges)
          if (
            edge.table === current &&
            pending.has(edge.refTable) &&
            !seen.has(edge.refTable)
          ) {
            seen.add(edge.refTable);
            queue.push(edge.refTable);
          }
      }
      return false;
    };
    const cycle = crossEdges.filter(
      (edge) =>
        pending.has(edge.table) &&
        pending.has(edge.refTable) &&
        plan.rows.has(edge.table) &&
        reaches(edge.refTable, edge.table),
    );
    let broken = false;
    for (const edge of cycle) {
      const ids = [...plan.rows.get(edge.table)!];
      try {
        await client.query(
          `UPDATE ${quote(edge.table)} SET ${quote(edge.column)} = NULL WHERE id IN (${placeholders(ids)}) AND ${quote(edge.column)} IS NOT NULL`,
          ids,
        );
      } catch {
        continue;
      }
      crossEdges.splice(crossEdges.indexOf(edge), 1);
      broken = true;
      break;
    }
    if (!broken)
      throw new Error("Exclusão definitiva: ciclo sem coluna opcional.");
  }
}

function impactItems(counts: Map<string, number>): TrashImpactItem[] {
  const grouped = new Map<string, TrashImpactItem>();
  for (const [table, count] of counts) {
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
  return [...grouped.values()]
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        Number(a.key === "other") - Number(b.key === "other") ||
        b.count - a.count ||
        a.label.localeCompare(b.label, "pt-BR"),
    );
}

const listQueries: Record<TrashKind, string> = {
  patients: `SELECT t.id, t.full_name AS "title", t.phone AS "detail", t.deleted_at AS "deletedAt", u.full_name AS "deletedByName"
      FROM patients t LEFT JOIN users u ON u.id = t.deleted_by_user_id
     WHERE t.clinic_id = $1 AND t.deleted_at IS NOT NULL`,
  leads: `SELECT t.id, t.full_name AS "title", t.phone AS "detail", t.deleted_at AS "deletedAt", u.full_name AS "deletedByName"
      FROM leads t LEFT JOIN users u ON u.id = t.deleted_by_user_id
     WHERE t.clinic_id = $1 AND t.deleted_at IS NOT NULL`,
  appointments: `SELECT t.id, CONCAT(s.name, ' · ', coalesce(p.full_name, l.full_name, '')) AS "title",
            t.starts_at AS "startsAt", t.deleted_at AS "deletedAt", u.full_name AS "deletedByName"
      FROM appointments t JOIN services s ON s.id = t.service_id
      LEFT JOIN patients p ON p.id = t.patient_id LEFT JOIN leads l ON l.id = t.lead_id
      LEFT JOIN users u ON u.id = t.deleted_by_user_id
     WHERE t.clinic_id = $1 AND t.deleted_at IS NOT NULL`,
  "patient-plans": `SELECT t.id, t.name AS "title", p.full_name AS "detail", t.deleted_at AS "deletedAt", u.full_name AS "deletedByName"
      FROM patient_plans t JOIN patients p ON p.id = t.patient_id
      LEFT JOIN users u ON u.id = t.deleted_by_user_id
     WHERE t.clinic_id = $1 AND t.deleted_at IS NOT NULL`,
};

interface TrashRow {
  id: string;
  title: string;
  detail?: string | null;
  startsAt?: Date | null;
  deletedAt: Date;
  deletedByName?: string | null;
}

function mapTrashRow(kind: TrashKind, row: TrashRow): TrashItem {
  return {
    id: row.id,
    kind,
    title: row.title,
    ...(row.startsAt
      ? { detail: row.startsAt.toISOString() }
      : row.detail
        ? { detail: row.detail }
        : {}),
    deletedAt: row.deletedAt.toISOString(),
    ...(row.deletedByName ? { deletedByName: row.deletedByName } : {}),
  };
}

const notFound = () =>
  new DomainError("TRASH_ITEM_NOT_FOUND", "Item não encontrado.", 404);
const notInTrash = () =>
  new DomainError(
    "TRASH_ITEM_NOT_IN_TRASH",
    "Este item não está na lixeira.",
    409,
  );

export function createTrashRepository(context: MysqlRepositoryContext) {
  async function findRow(
    client: QueryClient,
    clinicId: string,
    kind: TrashKind,
    id: string,
    lock = false,
  ) {
    const result = await client.query<TrashRow>(
      `SELECT * FROM (${listQueries[kind].replace("t.deleted_at IS NOT NULL", "t.id = $2")}) item`,
      [clinicId, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const state = await client.query<{ deletedAt: Date | null }>(
      `SELECT deleted_at AS "deletedAt" FROM ${quote(kindTables[kind])} WHERE clinic_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
      [clinicId, id],
    );
    return { row, inTrash: Boolean(state.rows[0]?.deletedAt) };
  }

  /** Atendimento agendado daqui para frente que ainda usa o cliente/plano (bloqueia o envio). */
  async function futureAppointments(
    client: QueryClient,
    clinicId: string,
    column: "patient_id" | "patient_plan_id",
    id: string,
  ) {
    const result = await client.query<{ total: number }>(
      `SELECT COUNT(*) AS "total" FROM appointments WHERE clinic_id = $1 AND ${column} = $2
         AND deleted_at IS NULL AND starts_at >= NOW(6) AND status IN ('scheduled','confirmed')`,
      [clinicId, id],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async function assertCanRestore(
    client: QueryClient,
    clinicId: string,
    kind: TrashKind,
    id: string,
  ) {
    if (kind === "appointments" || kind === "patient-plans") {
      const owner = await client.query<{ patientInTrash: number }>(
        `SELECT COUNT(*) AS "patientInTrash" FROM ${quote(kindTables[kind])} t JOIN patients p ON p.id = t.patient_id
          WHERE t.clinic_id = $1 AND t.id = $2 AND p.deleted_at IS NOT NULL`,
        [clinicId, id],
      );
      if (Number(owner.rows[0]?.patientInTrash ?? 0))
        throw new DomainError(
          "TRASH_RESTORE_PATIENT_IN_TRASH",
          "O cliente deste item está na lixeira. Restaure o cliente antes.",
          409,
        );
    }
    if (kind === "appointments") {
      {
        const lead = await client.query<{ leadInTrash: number }>(
          `SELECT COUNT(*) AS "leadInTrash" FROM appointments t JOIN leads l ON l.id = t.lead_id
            WHERE t.clinic_id = $1 AND t.id = $2 AND l.deleted_at IS NOT NULL`,
          [clinicId, id],
        );
        if (Number(lead.rows[0]?.leadInTrash ?? 0))
          throw new DomainError(
            "TRASH_RESTORE_LEAD_IN_TRASH",
            "O lead deste atendimento está na lixeira. Restaure o lead antes.",
            409,
          );
      }
      const slot = await client.query<{
        professionalId: string;
        roomId: string;
        startsAt: Date;
        endsAt: Date;
        status: string;
      }>(
        `SELECT professional_id AS "professionalId", room_id AS "roomId", starts_at AS "startsAt",
                ends_at AS "endsAt", status FROM appointments WHERE clinic_id = $1 AND id = $2`,
        [clinicId, id],
      );
      const appointment = slot.rows[0];
      if (appointment && appointment.status !== "cancelled")
        try {
          await context.assertAgendaFree(client, clinicId, {
            kind: "appointment",
            professionalId: appointment.professionalId,
            roomId: appointment.roomId,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            ignoreId: id,
          });
        } catch (error) {
          if (!hasDatabaseCode(error, "23P01")) throw error;
          throw new DomainError(
            "TRASH_RESTORE_CONFLICT",
            "O horário deste atendimento já foi ocupado por outro. Libere o horário antes de restaurar.",
            409,
          );
        }
    }
  }

  return {
    async listTrash(clinicId: string, kind: TrashKind): Promise<TrashItem[]> {
      const result = await context.pool.query<TrashRow>(
        `${listQueries[kind]} ORDER BY t.deleted_at DESC`,
        [clinicId],
      );
      return result.rows.map((row) => mapTrashRow(kind, row));
    },

    async sendToTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<TrashItem> {
      return context.inTransaction(async (client) => {
        const found = await findRow(client, clinicId, kind, id, true);
        if (!found) throw notFound();
        if (found.inTrash)
          throw new DomainError(
            "TRASH_ITEM_ALREADY_IN_TRASH",
            "Este item já está na lixeira.",
            409,
          );
        if (kind === "patients" || kind === "patient-plans") {
          const total = await futureAppointments(
            client,
            clinicId,
            kind === "patients" ? "patient_id" : "patient_plan_id",
            id,
          );
          if (total)
            throw new DomainError(
              "TRASH_FUTURE_APPOINTMENTS",
              `${kind === "patients" ? "Este cliente" : "Este plano"} tem ${total} ${total === 1 ? "atendimento agendado" : "atendimentos agendados"} daqui para frente. Cancele ou exclua ${total === 1 ? "o atendimento" : "os atendimentos"} antes.`,
              409,
            );
        }
        await client.query(
          `UPDATE ${quote(kindTables[kind])} SET deleted_at = NOW(6), deleted_by_user_id = $3 WHERE clinic_id = $1 AND id = $2`,
          [clinicId, id, actorUserId],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          `${auditEntities[kind]}.trashed`,
          auditEntities[kind],
          id,
          { title: found.row.title },
        );
        const after = await findRow(client, clinicId, kind, id);
        return mapTrashRow(kind, after!.row);
      });
    },

    async restoreFromTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<void> {
      await context.inTransaction(async (client) => {
        const found = await findRow(client, clinicId, kind, id, true);
        if (!found) throw notFound();
        if (!found.inTrash) throw notInTrash();
        await assertCanRestore(client, clinicId, kind, id);
        await client.query(
          `UPDATE ${quote(kindTables[kind])} SET deleted_at = NULL, deleted_by_user_id = NULL WHERE clinic_id = $1 AND id = $2`,
          [clinicId, id],
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          `${auditEntities[kind]}.restored`,
          auditEntities[kind],
          id,
          { title: found.row.title },
        );
      });
    },

    async trashImpact(
      clinicId: string,
      kind: TrashKind,
      id: string,
    ): Promise<TrashImpact> {
      return context.inTransaction(async (client) => {
        const found = await findRow(client, clinicId, kind, id);
        if (!found) throw notFound();
        if (!found.inTrash) throw notInTrash();
        const plan = await planPurge(client, kind, id);
        const items = impactItems(plan.counts);
        return {
          id,
          kind,
          title: found.row.title,
          items,
          total: items.reduce((sum, item) => sum + item.count, 0),
        };
      });
    },

    async purgeFromTrash(
      clinicId: string,
      actorUserId: string,
      kind: TrashKind,
      id: string,
    ): Promise<void> {
      await context.inTransaction(async (client) => {
        await client.lock(`trash:${clinicId}`);
        const found = await findRow(client, clinicId, kind, id, true);
        if (!found) throw notFound();
        if (!found.inTrash) throw notInTrash();
        const plan = await planPurge(client, kind, id);
        await executePurge(client, plan);
        const removedCount = [...plan.counts.values()].reduce(
          (sum, count) => sum + count,
          0,
        );
        await context.addAdminAudit(
          client,
          clinicId,
          actorUserId,
          `${auditEntities[kind]}.purged`,
          auditEntities[kind],
          id,
          { title: found.row.title, removedCount },
        );
      });
    },
  };
}
