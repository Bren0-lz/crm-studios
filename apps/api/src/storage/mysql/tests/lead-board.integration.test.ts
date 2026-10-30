import {
  buildLeadFilterOptions,
  buildLeadInsights,
  leadContactInputSchema,
  leadInputSchema,
  defaultLeadStageKeys,
  matchesLead,
  type LeadFilter,
} from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
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
const timezone = "America/Sao_Paulo";

// Funil paginado: as páginas, os totais e os indicadores calculados no banco precisam bater
// com os filtros em memória (`matchesLead`/`buildLeadInsights`) sobre a lista completa.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: funil comercial paginado`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadboard");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
    });

      it("pages each stage and summarizes like the in-memory filters", async () => {
        const create = (
          fullName: string,
          extra: Record<string, unknown> = {},
        ) =>
          repository.createLead(
            clinicId,
            leadInputSchema.parse({
              fullName,
              phone: "31955554444",
              source: "Instagram Board",
              interest: "Pilates",
              ...extra,
            }),
          );
        const jose = await create("José Paginação", {
          tags: ["Ação"],
          contactMethod: "WhatsApp",
          interests: ["Postura"],
        });
        const lost = await create("Lead Perdido Board", {
          source: "Site Board",
        });
        for (let index = 0; index < 7; index += 1)
          await create(`Lead Lote ${index}`);
        await repository.moveLead(clinicId, actorId, lost.id, "lost", "Preço");
        await repository.createLeadContact(
          clinicId,
          actorId,
          jose.id,
          leadContactInputSchema.parse({
            channel: "phone",
            direction: "outbound",
            notes: "Primeiro contato",
          }),
        );
        await repository.createLeadTask(clinicId, actorId, jose.id, {
          title: "Retornar",
          dueAt: "2000-01-01T12:00:00Z",
        });

        const all = await repository.listLeads(clinicId);
        const filters: LeadFilter[] = [
          {},
          { search: "jose acao" },
          { search: "ACAO" },
          { source: "Instagram Board" },
          { interest: "Postura" },
          { contactMethod: "WhatsApp" },
          { lostReason: "Preço" },
          { stage: "lost" },
          { tasks: "open" },
          { tasks: "overdue" },
          { tasks: "none", source: "Instagram Board" },
          { contact: "with" },
          { contact: "without", source: "Instagram Board" },
          { from: "2000-01-01", to: "2999-12-31" },
          { to: "2000-01-01" },
        ];
        for (const filter of filters) {
          const expected = all.filter((lead) =>
            matchesLead(lead, filter, timezone),
          );
          for (const stage of defaultLeadStageKeys) {
            const inStage = expected.filter((lead) => lead.stage === stage);
            const pages = [];
            for (let offset = 0; offset < inStage.length + 3; offset += 3) {
              const page = await repository.listLeadStagePage(
                clinicId,
                stage,
                filter,
                { offset, limit: 3 },
                timezone,
              );
              expect(page.total, JSON.stringify({ filter, stage })).toBe(
                inStage.length,
              );
              expect(page.overdue, JSON.stringify({ filter, stage })).toBe(
                inStage.filter((lead) => lead.overdueTasks > 0).length,
              );
              pages.push(...page.leads);
            }
            expect(
              pages.map((lead) => lead.id).sort(),
              JSON.stringify({ filter, stage }),
            ).toEqual(inStage.map((lead) => lead.id).sort());
          }
          expect(
            await repository.summarizeLeads(clinicId, filter, timezone),
            JSON.stringify(filter),
          ).toEqual(buildLeadInsights(expected));
        }
        expect(await repository.listLeadFilterOptions(clinicId)).toEqual(
          buildLeadFilterOptions(all),
        );
      });
    },
  );
}
