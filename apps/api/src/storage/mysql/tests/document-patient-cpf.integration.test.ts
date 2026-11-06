import {
  documentContentFromText,
  documentPatientCpfRequiredMessage,
  patientImportInputSchema,
  patientUpdateInputSchema,
  type IssuedDocument,
} from "@crm/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { MemoryRepositoryContext } from "../../memory/context.js";
import { createContractsRepository } from "../../memory/contracts.js";
import { createPatientsRepository } from "../../memory/patients.js";
import { createDocumentSignatureLinksRepository } from "../../memory/document-signature-links.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { nextTestCpf } from "../../../test-support/cpf.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherClinicId = "99999999-9999-4999-8999-999999999999";
const signature = {
  signerName: "Responsável pelo contrato",
  signerCpf: "52998224725",
  accepted: true as const,
  signatureImage: "data:image/png;base64,cG5n",
};
const rejection = {
  code: "DOCUMENT_PATIENT_CPF_MISSING",
  statusCode: 409,
  message: documentPatientCpfRequiredMessage,
};
type Repository = Pick<
  ClinicRepository,
  | "importPatients"
  | "listPatients"
  | "updatePatient"
  | "previewDocument"
  | "createDocumentTemplate"
  | "deleteDocumentTemplate"
  | "createDocumentTemplateVersion"
  | "createIssuedDocument"
  | "updateDocumentDraft"
  | "updateIssuedDocumentStatus"
  | "createDocumentSignatureLink"
  | "openPublicSignatureDocument"
  | "signPublicDocument"
  | "listIssuedDocuments"
>;
let sequence = 0;

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: CPF para emitir contratos`,
    () => {
      let repository: Repository;
      let database: TestDatabase | undefined;
      let memory: MemoryRepositoryContext | undefined;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("documentcpf");
          repository = new MysqlClinicRepository(database.pool);
        }
      }, 60_000);
      beforeEach(() => {
        if (storage === "memory") {
          memory = new MemoryRepositoryContext();
          repository = {
            ...createPatientsRepository(memory),
            ...createContractsRepository(memory),
            ...createDocumentSignatureLinksRepository(memory),
          };
        }
      });
      afterEach(() => vi.useRealTimers());
      afterAll(async () => {
        await database?.drop();
      });

      async function fixture(withCpfField = true) {
        const number = ++sequence;
        const name = `Cliente CP3 ${number}`;
        const imported = patientImportInputSchema.parse({
          fullName: name,
          phone: `1195554${String(number).padStart(4, "0")}`,
          tags: [],
        });
        if (memory)
          await createPatientsRepository(memory).createPatient(
            clinicId,
            imported,
          );
        else await repository.importPatients(clinicId, [imported]);
        const [patient] = await repository.listPatients(clinicId, name);
        const template = await repository.createDocumentTemplate(clinicId, {
          name: `Contrato CP3 ${number}`,
          kind: "contract",
          body: "Contrato para {{paciente_nome}} com as condições acordadas.",
          ...(withCpfField
            ? {
                content: documentContentFromText(
                  "Contrato para {{paciente_nome}}, CPF {{paciente_cpf}}, com as condições acordadas.",
                ),
              }
            : {}),
        });
        const input = {
          patientId: patient!.id,
          templateId: template.id,
          title: template.name,
        };
        const draft = await repository.createIssuedDocument(
          clinicId,
          actorId,
          input,
        );
        return { patient: patient!, template, input, draft };
      }
      // Simula registros anteriores à CP3, sem passar pela nova regra de emissão.
      async function legacy(
        document: IssuedDocument,
        allowLinkFixture = false,
      ) {
        if (memory) {
          const stored = memory.issuedDocuments.find(
            (item) => item.id === document.id,
          )!;
          stored.status = "issued";
          if (allowLinkFixture) stored.requiresPatientCpf = false;
          else delete stored.requiresPatientCpf;
        } else {
          await database!.pool.query(
            "UPDATE issued_documents SET status='issued', requires_patient_cpf=$2 WHERE clinic_id=$3 AND id=$1",
            [document.id, allowLinkFixture ? 0 : null, clinicId],
          );
        }
      }

      it("permite preparar e editar rascunho, mas bloqueia emissão mesmo após editar ou excluir o modelo", async () => {
        const { input, draft, template } = await fixture();
        expect(await repository.previewDocument(clinicId, input)).toMatchObject(
          { requiresPatientCpf: true, patientCpfMissing: true },
        );
        expect(draft.snapshotBody).toContain("não informado");
        await repository.updateDocumentDraft(clinicId, draft.id, {
          title: draft.title,
          content: documentContentFromText(
            "Texto individual editado sem o campo do CPF.",
          ),
        });
        await expect(
          repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued"),
        ).rejects.toMatchObject(rejection);
        await repository.createDocumentTemplateVersion(
          clinicId,
          template.id,
          "Novo modelo sem CPF para {{paciente_nome}}.",
        );
        await repository.deleteDocumentTemplate(clinicId, template.id);
        await expect(
          repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued"),
        ).rejects.toMatchObject(rejection);
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === draft.id,
          ),
        ).toMatchObject({ status: "draft", patientCpfMissing: true });
        expect(
          await repository.updateIssuedDocumentStatus(
            otherClinicId,
            draft.id,
            "issued",
          ),
        ).toBeNull();
        expect(
          await repository.createDocumentSignatureLink(
            otherClinicId,
            actorId,
            draft.id,
          ),
        ).toBeNull();
      });

      it("libera modelos sem CPF e permite cancelar um rascunho bloqueado", async () => {
        const { draft } = await fixture(false);
        expect(draft.patientCpfMissing).toBe(false);
        await repository.updateIssuedDocumentStatus(
          clinicId,
          draft.id,
          "issued",
        );
        expect(
          await repository.createDocumentSignatureLink(
            clinicId,
            actorId,
            draft.id,
          ),
        ).not.toBeNull();
        const blocked = await fixture();
        expect(
          await repository.updateIssuedDocumentStatus(
            clinicId,
            blocked.draft.id,
            "cancelled",
          ),
        ).toMatchObject({ status: "cancelled" });
      });

      it("libera emissão e link depois de preencher CPF e atualizar o texto do rascunho", async () => {
        const { patient, input, draft } = await fixture();
        const cpf = nextTestCpf();
        await repository.updatePatient(
          clinicId,
          patient.id,
          patientUpdateInputSchema.parse({ ...patient, cpf }),
        );
        const preview = await repository.previewDocument(clinicId, input);
        expect(preview.patientCpfMissing).toBe(false);
        expect(
          preview.missingFields.some((field) => field.key === "paciente_cpf"),
        ).toBe(false);
        await repository.updateDocumentDraft(clinicId, draft.id, {
          title: draft.title,
          content: preview.snapshotContent,
        });
        expect(
          await repository.updateIssuedDocumentStatus(
            clinicId,
            draft.id,
            "issued",
          ),
        ).toMatchObject({ patientCpfMissing: false });
        expect(
          await repository.createDocumentSignatureLink(
            clinicId,
            actorId,
            draft.id,
          ),
        ).not.toBeNull();
      });

      it("bloqueia o primeiro link de um contrato antigo sem CPF", async () => {
        const { draft } = await fixture();
        await legacy(draft);
        await expect(
          repository.createDocumentSignatureLink(clinicId, actorId, draft.id),
        ).rejects.toMatchObject(rejection);
      });

      it("preserva links antigos válidos e assinados sem alterar contrato ou cadastro", async () => {
        const { draft, patient } = await fixture();
        await legacy(draft, true);
        const share = await repository.createDocumentSignatureLink(
          clinicId,
          actorId,
          draft.id,
        );
        await legacy(draft);
        expect(
          (
            await repository.createDocumentSignatureLink(
              clinicId,
              actorId,
              draft.id,
            )
          )?.token,
        ).toBe(share!.token);
        expect(
          await repository.openPublicSignatureDocument(share!.token, {}),
        ).toMatchObject({
          status: "pending",
          snapshotBody: draft.snapshotBody,
        });
        expect(
          await repository.signPublicDocument(share!.token, signature, {}),
        ).toMatchObject({ status: "signed", snapshotBody: draft.snapshotBody });
        expect(
          (await repository.listPatients(clinicId, patient.fullName))[0]?.cpf,
        ).toBeUndefined();
        expect(
          (
            await repository.createDocumentSignatureLink(
              clinicId,
              actorId,
              draft.id,
            )
          )?.token,
        ).toBe(share!.token);
      });

      it("bloqueia renovação de link antigo vencido sem substituir o token", async () => {
        const { draft } = await fixture();
        await legacy(draft, true);
        const share = await repository.createDocumentSignatureLink(
          clinicId,
          actorId,
          draft.id,
        );
        await legacy(draft);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 8 * 86_400_000);
        await expect(
          repository.createDocumentSignatureLink(clinicId, actorId, draft.id),
        ).rejects.toMatchObject(rejection);
        await expect(
          repository.openPublicSignatureDocument(share!.token, {}),
        ).rejects.toMatchObject({ code: "DOCUMENT_SIGNATURE_LINK_EXPIRED" });
        expect(
          (await repository.listIssuedDocuments(clinicId)).find(
            (item) => item.id === draft.id,
          )?.signatureLink?.token,
        ).toBe(share!.token);
      });
    },
  );
}
