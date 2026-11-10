import { patientInputSchema } from "@crm/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { patientEditAction } from "../../../modules/patients/patient-timeline.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: edições do cadastro no histórico da ficha`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("timelineedits");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("lista a edição com as diferenças e o motivo", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: "Cliente Teste QA Tres",
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Cliente Teste QA Tres",
            emergencyContactPhone: "11988887777",
          }),
        );
        await repository.recordAdminAuditEvent(
          clinicId,
          actorId,
          patientEditAction,
          "patients",
          {
            changes: [
              {
                field: "nickname",
                label: "Apelido",
                before: null,
                after: "Tres QA",
              },
            ],
            reason: "Apelido pedido pela cliente",
          },
          patient.id,
        );
        const timeline = await repository.getPatientTimeline(
          clinicId,
          patient.id,
        );
        expect(
          timeline?.find((entry) => entry.kind === "patient_updated"),
        ).toMatchObject({
          title: expect.stringMatching(/^Cadastro editado/),
          detail:
            "Apelido: (vazio) → Tres QA · Motivo: Apelido pedido pela cliente",
        });
      });
    },
  );
}
