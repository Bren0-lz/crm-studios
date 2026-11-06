import {
  resolveTelegramLinkRoles,
  type TelegramSettingsInput,
  type UserRole,
} from "@crm/contracts";
import type {
  TelegramDeliveryResult,
  TelegramLink,
  TelegramLinkAttempt,
  TelegramOutboxMessage,
} from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid } from "./helpers.js";

/** Estado do Telegram em memória (tabelas `telegram_*` e `clinics.telegram_link_roles`). */
export interface TelegramMemoryState {
  links: TelegramLink[];
  codes: {
    clinicId: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    usedAt?: string;
  }[];
  outbox: TelegramOutboxMessage[];
  linkRoles: Map<string, UserRole[]>;
}

export function createTelegramRepository(context: MemoryRepositoryContext) {
  const state = context.telegram;
  const settingsOf = (clinicId: string) => ({
    linkRoles: resolveTelegramLinkRoles(state.linkRoles.get(clinicId)),
  });
  const activeUser = (clinicId: string, userId: string) =>
    context.users.find(
      (user) => user.clinicId === clinicId && user.id === userId && user.active,
    );

  return {
    async getTelegramSettings(clinicId: string) {
      return settingsOf(clinicId);
    },

    async saveTelegramSettings(clinicId: string, input: TelegramSettingsInput) {
      state.linkRoles.set(clinicId, [...input.linkRoles]);
      return settingsOf(clinicId);
    },

    async getTelegramLink(clinicId: string, userId: string) {
      const link = state.links.find(
        (item) => item.clinicId === clinicId && item.userId === userId,
      );
      return link ? { ...link } : null;
    },

    async listTelegramLinks(clinicId: string) {
      return state.links
        .filter(
          (item) =>
            item.clinicId === clinicId && activeUser(clinicId, item.userId),
        )
        .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt))
        .map((item) => ({ ...item }));
    },

    async deleteTelegramLink(clinicId: string, userId: string) {
      const index = state.links.findIndex(
        (item) => item.clinicId === clinicId && item.userId === userId,
      );
      if (index < 0) return false;
      state.links.splice(index, 1);
      return true;
    },

    async createTelegramLinkCode(
      clinicId: string,
      userId: string,
      code: { codeHash: string; expiresAt: string },
    ) {
      state.codes = state.codes.filter(
        (item) =>
          item.usedAt ||
          !(item.clinicId === clinicId && item.userId === userId),
      );
      state.codes.push({ clinicId, userId, ...code });
    },

    async linkTelegramChat({
      codeHash,
      chatId,
      now: at,
    }: {
      codeHash: string;
      chatId: string;
      now: string;
    }): Promise<TelegramLinkAttempt> {
      const code = state.codes.find((item) => item.codeHash === codeHash);
      if (!code) return { status: "invalid" };
      if (code.usedAt) return { status: "used" };
      if (code.expiresAt <= at) return { status: "expired" };
      const user = activeUser(code.clinicId, code.userId);
      if (!user || !settingsOf(code.clinicId).linkRoles.includes(user.role))
        return { status: "forbidden" };
      code.usedAt = at;
      const existing = state.links.find(
        (item) => item.clinicId === code.clinicId && item.userId === user.id,
      );
      if (existing) Object.assign(existing, { chatId, linkedAt: at });
      else
        state.links.push({
          clinicId: code.clinicId,
          userId: user.id,
          chatId,
          linkedAt: at,
        });
      return {
        status: "linked",
        clinicId: code.clinicId,
        userId: user.id,
        userName: user.fullName,
      };
    },

    async enqueueTelegramMessages(
      clinicId: string | null,
      messages: { chatId: string; message: string }[],
      createdAt: string,
    ) {
      for (const item of messages)
        state.outbox.push({
          id: uuid(),
          clinicId,
          chatId: item.chatId,
          message: item.message,
          attempts: 0,
          nextAttemptAt: createdAt,
          createdAt,
        });
    },

    async claimTelegramOutbox({
      now: at,
      leaseUntil,
      limit,
      clinicId,
    }: {
      now: string;
      leaseUntil: string;
      limit: number;
      clinicId?: string;
    }) {
      const due = state.outbox
        .filter(
          (item) =>
            !item.sentAt &&
            !item.failedAt &&
            Date.parse(item.nextAttemptAt) <= Date.parse(at) &&
            (clinicId === undefined || item.clinicId === clinicId),
        )
        .sort(
          (a, b) =>
            a.nextAttemptAt.localeCompare(b.nextAttemptAt) ||
            a.createdAt.localeCompare(b.createdAt),
        )
        .slice(0, limit);
      for (const item of due) item.nextAttemptAt = leaseUntil;
      return due.map((item) => ({ ...item }));
    },

    async recordTelegramDelivery(id: string, result: TelegramDeliveryResult) {
      const item = state.outbox.find((entry) => entry.id === id);
      if (!item || item.sentAt || item.failedAt) return;
      item.attempts = Math.min(item.attempts + 1, 5);
      if ("sentAt" in result) {
        item.sentAt = result.sentAt;
        delete item.lastError;
        return;
      }
      item.lastError = result.error;
      if ("failedAt" in result) item.failedAt = result.failedAt;
      else item.nextAttemptAt = result.nextAttemptAt;
    },

    async listTelegramOutbox(clinicId: string) {
      return state.outbox
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((item) => ({ ...item }));
    },
  };
}
