import { leadInputSchema, leadStagesInputSchema } from "@crm/contracts";
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

for (const storage of ["memory", "postgres"] as const) {
  describe.skipIf(storage === "postgres" && !process.env.TEST_DATABASE_URL)(
    `${storage}: funil configurável`,
    () => {
      let repository: ClinicRepository;
      let adminPool: Pool | undefined;
      let pool: Pool | undefined;
      const schema = `leadstages_${randomUUID().replaceAll("-", "")}`;

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

      it("saves the funnel, uses it for new leads and moves and guards stages with leads", async () => {
        const current = await repository.listLeadStages(clinicId);
        expect(current.map((item) => item.kind)).toEqual([
          "open",
          "open",
          "open",
          "open",
          "won",
          "lost",
        ]);
        const kept = current
          .filter((item) => item.stage !== "new_contact")
          .map(({ stage, label }) => ({ stage, label }));
        const newLead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead em Novos",
            phone: "31977775555",
            source: "Site",
            interest: "Pilates",
          }),
        );
        expect(newLead.stage).toBe("new_contact");
        // Com lead em "Novos", remover a etapa é bloqueado.
        const blocked = await repository
          .saveLeadStages(
            clinicId,
            leadStagesInputSchema.parse({ stages: kept }),
          )
          .catch((error: Error) => error);
        expect(blocked).toBeInstanceOf(Error);
        expect((await repository.listLeadStages(clinicId)).length).toBe(6);

        const saved = await repository.saveLeadStages(
          clinicId,
          leadStagesInputSchema.parse({
            stages: [
              { label: "Triagem" },
              ...current.map(({ stage, label }) => ({
                stage,
                label: stage === "won" ? "Matrícula" : label,
              })),
            ],
          }),
        );
        expect(saved[0]).toMatchObject({ label: "Triagem", kind: "open" });
        expect(saved.find((item) => item.stage === "won")?.label).toBe(
          "Matrícula",
        );
        expect(await repository.listLeadStages(clinicId)).toEqual(saved);

        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead do funil configurável",
            phone: "31977776666",
            source: "Site",
            interest: "Pilates",
          }),
        );
        expect(lead.stage).toBe(saved[0]!.stage);
        expect(
          (await repository.moveLead(clinicId, actorId, lead.id, "proposal"))
            ?.stage,
        ).toBe("proposal");
        await expect(
          repository.moveLead(clinicId, actorId, lead.id, "stage_inexistente"),
        ).rejects.toThrow("Etapa do funil não encontrada.");
      });
    },
  );
}
