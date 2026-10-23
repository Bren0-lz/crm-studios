import type {
  AgendaNote,
  AgendaNoteInput,
  AgendaNoteScope,
  AgendaNoteUpdate,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DomainError } from "../../repository.js";
import { noteOccurrences } from "../../modules/agenda/notes.js";
import type { PostgresRepositoryContext } from "./context.js";
import { branchClause } from "./helpers.js";

type NoteRow = Omit<
  AgendaNote,
  "startsAt" | "endsAt" | "createdAt" | "updatedAt"
> & {
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
const columns = `id, clinic_id AS "clinicId", branch_id AS "branchId", professional_id AS "professionalId",
 description, starts_at AS "startsAt", ends_at AS "endsAt", background_color AS "backgroundColor",
 series_id AS "seriesId", author_user_id AS "authorUserId", created_at AS "createdAt", updated_at AS "updatedAt"`;
function mapNote(row: NoteRow): AgendaNote {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function createAgendaNotesRepository(
  context: PostgresRepositoryContext,
) {
  async function assertProfessional(
    client: PoolClient,
    clinicId: string,
    id: string | null,
  ) {
    if (
      id &&
      !(
        await client.query(
          `SELECT id FROM professionals WHERE clinic_id=$1 AND id=$2 AND ${branchClause("branch_id", 3)}`,
          [clinicId, id, context.branchReadIds()],
        )
      ).rowCount
    )
      throw new DomainError(
        "PROFESSIONAL_NOT_FOUND",
        "Profissional não encontrado.",
        404,
      );
  }
  async function selection(
    client: PoolClient,
    clinicId: string,
    id: string,
    scope: AgendaNoteScope,
    professionalScope?: string,
  ) {
    // A mesma trava protege criação, edição e exclusão concorrentes de uma série.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      clinicId,
    ]);
    const result = await client.query<NoteRow>(
      `SELECT ${columns} FROM agenda_notes WHERE clinic_id=$1 AND id=$2 AND ${branchClause("branch_id", 3)} AND ($4::uuid IS NULL OR professional_id=$4) FOR UPDATE`,
      [clinicId, id, context.branchReadIds(), professionalScope ?? null],
    );
    const source = result.rows[0];
    if (!source) return [];
    if (scope !== "following" || !source.seriesId) return [source];
    return (
      await client.query<NoteRow>(
        `SELECT ${columns} FROM agenda_notes WHERE clinic_id=$1 AND series_id=$2 AND starts_at >= $3 AND ${branchClause("branch_id", 4)} AND ($5::uuid IS NULL OR professional_id=$5) ORDER BY starts_at FOR UPDATE`,
        [
          clinicId,
          source.seriesId,
          source.startsAt,
          context.branchReadIds(),
          professionalScope ?? null,
        ],
      )
    ).rows;
  }
  return {
    async listAgendaNotes(
      clinicId: string,
      from: string,
      to: string,
      professionalScope?: string,
    ) {
      return (
        await context.pool.query<NoteRow>(
          `SELECT ${columns} FROM agenda_notes WHERE clinic_id=$1 AND starts_at < $3 AND ends_at > $2 AND ${branchClause("branch_id", 4)} AND ($5::uuid IS NULL OR professional_id IS NULL OR professional_id=$5) ORDER BY starts_at`,
          [
            clinicId,
            from,
            to,
            context.branchReadIds(),
            professionalScope ?? null,
          ],
        )
      ).rows.map(mapNote);
    },
    async createAgendaNotes(
      clinicId: string,
      actorUserId: string,
      input: AgendaNoteInput,
    ) {
      return context.inTransaction(async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [clinicId],
        );
        await assertProfessional(client, clinicId, input.professionalId);
        const branchId = input.professionalId
          ? await context.resourceBranch(client, clinicId, {
              professionalId: input.professionalId,
            })
          : context.branchWriteId();
        const settings = await client.query<{ timezone: string }>(
          "SELECT timezone FROM clinics WHERE id=$1",
          [clinicId],
        );
        const occurrences = noteOccurrences(input, settings.rows[0]!.timezone);
        const seriesId = input.repeat ? randomUUID() : null;
        const notes: AgendaNote[] = [];
        for (const occurrence of occurrences) {
          const result = await client.query<NoteRow>(
            `INSERT INTO agenda_notes (clinic_id,branch_id,professional_id,description,starts_at,ends_at,background_color,series_id,author_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,
            [
              clinicId,
              branchId,
              input.professionalId,
              input.description,
              occurrence.startsAt,
              occurrence.endsAt,
              input.backgroundColor,
              seriesId,
              actorUserId,
            ],
          );
          const item = mapNote(result.rows[0]!);
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "agenda.note_created",
            "agenda_note",
            item.id,
          );
          notes.push(item);
        }
        return notes;
      });
    },
    async updateAgendaNote(
      clinicId: string,
      actorUserId: string,
      id: string,
      input: AgendaNoteUpdate,
      scope: AgendaNoteScope,
      professionalScope?: string,
    ) {
      return context.inTransaction(async (client) => {
        const selected = await selection(
          client,
          clinicId,
          id,
          scope,
          professionalScope,
        );
        const source = selected.find((item) => item.id === id);
        if (!source) return null;
        await assertProfessional(client, clinicId, input.professionalId);
        if (
          input.professionalId &&
          (await context.resourceBranch(client, clinicId, {
            professionalId: input.professionalId,
          })) !== source.branchId
        )
          throw new DomainError(
            "BRANCH_MISMATCH",
            "A nota e o profissional precisam ser da mesma filial.",
            409,
          );
        const delta = Date.parse(input.startsAt) - source.startsAt.getTime();
        const duration = Date.parse(input.endsAt) - Date.parse(input.startsAt);
        const seriesId =
          scope === "following" && source.seriesId ? randomUUID() : null;
        const notes: AgendaNote[] = [];
        for (const item of selected) {
          const start = new Date(item.startsAt.getTime() + delta);
          const result = await client.query<NoteRow>(
            `UPDATE agenda_notes SET professional_id=$3,description=$4,starts_at=$5,ends_at=$6,background_color=$7,series_id=$8,updated_at=now() WHERE clinic_id=$1 AND id=$2 RETURNING ${columns}`,
            [
              clinicId,
              item.id,
              input.professionalId,
              input.description,
              start,
              new Date(start.getTime() + duration),
              input.backgroundColor,
              seriesId,
            ],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "agenda.note_updated",
            "agenda_note",
            item.id,
            { scope },
          );
          notes.push(mapNote(result.rows[0]!));
        }
        return notes;
      });
    },
    async deleteAgendaNote(
      clinicId: string,
      actorUserId: string,
      id: string,
      scope: AgendaNoteScope,
      professionalScope?: string,
    ) {
      return context.inTransaction(async (client) => {
        const selected = await selection(
          client,
          clinicId,
          id,
          scope,
          professionalScope,
        );
        for (const item of selected) {
          await client.query(
            "DELETE FROM agenda_notes WHERE clinic_id=$1 AND id=$2",
            [clinicId, item.id],
          );
          await context.addAdminAudit(
            client,
            clinicId,
            actorUserId,
            "agenda.note_deleted",
            "agenda_note",
            item.id,
            { scope },
          );
        }
        return selected.length > 0;
      });
    },
  };
}
