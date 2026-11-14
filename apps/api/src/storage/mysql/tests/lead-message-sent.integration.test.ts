import { leadInputSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoUserId } from "../../../demo-scenarios.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

// RT2 (D3): ligação e tentativa sem resposta não contam como "Mensagem enviada".
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: última mensagem enviada do lead`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadmsgsent");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("only counts a reached message outside phone and in person", async () => {
        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: `Lia Ligação ${randomUUID().slice(0, 6)}`,
            phone: "11988887777",
            source: "Site",
            interest: "Pilates",
          }),
        );
        const contact = (input: Record<string, unknown>) =>
          repository.createLeadContact(clinicId, demoUserId, lead.id, {
            direction: "outbound",
            notes: "Contato com o lead.",
            ...input,
          } as Parameters<ClinicRepository["createLeadContact"]>[3]);
        const current = async () =>
          (await repository.listLeads(clinicId)).find(
            (item) => item.id === lead.id,
          )!;

        await contact({ channel: "phone", occurredAt: "2026-11-10T12:00:00.000Z" });
        expect(await current()).toMatchObject({ contactCount: 1 });
        expect((await current()).lastMessageSentAt).toBeUndefined();

        await contact({
          channel: "whatsapp",
          reached: false,
          occurredAt: "2026-11-11T12:00:00.000Z",
        });
        expect((await current()).lastMessageSentAt).toBeUndefined();

        await contact({ channel: "in_person", occurredAt: "2026-11-11T13:00:00.000Z" });
        expect((await current()).lastMessageSentAt).toBeUndefined();

        await contact({ channel: "whatsapp", occurredAt: "2026-11-12T12:00:00.000Z" });
        const after = await current();
        expect(after).toMatchObject({ contactCount: 4 });
        expect(new Date(after.lastMessageSentAt!).toISOString()).toBe(
          "2026-11-12T12:00:00.000Z",
        );
      });
    },
  );
}
