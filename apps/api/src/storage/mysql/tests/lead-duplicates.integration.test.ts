import { nextTestCpf } from "../../../test-support/cpf.js";
import { leadInputSchema, patientInputSchema } from "@crm/contracts";
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
const otherClinicId = "99999999-9999-4999-8999-999999999999";

// Duplicidade no cadastro do lead (QM10): mesma resposta em memória e no PostgreSQL.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: duplicidade de contato do lead`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("leadduplicat");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
      await database?.drop();
    });

      it("finds clients and open leads by normalized phone, e-mail and CPF", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            fullName: "Cliente Duplicidade PG",
            phone: "31977771234",
            whatsapp: "31977771234",
            emergencyContactName: "Cliente Duplicidade PG",
            emergencyContactPhone: "31977771234",
            email: "Duplicidade.PG@Email.com",
            cpf: "529.982.247-25",
          }),
        );
        const lead = await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead Duplicidade PG",
            phone: "31966665555",
            email: "lead.pg@email.com",
            source: "Instagram",
            interest: "Pilates",
          }),
        );
        // Outra clínica com o mesmo telefone (no PostgreSQL a FK exige a clínica cadastrada).
        if (storage === "memory")
          await repository.createPatient(
            otherClinicId,
            patientInputSchema.parse({
              cpf: nextTestCpf(),
              fullName: "Outra Clínica",
              phone: "31966665555",
              whatsapp: "31966665555",
              emergencyContactName: "Outra Clínica",
              emergencyContactPhone: "31966665555",
            }),
          );

        expect(
          await repository.findLeadDuplicates(clinicId, {
            phone: "+55 (31) 97777-1234",
            email: " duplicidade.pg@EMAIL.com",
            cpf: "52998224725",
          }),
        ).toEqual([
          {
            kind: "patient",
            id: patient.id,
            fullName: "Cliente Duplicidade PG",
            fields: ["phone", "email", "cpf"],
          },
        ]);
        expect(
          await repository.findLeadDuplicates(clinicId, {
            phone: "5531966665555",
          }),
        ).toEqual([
          {
            kind: "lead",
            id: lead.id,
            fullName: "Lead Duplicidade PG",
            fields: ["phone"],
          },
        ]);
        expect(
          await repository.findLeadDuplicates(clinicId, {
            phone: "31966665555",
            excludeLeadId: lead.id,
          }),
        ).toEqual([]);
        expect(
          await repository.findLeadDuplicates(clinicId, {
            phone: "",
            email: "",
            cpf: "",
          }),
        ).toEqual([]);
      });
    },
  );
}
