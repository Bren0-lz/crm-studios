import { eventLeadInputSchema, patientImportInputSchema } from "@crm/contracts";
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
const actorId = "22222222-2222-4222-8222-222222222222";

const imported = (
  fullName: string,
  phone: string,
  extraFields?: Record<string, string>,
) =>
  patientImportInputSchema.parse({
    fullName,
    phone,
    cpf: nextTestCpf(),
    tags: [],
    ...(extraFields ? { extraFields } : {}),
  });

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: "Outros" da importação (entrega 10)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("extra_fields");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("grava o Outros do cliente novo e mescla no já cadastrado sem apagar", async () => {
        expect(
          await repository.importPatients(clinicId, [
            imported("Lia Outros", "11966660001", { Pé: "37", Cor: "azul" }),
            imported("Mel Outros", "11966660002"),
          ]),
        ).toEqual({ created: 2, skipped: 0, updated: 0 });
        expect(
          await repository.importPatients(clinicId, [
            imported("Lia Outros", "11966660001", { Pé: "38", Turma: "B" }),
            imported("Mel Outros", "11966660002"),
            imported("Mel Outros", "11966660002", { Turma: "A" }),
          ]),
        ).toEqual({ created: 0, skipped: 1, updated: 2 });

        const [lia] = await repository.listPatients(clinicId, "Lia Outros");
        expect(lia?.extraFields).toEqual({ Pé: "38", Cor: "azul", Turma: "B" });
        const [mel] = await repository.listPatients(clinicId, "Mel Outros");
        expect(mel?.extraFields).toEqual({ Turma: "A" });
        const manual = await repository.createPatient(clinicId, {
          fullName: "Noa Manual",
          phone: "11966660003",
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });
        expect(manual.extraFields).toBeUndefined();
      });

      it("guarda o Outros do participante e leva para o cliente na conversão", async () => {
        const event = await repository.createEvent(clinicId, actorId, {
          name: "Feira",
          startsAt: "2026-11-08T12:00:00.000Z",
        });
        const participant = (fullName: string, phone: string) =>
          eventLeadInputSchema.parse({ eventId: event.id, fullName, phone });
        await repository.importPatients(clinicId, [
          imported("Ori Cliente", "11966660010", { Cor: "verde", Pé: "40" }),
        ]);
        expect(
          await repository.importEventParticipants(clinicId, event.id, [
            {
              ...participant("Pia Evento", "11966660011"),
              extraFields: { Camiseta: "M" },
            },
            {
              ...participant("Ori Cliente", "11966660010"),
              extraFields: { Pé: "41" },
            },
          ]),
        ).toEqual({ created: 1, linked: 1, skipped: 0 });
        const participants =
          (await repository.getEvent(clinicId, event.id))?.participants ?? [];
        const pia = participants.find((item) => item.fullName === "Pia Evento");
        const ori = participants.find(
          (item) => item.fullName === "Ori Cliente",
        );
        expect(pia?.extraFields).toEqual({ Camiseta: "M" });

        const created = await repository.convertLead(
          clinicId,
          actorId,
          pia!.id,
          { cpf: nextTestCpf(), ...testPatientContact },
        );
        expect(created?.patient.extraFields).toEqual({ Camiseta: "M" });
        const reused = await repository.convertLead(clinicId, actorId, ori!.id);
        expect(reused?.reusedExisting).toBe(true);
        expect(reused?.patient.extraFields).toEqual({ Cor: "verde", Pé: "41" });
      });
    },
  );
}
