import { readFile } from "node:fs/promises";
import { createDatabasePool } from "../../../database.js";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { OWNER_ID } from "../../../test-support/legacy-fixtures.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const migration = new URL(
  "../../../../migrations/0051_service_business_line_nullable.sql",
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

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: linha do serviço no painel de vendas`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("servicebizline");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("creates without classification by default, lists it, keeps it on edits that omit it and clears it with null", async () => {
        const unclassified = await repository.createService(clinicId, {
          name: "Pilates em grupo",
          durationMinutes: 50,
          priceInCents: 9000,
        });
        const laser = await repository.createService(clinicId, {
          name: "Depilação a laser",
          durationMinutes: 30,
          priceInCents: 15000,
          businessLine: "aesthetics",
        });
        const explicitNull = await repository.createService(clinicId, {
          name: "Massagem relaxante",
          durationMinutes: 60,
          priceInCents: 12000,
          businessLine: null,
        });
        expect(unclassified.businessLine).toBeNull();
        expect(explicitNull.businessLine).toBeNull();
        expect(laser.businessLine).toBe("aesthetics");
        const listed = await repository.listServices(clinicId);
        expect(listed.find((item) => item.id === laser.id)?.businessLine).toBe(
          "aesthetics",
        );
        expect(
          listed.find((item) => item.id === unclassified.id)?.businessLine,
        ).toBeNull();
        expect(
          listed.every((item) =>
            [null, "studio", "aesthetics"].includes(item.businessLine),
          ),
        ).toBe(true);

        const registryLine = async (id: string) =>
          (await repository.getAdministrativeRegistry(clinicId)).services.find(
            (item) => item.id === id,
          )?.businessLine;
        expect(await registryLine(laser.id)).toBe("aesthetics");
        expect(await registryLine(unclassified.id)).toBeNull();

        const edit = (
          id: string,
          extra: { businessLine?: "studio" | "aesthetics" | null },
        ) =>
          repository.updateAdministrativeRegistry(clinicId, OWNER_ID, id, {
            kind: "service",
            data: {
              name: "Depilação a laser (axilas)",
              durationMinutes: 30,
              priceInCents: 15000,
              active: true,
              ...extra,
            },
          });

        // Edição sem o campo mantém a linha atual.
        expect(await edit(laser.id, {})).toMatchObject({
          businessLine: "aesthetics",
        });
        expect(await registryLine(laser.id)).toBe("aesthetics");

        expect(await edit(laser.id, { businessLine: "studio" })).toMatchObject({
          businessLine: "studio",
        });
        expect(await registryLine(laser.id)).toBe("studio");

        // `null` explícito limpa (sem classificação, "Outros" no painel).
        expect(await edit(laser.id, { businessLine: null })).toMatchObject({
          businessLine: null,
        });
        expect(await registryLine(laser.id)).toBeNull();

        // E continua sem classificação numa edição que omite o campo.
        expect(await edit(laser.id, {})).toMatchObject({ businessLine: null });
        expect(await registryLine(laser.id)).toBeNull();
      });

      it.skipIf(storage === "memory")(
        "migration 0051 leaves every existing service without classification and keeps the check",
        async () => {
          const classified = await repository.createService(clinicId, {
            name: "Pilates avançado",
            durationMinutes: 50,
            priceInCents: 9500,
            businessLine: "studio",
          });
          await pool!.query(
            "UPDATE services SET business_line = 'aesthetics' WHERE clinic_id = $1 AND id <> $2",
            [clinicId, classified.id],
          );
          const before = await pool!.query<{ total: number }>(
            "SELECT COUNT(*) AS total FROM services WHERE business_line IS NOT NULL",
          );
          expect(Number(before.rows[0]!.total)).toBeGreaterThan(1);

          await runScript(pool!, await readFile(migration, "utf8"));

          const after = await pool!.query<{ total: number }>(
            "SELECT COUNT(*) AS total FROM services WHERE business_line IS NOT NULL",
          );
          expect(Number(after.rows[0]!.total)).toBe(0);
          expect(
            (await repository.listServices(clinicId)).every(
              (item) => item.businessLine === null,
            ),
          ).toBe(true);
          await expect(
            pool!.query(
              "UPDATE services SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
              ["dance", clinicId, classified.id],
            ),
          ).rejects.toThrow();
          await pool!.query(
            "UPDATE services SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
            ["aesthetics", clinicId, classified.id],
          );
        },
      );

      it.skipIf(storage === "memory")(
        "rejects an unknown business line in the database",
        async () => {
          const service = await repository.createService(clinicId, {
            name: "Massoterapia",
            durationMinutes: 60,
            priceInCents: 17000,
          });
          await expect(
            pool!.query(
              "UPDATE services SET business_line = $1 WHERE clinic_id = $2 AND id = $3",
              ["dance", clinicId, service.id],
            ),
          ).rejects.toThrow();
        },
      );
    },
  );
}
