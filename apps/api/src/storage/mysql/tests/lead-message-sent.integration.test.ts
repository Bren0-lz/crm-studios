import { leadContactInputSchema, leadInputSchema } from "@crm/contracts";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// Situação "mensagem enviada" do lead: último contato realizado (outbound) e total de contatos,
// iguais na memória e no MySQL, na lista e na página do funil.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: mensagem enviada ao lead`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadmsg");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("exposes the last sent message date/time and the contact count", async () => {
        const create = (fullName: string) =>
          repository.createLead(
            clinicId,
            leadInputSchema.parse({
              fullName,
              phone: "31955554444",
              source: "Instagram Mensagem",
              interest: "Pilates",
            }),
          );
        const sent = await create("Lead Mensagem Enviada");
        const pending = await create("Lead Sem Mensagem");
        const contact = (
          leadId: string,
          direction: "inbound" | "outbound" | "internal",
          occurredAt: string,
        ) =>
          repository.createLeadContact(
            clinicId,
            actorId,
            leadId,
            leadContactInputSchema.parse({
              channel: "whatsapp",
              contactMethod: "WhatsApp",
              direction,
              notes: "Mensagem enviada.",
              occurredAt,
            }),
          );
        await contact(sent.id, "outbound", "2026-11-10T13:05:00.000Z");
        await contact(sent.id, "outbound", "2026-11-10T17:32:00.000Z");
        // Resposta do lead depois do envio: não muda a data do envio.
        await contact(sent.id, "inbound", "2026-11-10T18:00:00.000Z");
        await contact(pending.id, "internal", "2026-11-10T12:00:00.000Z");

        const leads = await repository.listLeads(clinicId);
        const byName = (name: string) =>
          leads.find((lead) => lead.fullName === name);
        expect(byName("Lead Mensagem Enviada")).toMatchObject({
          lastMessageSentAt: "2026-11-10T17:32:00.000Z",
          lastContactAt: "2026-11-10T18:00:00.000Z",
          contactCount: 3,
        });
        const withoutMessage = byName("Lead Sem Mensagem");
        expect(withoutMessage?.lastMessageSentAt).toBeUndefined();
        expect(withoutMessage?.contactCount).toBe(1);

        const page = await repository.listLeadStagePage(
          clinicId,
          "new_contact",
          { source: "Instagram Mensagem" },
          { offset: 0, limit: 50 },
          "America/Sao_Paulo",
        );
        expect(
          page.leads.find((lead) => lead.id === sent.id),
        ).toMatchObject({
          lastMessageSentAt: "2026-11-10T17:32:00.000Z",
          contactCount: 3,
        });
      });
    },
  );
}
