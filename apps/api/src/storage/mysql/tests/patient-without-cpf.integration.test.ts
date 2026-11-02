import {
  patientImportInputSchema,
  patientUpdateInputSchema,
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

const clinicId = "11111111-1111-4111-8111-111111111111";

const imported = (fullName: string, phone: string, cpf = "") =>
  patientImportInputSchema.parse({ fullName, phone, cpf, tags: [] });

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cliente sem CPF (B6-05)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("nocpf");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("importa vários clientes sem CPF na mesma clínica e grava NULL", async () => {
        const result = await repository.importPatients(clinicId, [
          imported("Bianca Sem Cpf", "11955530001"),
          imported("Caio Sem Cpf", "11955530002"),
          imported("Davi Com Cpf", "11955530003", nextTestCpf()),
          // Mesmo telefone de outro da planilha: ignorado.
          imported("Bianca Repetida", "(11) 95553-0001"),
        ]);
        expect(result).toEqual({ created: 3, skipped: 1 });

        const found = await repository.listPatients(clinicId, "Sem Cpf");
        expect(found.map((patient) => patient.fullName).sort()).toEqual([
          "Bianca Sem Cpf",
          "Caio Sem Cpf",
        ]);
        expect(found.every((patient) => patient.cpf === undefined)).toBe(true);
        expect(
          (await repository.listPatients(clinicId, "95553-0002")).map(
            (patient) => patient.fullName,
          ),
        ).toEqual(["Caio Sem Cpf"]);
        if (pool) {
          const rows = await pool.query<{ cpf: string | null }>(
            "SELECT cpf FROM patients WHERE clinic_id = $1 AND full_name LIKE '%Sem Cpf'",
            [clinicId],
          );
          expect(rows.rows.map((row) => row.cpf)).toEqual([null, null]);
        }

        // Nova importação na mesma base: o telefone continua barrando o duplicado sem CPF.
        expect(
          await repository.importPatients(clinicId, [
            imported("Caio De Novo", "11955530002"),
          ]),
        ).toEqual({ created: 0, skipped: 1 });
      });

      it("edita sem CPF, preenche depois e recusa CPF de outro cliente", async () => {
        await repository.importPatients(clinicId, [
          imported("Helga Sem Cpf", "11955530010"),
        ]);
        const [helga] = await repository.listPatients(clinicId, "Helga Sem Cpf");
        const update = (cpf: string, phone = "11955530011") =>
          patientUpdateInputSchema.parse({
            fullName: "Helga Sem Cpf",
            phone,
            cpf,
            tags: [],
          });

        const kept = await repository.updatePatient(
          clinicId,
          helga!.id,
          update(""),
        );
        expect(kept?.phone).toBe("11955530011");
        expect(kept?.cpf).toBeUndefined();

        const other = nextTestCpf();
        await repository.createPatient(clinicId, {
          fullName: "Ivo Com Cpf",
          phone: "11955530012",
          cpf: other,
          tags: [],
        });
        await expect(
          repository.updatePatient(clinicId, helga!.id, update(other)),
        ).rejects.toMatchObject({ code: "PATIENT_DUPLICATE" });

        const cpf = nextTestCpf();
        const filled = await repository.updatePatient(
          clinicId,
          helga!.id,
          update(cpf),
        );
        expect(filled?.cpf).toBe(cpf);
        expect(
          (await repository.listPatients(clinicId, cpf)).map(
            (patient) => patient.fullName,
          ),
        ).toEqual(["Helga Sem Cpf"]);
      });
    },
  );
}
