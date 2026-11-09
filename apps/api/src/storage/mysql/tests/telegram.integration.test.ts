import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 10, 6, 12, minutes)).toISOString();

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: Telegram (vínculo e fila de saída)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("telegram");
        pool = database.pool;
      }, 60_000);

      beforeEach(async () => {
        if (storage === "memory") repository = new MemoryClinicRepository();
        else {
          await pool!.query("DELETE FROM telegram_outbox");
          await pool!.query("DELETE FROM telegram_links");
          await pool!.query("DELETE FROM telegram_link_codes");
          await pool!.query(
            "UPDATE clinics SET telegram_link_roles = NULL, telegram_receipt_reminder_sent_on = NULL WHERE id = $1",
            [clinicId],
          );
          repository = new MysqlClinicRepository(pool!);
        }
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("guarda os perfis que vinculam (padrão: admin)", async () => {
        expect(await repository.getTelegramSettings(clinicId)).toEqual({
          linkRoles: ["admin"],
        });
        expect(
          await repository.saveTelegramSettings(clinicId, {
            linkRoles: ["admin", "user"],
          }),
        ).toEqual({ linkRoles: ["admin", "user"] });
        expect(
          await repository.saveTelegramSettings(clinicId, { linkRoles: [] }),
        ).toEqual({ linkRoles: [] });
      });

      it("vincula com código de uso único e recusa vencido, usado e perfil sem permissão", async () => {
        const hash = (label: string) => `${label}-${randomUUID()}`;
        expect(
          await repository.linkTelegramChat({
            codeHash: hash("nenhum"),
            chatId: "1",
            now: at(0),
          }),
        ).toEqual({ status: "invalid" });

        const expired = hash("vencido");
        await repository.createTelegramLinkCode(clinicId, ownerId, {
          codeHash: expired,
          expiresAt: at(10),
        });
        expect(
          await repository.linkTelegramChat({
            codeHash: expired,
            chatId: "1",
            now: at(10),
          }),
        ).toEqual({ status: "expired" });

        // Gerar outro código apaga o pendente.
        const valid = hash("valido");
        await repository.createTelegramLinkCode(clinicId, ownerId, {
          codeHash: valid,
          expiresAt: at(20),
        });
        expect(
          (
            await repository.linkTelegramChat({
              codeHash: expired,
              chatId: "1",
              now: at(0),
            })
          ).status,
        ).toBe("invalid");

        expect(
          await repository.linkTelegramChat({
            codeHash: valid,
            chatId: "555",
            now: at(5),
          }),
        ).toEqual({
          status: "linked",
          clinicId,
          userId: ownerId,
          userName: "Aryana Dutra",
        });
        expect(
          await repository.linkTelegramChat({
            codeHash: valid,
            chatId: "777",
            now: at(6),
          }),
        ).toEqual({ status: "used" });
        expect(await repository.getTelegramLink(clinicId, ownerId)).toEqual({
          clinicId,
          userId: ownerId,
          chatId: "555",
          linkedAt: at(5),
        });

        // Vincular de novo troca o chat do usuário.
        const relink = hash("troca");
        await repository.createTelegramLinkCode(clinicId, ownerId, {
          codeHash: relink,
          expiresAt: at(30),
        });
        await repository.linkTelegramChat({
          codeHash: relink,
          chatId: "999",
          now: at(7),
        });
        expect(await repository.listTelegramLinks(clinicId)).toEqual([
          { clinicId, userId: ownerId, chatId: "999", linkedAt: at(7) },
        ]);

        const user = await repository.createAdminUser(
          clinicId,
          ownerId,
          {
            fullName: "Recepção",
            email: `${randomUUID()}@test.local`,
            role: "user",
            password: "Password123",
          },
          "unused-hash",
        );
        const userCode = hash("usuario");
        await repository.createTelegramLinkCode(clinicId, user.id, {
          codeHash: userCode,
          expiresAt: at(30),
        });
        expect(
          await repository.linkTelegramChat({
            codeHash: userCode,
            chatId: "321",
            now: at(8),
          }),
        ).toEqual({ status: "forbidden" });
        await repository.saveTelegramSettings(clinicId, {
          linkRoles: ["admin", "user"],
        });
        expect(
          (
            await repository.linkTelegramChat({
              codeHash: userCode,
              chatId: "321",
              now: at(8),
            })
          ).status,
        ).toBe("linked");
        expect(
          (await repository.listTelegramLinks(clinicId)).map(
            (link) => link.chatId,
          ),
        ).toEqual(["999", "321"]);

        expect(await repository.deleteTelegramLink(clinicId, user.id)).toBe(
          true,
        );
        expect(await repository.deleteTelegramLink(clinicId, user.id)).toBe(
          false,
        );
      });

      it("acha os vínculos do chat (mais recente primeiro, só usuários ativos)", async () => {
        expect(await repository.findTelegramLinksByChat("777")).toEqual([]);
        const link = async (userId: string, minute: number) => {
          const codeHash = `chat-${randomUUID()}`;
          await repository.createTelegramLinkCode(clinicId, userId, {
            codeHash,
            expiresAt: at(30),
          });
          expect(
            (
              await repository.linkTelegramChat({
                codeHash,
                chatId: "777",
                now: at(minute),
              })
            ).status,
          ).toBe("linked");
        };
        await repository.saveTelegramSettings(clinicId, {
          linkRoles: ["admin", "user"],
        });
        const user = await repository.createAdminUser(
          clinicId,
          ownerId,
          {
            fullName: "Recepção do chat",
            email: `${randomUUID()}@test.local`,
            role: "user",
            password: "Password123",
          },
          "unused-hash",
        );
        await link(ownerId, 1);
        await link(user.id, 2);
        expect(await repository.findTelegramLinksByChat("777")).toEqual([
          { clinicId, userId: user.id, chatId: "777", linkedAt: at(2) },
          { clinicId, userId: ownerId, chatId: "777", linkedAt: at(1) },
        ]);
        expect(await repository.findTelegramLinksByChat("778")).toEqual([]);
      });

      it("reserva o aviso de recibos uma vez por dia", async () => {
        expect(
          await repository.getTelegramReceiptReminderSentOn(clinicId),
        ).toBeNull();
        expect(
          await repository.claimTelegramReceiptReminder(clinicId, "2026-11-09"),
        ).toBe(true);
        expect(
          await repository.claimTelegramReceiptReminder(clinicId, "2026-11-09"),
        ).toBe(false);
        expect(
          await repository.getTelegramReceiptReminderSentOn(clinicId),
        ).toBe("2026-11-09");
        const parallel = await Promise.all([
          repository.claimTelegramReceiptReminder(clinicId, "2026-11-10"),
          repository.claimTelegramReceiptReminder(clinicId, "2026-11-10"),
        ]);
        expect(parallel.filter(Boolean)).toHaveLength(1);
        expect(
          await repository.getTelegramReceiptReminderSentOn(clinicId),
        ).toBe("2026-11-10");
      });

      it("reserva, registra falhas, desiste e marca envio na fila", async () => {
        await repository.enqueueTelegramMessages(
          clinicId,
          [
            { chatId: "1", message: "Primeira" },
            { chatId: "2", message: "Segunda" },
          ],
          at(0),
        );
        await repository.enqueueTelegramMessages(
          null,
          [{ chatId: "3", message: "Sem clínica" }],
          at(0),
        );
        expect(
          await repository.claimTelegramOutbox({
            now: at(0),
            leaseUntil: at(2),
            limit: 10,
            clinicId,
          }),
        ).toHaveLength(2);
        // Reservadas: um dreno simultâneo não pega de novo.
        expect(
          (
            await repository.claimTelegramOutbox({
              now: at(1),
              leaseUntil: at(3),
              limit: 10,
            })
          ).map((item) => item.message),
        ).toEqual(["Sem clínica"]);

        const byMessage = async (message: string) =>
          (await repository.listTelegramOutbox(clinicId)).find(
            (item) => item.message === message,
          );
        const first = await byMessage("Primeira");
        const second = await byMessage("Segunda");
        await repository.recordTelegramDelivery(first!.id, { sentAt: at(1) });
        await repository.recordTelegramDelivery(second!.id, {
          error: "fora do ar",
          nextAttemptAt: at(5),
        });
        expect(await byMessage("Primeira")).toMatchObject({
          attempts: 1,
          sentAt: at(1),
        });
        expect(await byMessage("Segunda")).toMatchObject({
          attempts: 1,
          lastError: "fora do ar",
          nextAttemptAt: at(5),
        });
        expect(
          await repository.claimTelegramOutbox({
            now: at(4),
            leaseUntil: at(6),
            limit: 10,
            clinicId,
          }),
        ).toEqual([]);
        const [retry] = await repository.claimTelegramOutbox({
          now: at(5),
          leaseUntil: at(7),
          limit: 10,
          clinicId,
        });
        expect(retry).toMatchObject({ message: "Segunda", attempts: 1 });
        await repository.recordTelegramDelivery(retry!.id, {
          error: "desistiu",
          failedAt: at(5),
        });
        expect(await byMessage("Segunda")).toMatchObject({
          attempts: 2,
          failedAt: at(5),
          lastError: "desistiu",
        });
        expect(
          await repository.claimTelegramOutbox({
            now: at(59),
            leaseUntil: at(59),
            limit: 10,
            clinicId,
          }),
        ).toEqual([]);
        // Gravação depois do fim não muda nada.
        await repository.recordTelegramDelivery(retry!.id, { sentAt: at(9) });
        expect((await byMessage("Segunda"))?.sentAt).toBeUndefined();
      });
    },
  );
}
