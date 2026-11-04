import {
  INCOMPLETE_REGISTRATION_TAG,
  MISSING_EMAIL_TAG,
  patientImportInputSchema,
  patientUpdateInputSchema,
  withAutomaticPatientTags,
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
import { nextTestCpf } from "../../../test-support/cpf.js";
import { testPatientContact } from "../../../test-support/patient-contact.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

const imported = (fullName: string, phone: string) =>
  patientImportInputSchema.parse({
    fullName,
    phone,
    cpf: nextTestCpf(),
    tags: [],
  });

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cliente importado pela planilha (CD3)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("imported");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("grava a data da importação só nos importados e ela sobrevive à edição", async () => {
        const before = Date.now();
        expect(
          await repository.importPatients(clinicId, [
            imported("Nina Planilha", "11955580001"),
          ]),
        ).toEqual({ created: 1, skipped: 0 });
        const manual = await repository.createPatient(clinicId, {
          fullName: "Otto Manual",
          phone: "11955580002",
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });

        const [nina] = await repository.listPatients(clinicId, "Nina Planilha");
        expect(nina?.importedAt).toEqual(expect.any(String));
        expect(Date.parse(nina!.importedAt!)).toBeGreaterThanOrEqual(
          before - 1_000,
        );
        expect(
          (await repository.getPatient(clinicId, manual.id))?.importedAt,
        ).toBeUndefined();
        expect(withAutomaticPatientTags(nina!, null).tags).toEqual([
          INCOMPLETE_REGISTRATION_TAG,
          MISSING_EMAIL_TAG,
        ]);
        expect(withAutomaticPatientTags(manual, null).tags).toEqual([]);

        if (pool) {
          const rows = await pool.query<{
            fullName: string;
            imported: number;
          }>(
            `SELECT full_name AS "fullName", imported_at IS NOT NULL AS imported
             FROM patients WHERE clinic_id = $1 AND full_name IN ('Nina Planilha', 'Otto Manual')
             ORDER BY full_name`,
            [clinicId],
          );
          expect(
            rows.rows.map((row) => [row.fullName, Number(row.imported)]),
          ).toEqual([
            ["Nina Planilha", 1],
            ["Otto Manual", 0],
          ]);
        }

        const updated = await repository.updatePatient(
          clinicId,
          nina!.id,
          patientUpdateInputSchema.parse({
            fullName: "Nina Planilha",
            phone: "11955580001",
            cpf: nina!.cpf,
            email: "nina@example.com",
            tags: [],
            ...testPatientContact,
          }),
        );
        expect(updated?.importedAt).toBe(nina!.importedAt);
        expect(withAutomaticPatientTags(updated!, null).tags).toEqual([]);
      });
    },
  );
}
