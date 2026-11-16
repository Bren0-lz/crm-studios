import { patientImportInputSchema } from "@crm/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
let sequence = 0;

// E6: modelo que usa dado da clínica sem cadastro (CNPJ, endereço…) não é emitido.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: dados da clínica para emitir contratos`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("docclinic");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      async function setup(clinic: { taxId: string; address: string }) {
        const name = `Cliente E6 ${++sequence}`;
        await repository.importPatients(clinicId, [
          patientImportInputSchema.parse({
            fullName: name,
            phone: "11955550000",
            tags: [],
          }),
        ]);
        const [patient] = await repository.listPatients(clinicId, name);
        await repository.updateClinicSettings(clinicId, actorId, {
          ...(await repository.getClinicSettings(clinicId))!,
          ...clinic,
        });
        const template = await repository.createDocumentTemplate(clinicId, {
          name: `Contrato com CNPJ ${sequence}`,
          kind: "contract",
          body: "Contrato de {{paciente_nome}}, CNPJ {{clinica_cnpj}}, sede em {{clinica_endereco}}.",
        });
        return {
          templateId: template.id,
          patientId: patient!.id,
          title: "Contrato do cliente",
        };
      }

      it("recusa com 409 e lista os campos; com o cadastro, emite", async () => {
        const input = await setup({ taxId: "", address: "" });
        const preview = await repository.previewDocument(clinicId, input);
        expect(preview.missingClinicFields).toEqual([
          { key: "clinica_cnpj", name: "CNPJ" },
          { key: "clinica_endereco", name: "endereço" },
        ]);
        const before = (await repository.listIssuedDocuments(clinicId)).length;
        await expect(
          repository.createIssuedDocument(clinicId, actorId, input),
        ).rejects.toMatchObject({
          code: "DOCUMENT_CLINIC_DATA_MISSING",
          statusCode: 409,
          message:
            "Cadastre CNPJ e endereço da clínica em Configurações › Clínica antes de emitir este contrato.",
        });
        expect((await repository.listIssuedDocuments(clinicId)).length).toBe(
          before,
        );

        await repository.updateClinicSettings(clinicId, actorId, {
          ...(await repository.getClinicSettings(clinicId))!,
          taxId: "11222333000181",
          address: "Av. Brasil, 500, Campinas/SP",
        });
        const document = await repository.createIssuedDocument(
          clinicId,
          actorId,
          input,
        );
        expect(document.snapshotBody).toContain("Av. Brasil, 500");
        expect(document.snapshotBody).not.toContain("não informado");
      });
    },
  );
}
