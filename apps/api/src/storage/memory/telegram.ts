import {
  resolveTelegramLinkRoles,
  resolveTelegramTopics,
  type TelegramGroupLink,
  type TelegramSettingsInput,
  type TelegramTopic,
  type UserRole,
} from "@crm/contracts";
import type {
  TelegramChatKind,
  TelegramClinicGroupLink,
  TelegramDeliveryResult,
  TelegramLink,
  TelegramLinkAttempt,
  TelegramOutboxMessage,
} from "../../repository.js";
import type { MemoryRepositoryContext } from "./context.js";
import { uuid } from "./helpers.js";

/** Estado do Telegram em memória (tabelas `telegram_*` e `clinics.telegram_link_roles`). */
export interface TelegramMemoryState {
  /** `topics` null = todos (coluna `telegram_links.topics`). */
  links: (Omit<TelegramLink, "topics"> & { topics: TelegramTopic[] | null })[];
  /** Grupos vinculados (TG7); `linkedByUserId` null se o usuário foi excluído. */
  groups: (Omit<TelegramClinicGroupLink, "linkedByName"> & {
    linkedByUserId: string | null;
  })[];
  codes: {
    clinicId: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    usedAt?: string;
    /** Código de grupo (TG7): os assuntos escolhidos ao gerar. */
    groupTopics?: TelegramTopic[];
  }[];
  outbox: TelegramOutboxMessage[];
  linkRoles: Map<string, UserRole[]>;
  /** Último aviso de recibos por clínica (`clinics.telegram_receipt_reminder_sent_on`). */
  receiptReminderSentOn: Map<string, string>;
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
  const toLink = (
    item: TelegramMemoryState["links"][number],
  ): TelegramLink => ({
    ...item,
    topics: resolveTelegramTopics(item.topics),
  });
  const toGroup = ({
    linkedByUserId,
    ...item
  }: TelegramMemoryState["groups"][number]): TelegramClinicGroupLink => ({
    ...item,
    topics: resolveTelegramTopics(item.topics),
    linkedByName:
      context.users.find(
        (user) => user.clinicId === item.clinicId && user.id === linkedByUserId,
      )?.fullName ?? null,
  });
  const withoutClinic = (
    group: TelegramClinicGroupLink,
  ): TelegramGroupLink => ({
    id: group.id,
    chatId: group.chatId,
    title: group.title,
    topics: group.topics,
    linkedAt: group.linkedAt,
    linkedByName: group.linkedByName,
  });

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
      return link ? toLink(link) : null;
    },

    async listTelegramLinks(clinicId: string) {
      return state.links
        .filter(
          (item) =>
            item.clinicId === clinicId && activeUser(clinicId, item.userId),
        )
        .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt))
        .map(toLink);
    },

    async findTelegramLinksByChat(chatId: string) {
      return state.links
        .filter(
          (item) =>
            item.chatId === chatId && activeUser(item.clinicId, item.userId),
        )
        .sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))
        .map(toLink);
    },

    async getTelegramReceiptReminderSentOn(clinicId: string) {
      return state.receiptReminderSentOn.get(clinicId) ?? null;
    },

    async claimTelegramReceiptReminder(clinicId: string, sentOn: string) {
      if (state.receiptReminderSentOn.get(clinicId) === sentOn) return false;
      state.receiptReminderSentOn.set(clinicId, sentOn);
      return true;
    },

    async deleteTelegramLink(clinicId: string, userId: string) {
      const index = state.links.findIndex(
        (item) => item.clinicId === clinicId && item.userId === userId,
      );
      if (index < 0) return false;
      state.links.splice(index, 1);
      return true;
    },

    async setTelegramLinkTopics(
      clinicId: string,
      userId: string,
      topics: TelegramTopic[],
    ) {
      const link = state.links.find(
        (item) => item.clinicId === clinicId && item.userId === userId,
      );
      if (!link) return null;
      link.topics = [...topics];
      return toLink(link);
    },

    async listTelegramGroupLinks(clinicId: string) {
      return state.groups
        .filter((item) => item.clinicId === clinicId)
        .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt))
        .map((item) => withoutClinic(toGroup(item)));
    },

    async findTelegramGroupLinksByChat(chatId: string) {
      return state.groups
        .filter((item) => item.chatId === chatId)
        .sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))
        .map(toGroup);
    },

    async updateTelegramGroupLink(
      clinicId: string,
      id: string,
      topics: TelegramTopic[],
    ) {
      const group = state.groups.find(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (!group) return null;
      group.topics = [...topics];
      return withoutClinic(toGroup(group));
    },

    async deleteTelegramGroupLink(clinicId: string, id: string) {
      const index = state.groups.findIndex(
        (item) => item.clinicId === clinicId && item.id === id,
      );
      if (index < 0) return false;
      state.groups.splice(index, 1);
      return true;
    },

    async createTelegramLinkCode(
      clinicId: string,
      userId: string,
      code: {
        codeHash: string;
        expiresAt: string;
        groupTopics?: TelegramTopic[];
      },
    ) {
      state.codes = state.codes.filter(
        (item) =>
          item.usedAt ||
          !(item.clinicId === clinicId && item.userId === userId),
      );
      state.codes.push({
        clinicId,
        userId,
        codeHash: code.codeHash,
        expiresAt: code.expiresAt,
        ...(code.groupTopics ? { groupTopics: [...code.groupTopics] } : {}),
      });
    },

    async linkTelegramChat({
      codeHash,
      chatId,
      chatKind = "private",
      chatTitle,
      now: at,
    }: {
      codeHash: string;
      chatId: string;
      chatKind?: TelegramChatKind;
      chatTitle?: string;
      now: string;
    }): Promise<TelegramLinkAttempt> {
      const code = state.codes.find((item) => item.codeHash === codeHash);
      if (!code) return { status: "invalid" };
      if (code.usedAt) return { status: "used" };
      if (code.expiresAt <= at) return { status: "expired" };
      const groupTopics = code.groupTopics
        ? resolveTelegramTopics(code.groupTopics)
        : undefined;
      if (groupTopics && chatKind !== "group") return { status: "needs_group" };
      if (!groupTopics && chatKind === "group")
        return { status: "needs_private" };
      const user = activeUser(code.clinicId, code.userId);
      const allowed = groupTopics
        ? user?.role === "admin"
        : user && settingsOf(code.clinicId).linkRoles.includes(user.role);
      if (!user || !allowed) return { status: "forbidden" };
      code.usedAt = at;
      if (groupTopics) {
        const title = chatTitle?.trim().slice(0, 191) || null;
        const group = state.groups.find(
          (item) => item.clinicId === code.clinicId && item.chatId === chatId,
        );
        if (group)
          Object.assign(group, {
            title,
            topics: [...groupTopics],
            linkedByUserId: user.id,
            linkedAt: at,
          });
        else
          state.groups.push({
            id: uuid(),
            clinicId: code.clinicId,
            chatId,
            title,
            topics: [...groupTopics],
            linkedByUserId: user.id,
            linkedAt: at,
          });
        return {
          status: "linked",
          kind: "group",
          clinicId: code.clinicId,
          userId: user.id,
          userName: user.fullName,
          topics: [...groupTopics],
        };
      }
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
          topics: null,
        });
      return {
        status: "linked",
        kind: "private",
        clinicId: code.clinicId,
        userId: user.id,
        userName: user.fullName,
        topics: resolveTelegramTopics(existing?.topics ?? null),
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
