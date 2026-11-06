import {
  resolveTelegramLinkRoles,
  type TelegramSettingsInput,
  type UserRole,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type {
  TelegramDeliveryResult,
  TelegramLink,
  TelegramLinkAttempt,
  TelegramOutboxMessage,
} from "../../repository.js";
import type { Queryable } from "../../infrastructure/mysql-client.js";
import type { MysqlRepositoryContext } from "./context.js";
import { bool, json } from "./helpers.js";
import { inJsonArray, insertRows } from "./sql.js";

const linkColumns = `l.clinic_id AS "clinicId", l.user_id AS "userId", l.chat_id AS "chatId", l.linked_at AS "linkedAt"`;
type LinkRow = Omit<TelegramLink, "linkedAt"> & { linkedAt: Date };
const mapLink = (row: LinkRow): TelegramLink => ({
  ...row,
  linkedAt: row.linkedAt.toISOString(),
});

const outboxColumns = `id, clinic_id AS "clinicId", chat_id AS "chatId", message, attempts,
  next_attempt_at AS "nextAttemptAt", last_error AS "lastError", sent_at AS "sentAt",
  failed_at AS "failedAt", created_at AS "createdAt"`;
interface OutboxRow {
  id: string;
  clinicId: string | null;
  chatId: string;
  message: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}
const mapOutbox = (row: OutboxRow): TelegramOutboxMessage => ({
  id: row.id,
  clinicId: row.clinicId,
  chatId: row.chatId,
  message: row.message,
  attempts: Number(row.attempts),
  nextAttemptAt: row.nextAttemptAt.toISOString(),
  ...(row.lastError ? { lastError: row.lastError } : {}),
  ...(row.sentAt ? { sentAt: row.sentAt.toISOString() } : {}),
  ...(row.failedAt ? { failedAt: row.failedAt.toISOString() } : {}),
  createdAt: row.createdAt.toISOString(),
});

async function linkRolesOf(client: Queryable, clinicId: string) {
  const row = (
    await client.query<{ roles: unknown }>(
      `SELECT telegram_link_roles AS "roles" FROM clinics WHERE id = $1`,
      [clinicId],
    )
  ).rows[0];
  return resolveTelegramLinkRoles(
    row?.roles === null || row?.roles === undefined
      ? undefined
      : json<unknown>(row.roles),
  );
}

export function createTelegramRepository(context: MysqlRepositoryContext) {
  const pool = context.pool;
  return {
    async getTelegramSettings(clinicId: string) {
      return { linkRoles: await linkRolesOf(pool, clinicId) };
    },

    async saveTelegramSettings(clinicId: string, input: TelegramSettingsInput) {
      await pool.query(
        `UPDATE clinics SET telegram_link_roles = $2 WHERE id = $1`,
        [clinicId, JSON.stringify(input.linkRoles)],
      );
      return { linkRoles: await linkRolesOf(pool, clinicId) };
    },

    async getTelegramLink(clinicId: string, userId: string) {
      const row = (
        await pool.query<LinkRow>(
          `SELECT ${linkColumns} FROM telegram_links l
            WHERE l.clinic_id = $1 AND l.user_id = $2`,
          [clinicId, userId],
        )
      ).rows[0];
      return row ? mapLink(row) : null;
    },

    async listTelegramLinks(clinicId: string) {
      const result = await pool.query<LinkRow>(
        `SELECT ${linkColumns} FROM telegram_links l
           JOIN users u ON u.id = l.user_id AND u.clinic_id = l.clinic_id
          WHERE l.clinic_id = $1 AND u.active = 1
          ORDER BY l.linked_at, l.id`,
        [clinicId],
      );
      return result.rows.map(mapLink);
    },

    async deleteTelegramLink(clinicId: string, userId: string) {
      const result = await pool.query(
        `DELETE FROM telegram_links WHERE clinic_id = $1 AND user_id = $2`,
        [clinicId, userId],
      );
      return result.rowCount > 0;
    },

    async createTelegramLinkCode(
      clinicId: string,
      userId: string,
      code: { codeHash: string; expiresAt: string },
    ) {
      await context.inTransaction(async (client) => {
        await client.query(
          `DELETE FROM telegram_link_codes
            WHERE clinic_id = $1 AND user_id = $2 AND used_at IS NULL`,
          [clinicId, userId],
        );
        await insertRows(client, "telegram_link_codes", [
          {
            id: randomUUID(),
            clinic_id: clinicId,
            user_id: userId,
            code_hash: code.codeHash,
            expires_at: code.expiresAt,
          },
        ]);
      });
    },

    async linkTelegramChat({
      codeHash,
      chatId,
      now,
    }: {
      codeHash: string;
      chatId: string;
      now: string;
    }): Promise<TelegramLinkAttempt> {
      return context.inTransaction(async (client) => {
        const code = (
          await client.query<{
            id: string;
            clinicId: string;
            userId: string;
            expiresAt: Date;
            usedAt: Date | null;
          }>(
            `SELECT id, clinic_id AS "clinicId", user_id AS "userId",
                    expires_at AS "expiresAt", used_at AS "usedAt"
               FROM telegram_link_codes WHERE code_hash = $1 FOR UPDATE`,
            [codeHash],
          )
        ).rows[0];
        if (!code) return { status: "invalid" };
        if (code.usedAt) return { status: "used" };
        if (code.expiresAt.getTime() <= Date.parse(now))
          return { status: "expired" };
        const user = (
          await client.query<{
            fullName: string;
            role: UserRole;
            active: unknown;
          }>(
            `SELECT full_name AS "fullName", role, active FROM users
              WHERE clinic_id = $1 AND id = $2`,
            [code.clinicId, code.userId],
          )
        ).rows[0];
        const roles = await linkRolesOf(client, code.clinicId);
        if (!user || !bool(user.active) || !roles.includes(user.role))
          return { status: "forbidden" };
        await client.query(
          `UPDATE telegram_link_codes SET used_at = $2 WHERE id = $1`,
          [code.id, now],
        );
        await client.query(
          `INSERT INTO telegram_links (id, clinic_id, user_id, chat_id, linked_at)
           VALUES ($1, $2, $3, $4, $5)
           ON DUPLICATE KEY UPDATE chat_id = VALUES(chat_id), linked_at = VALUES(linked_at)`,
          [randomUUID(), code.clinicId, code.userId, chatId, now],
        );
        return {
          status: "linked",
          clinicId: code.clinicId,
          userId: code.userId,
          userName: user.fullName,
        };
      });
    },

    async enqueueTelegramMessages(
      clinicId: string | null,
      messages: { chatId: string; message: string }[],
      at: string,
    ) {
      await insertRows(
        pool,
        "telegram_outbox",
        messages.map((item) => ({
          id: randomUUID(),
          clinic_id: clinicId,
          chat_id: item.chatId,
          message: item.message,
          next_attempt_at: at,
          created_at: at,
        })),
      );
    },

    async claimTelegramOutbox({
      now,
      leaseUntil,
      limit,
      clinicId,
    }: {
      now: string;
      leaseUntil: string;
      limit: number;
      clinicId?: string;
    }) {
      return context.inTransaction(async (client) => {
        const due = await client.query<OutboxRow>(
          `SELECT ${outboxColumns} FROM telegram_outbox
            WHERE sent_at IS NULL AND failed_at IS NULL AND next_attempt_at <= $1
              AND ($2 IS NULL OR clinic_id = $2)
            ORDER BY next_attempt_at, created_at, id
            LIMIT ${Math.max(1, Math.floor(limit))}
            FOR UPDATE SKIP LOCKED`,
          [now, clinicId ?? null],
        );
        const ids = due.rows.map((row) => row.id);
        if (ids.length)
          await client.query(
            `UPDATE telegram_outbox SET next_attempt_at = $1
              WHERE ${inJsonArray("id", "$2")}`,
            [leaseUntil, ids],
          );
        return due.rows.map(mapOutbox);
      });
    },

    async recordTelegramDelivery(id: string, result: TelegramDeliveryResult) {
      if ("sentAt" in result) {
        await pool.query(
          `UPDATE telegram_outbox
              SET attempts = LEAST(attempts + 1, 5), sent_at = $2, last_error = NULL
            WHERE id = $1 AND sent_at IS NULL AND failed_at IS NULL`,
          [id, result.sentAt],
        );
        return;
      }
      await pool.query(
        `UPDATE telegram_outbox
            SET attempts = LEAST(attempts + 1, 5), last_error = $2,
                next_attempt_at = COALESCE($3, next_attempt_at), failed_at = $4
          WHERE id = $1 AND sent_at IS NULL AND failed_at IS NULL`,
        [
          id,
          result.error,
          "nextAttemptAt" in result ? result.nextAttemptAt : null,
          "failedAt" in result ? result.failedAt : null,
        ],
      );
    },

    async listTelegramOutbox(clinicId: string) {
      const result = await pool.query<OutboxRow>(
        `SELECT ${outboxColumns} FROM telegram_outbox
          WHERE clinic_id = $1 ORDER BY created_at, id`,
        [clinicId],
      );
      return result.rows.map(mapOutbox);
    },
  };
}
