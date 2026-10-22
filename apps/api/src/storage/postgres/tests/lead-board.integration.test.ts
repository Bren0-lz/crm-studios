import {
  buildLeadFilterOptions,
  buildLeadInsights,
  leadContactInputSchema,
  leadInputSchema,
  leadStageSchema,
  matchesLead,
  type LeadFilter,
} from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations, seedDemoData } from "../../../database.js";
import { databaseConnectionConfig } from "../../../infrastructure/database-connection.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { PostgresClinicRepository } from "../../../postgres-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const timezone = "America/Sao_Paulo";

// Funil paginado: as páginas, os totais e os indicadores calculados no banco precisam bater
// com os filtros em memória (`matchesLead`/`buildLeadInsights`) sobre a lista completa.
for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: funil comercial paginado`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `leadboard_${randomUUID().replaceAll("-", "")}`;

      beforeAll(async () => {
        if (storage === "memory") return;
        const connection = databaseConnectionConfig({
          url: process.env.TEST_DATABASE_URL!,
          ssl: "auto",
        });
        adminPool = new Pool(connection);
        await adminPool.query(`CREATE SCHEMA ${schema}`);
        await adminPool.query(
          `CREATE TABLE ${schema}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
        );
        pool = new Pool({
          ...connection,
          options: `-c search_path=${schema},public`,
        });
        await runMigrations(pool);
        await seedDemoData(pool);
        repository = new PostgresClinicRepository(pool);
      }, 20_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        try {
          await pool?.end();
          if (adminPool)
            await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          await adminPool?.end();
        }
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
          for (const stage of leadStageSchema.options) {
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
