import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, seedDemoData } from "../../../database.js";
import { demoClinicId, demoPlanTemplates } from "../../../demo-scenarios.js";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const migration = new URL(
  "../../../../migrations/0035_dedupe_single_plans.sql",
  import.meta.url,
);

async function runScript(pool: Pool, sql: string) {
  const runner = createDatabasePool({
    max: 1,
    url: pool.url,
    multipleStatements: true,
  });
  const connection = await runner.connect();
  try {
    await connection.execute(sql);
  } finally {
    connection.release();
    await runner.end();
  }
}

/** Avulsos ativos de cada serviço da clínica demo (id do serviço → ids dos modelos). */
async function singlePlansByService(pool: Pool) {
  const result = await pool.query<{ serviceId: string; id: string }>(
    `SELECT pts.service_id AS "serviceId", pt.id
     FROM plan_template_services pts
     JOIN plan_templates pt ON pt.id = pts.template_id AND pt.clinic_id = pts.clinic_id
     WHERE pt.clinic_id = $1 AND pt.active = 1 AND pt.plan_type = 'single'
     ORDER BY pt.id`,
    [demoClinicId],
  );
  const byService = new Map<string, string[]>();
  for (const row of result.rows)
    byService.set(row.serviceId, [
      ...(byService.get(row.serviceId) ?? []),
      row.id,
    ]);
  return byService;
}

/** Cópia "<Nome> (avulso)" como a 0026 criava, com id de UUID(). */
async function insertCopy(pool: Pool, serviceId: string, value: number) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO plan_templates (id, clinic_id, name, total_value_in_cents, service_id, kind, total_sessions, plan_type)
     VALUES ($1, $2, 'Cópia (avulso)', $3, $4, 'single', 1, 'single')`,
    [id, demoClinicId, value, serviceId],
  );
  await pool.query(
    `INSERT INTO plan_template_services (clinic_id, template_id, service_id, position, total_sessions, total_value_in_cents)
     VALUES ($1, $2, $3, 0, 1, $4)`,
    [demoClinicId, id, serviceId, value],
  );
  return id;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "mysql: 0035 remove avulsos duplicados",
  () => {
    let database: TestDatabase;
    let pool: Pool;

    beforeAll(async () => {
      database = await createTestDatabase("singledupes");
      pool = database.pool;
    }, 60_000);

    afterAll(async () => {
      await database?.drop();
    });

    it("mantém 1 avulso por serviço, reaponta planos e campanhas e é idempotente", async () => {
      // Banco recém-criado: o seed não duplica o avulso que já existe.
      for (const ids of (await singlePlansByService(pool)).values())
        expect(ids).toHaveLength(1);

      const [first, second] = demoPlanTemplates;
      const firstService = first!.services[0]!.serviceId;
      const secondService = second!.services[0]!.serviceId;
      // Serviço 1: a cópia é usada por um plano de cliente → fica a cópia.
      const usedCopy = await insertCopy(pool, firstService, 7500);
      // Serviço 2: ninguém usa → fica o do seed.
      const unusedCopy = await insertCopy(pool, secondService, 15000);
      const plan = (
        await pool.query<{ id: string }>(
          "SELECT id FROM patient_plans WHERE clinic_id = $1 ORDER BY id LIMIT 1",
          [demoClinicId],
        )
      ).rows[0]!;
      await pool.query(
        "UPDATE patient_plans SET plan_template_id = $1 WHERE id = $2",
        [usedCopy, plan.id],
      );
      const campaignId = randomUUID();
      await pool.query(
        `INSERT INTO auto_campaigns (id, clinic_id, name, \`trigger\`, steps, promotion)
         VALUES ($1, $2, 'Promo QA', 'birthday', '[]', $3)`,
        [
          campaignId,
          demoClinicId,
          JSON.stringify({
            planTemplateIds: [first!.id, unusedCopy, second!.id],
          }),
        ],
      );

      const sql = await readFile(migration, "utf8");
      await runScript(pool, sql);
      await runScript(pool, sql);

      const after = await singlePlansByService(pool);
      expect(after.get(firstService)).toEqual([usedCopy]);
      expect(after.get(secondService)).toEqual([second!.id]);
      for (const ids of after.values()) expect(ids).toHaveLength(1);

      const reference = await pool.query<{ planTemplateId: string }>(
        `SELECT plan_template_id AS "planTemplateId" FROM patient_plans WHERE id = $1`,
        [plan.id],
      );
      expect(reference.rows[0]!.planTemplateId).toBe(usedCopy);
      const orphans = await pool.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM patient_plans pp
         LEFT JOIN plan_templates pt ON pt.id = pp.plan_template_id
         WHERE pp.plan_template_id IS NOT NULL AND pt.id IS NULL`,
      );
      expect(Number(orphans.rows[0]!.total)).toBe(0);

      const campaign = await pool.query<{ ids: string }>(
        `SELECT JSON_EXTRACT(promotion, '$.planTemplateIds') AS ids FROM auto_campaigns WHERE id = $1`,
        [campaignId],
      );
      const ids = JSON.parse(String(campaign.rows[0]!.ids)) as string[];
      // O avulso 1 do seed vira a cópia usada; a cópia não usada vira o do seed (sem repetir).
      expect([...ids].sort()).toEqual([usedCopy, second!.id].sort());

      // O seed rodando de novo não recria o avulso do serviço 1 (já tem a cópia que ficou).
      await seedDemoData(pool);
      expect((await singlePlansByService(pool)).get(firstService)).toEqual([
        usedCopy,
      ]);
    });
  },
);
