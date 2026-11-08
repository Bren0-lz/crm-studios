import { leadInputSchema } from "@crm/contracts";
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
const otherClinicId = "99999999-9999-4999-8999-999999999999";
const actorId = "22222222-2222-4222-8222-222222222222";

/** Leads criados em instantes diferentes, para a ordem "mais antigo primeiro" ser estável. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: origem do cliente convertido de lead (EN3b)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("lead_origin");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const lead = async (
        fullName: string,
        phone: string,
        eventId?: string,
      ) => {
        await tick();
        return repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName,
            phone,
            source: "Indicação",
            interest: "Pilates",
            ...(eventId ? { eventId } : {}),
          }),
        );
      };
      const convert = async (leadId: string) =>
        (await repository.convertLead(clinicId, actorId, leadId, {
          cpf: nextTestCpf(),
          ...testPatientContact,
        }))!.patient;

      it("lista evento ou funil por lead convertido, seguindo a mescla e só da clínica", async () => {
        const event = await repository.createEvent(clinicId, actorId, {
          name: "Aulão Origem",
          startsAt: "2026-11-08T12:00:00.000Z",
        });
        const fair = await repository.createEvent(clinicId, actorId, {
          name: "Feira Origem",
          startsAt: "2026-11-09T12:00:00.000Z",
        });

        const ana = await convert(
          (await lead("Ana Origem", "11977770001", event.id)).id,
        );
        const bia = await convert((await lead("Bia Origem", "11977770002")).id);
        // Mesmo telefone: a segunda conversão reaproveita o cliente da primeira.
        const dani = await convert(
          (await lead("Dani Origem", "11977770003")).id,
        );
        const daniAgain = await convert(
          (await lead("Dani Origem", "11977770003", fair.id)).id,
        );
        expect(daniAgain.id).toBe(dani.id);
        // Lead aberto (sem conversão) não entra.
        await lead("Gil Origem", "11977770004", event.id);

        // Cliente convertido mesclado em outro: a origem passa para o que ficou.
        const eva = await convert((await lead("Eva Origem", "11977770005")).id);
        const fia = await repository.createPatient(clinicId, {
          fullName: "Fia Origem",
          phone: "11977770006",
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });
        const preview = await repository.previewPatientMerge(
          clinicId,
          eva.id,
          fia.id,
        );
        await repository.mergePatients(clinicId, actorId, {
          sourceId: eva.id,
          targetId: fia.id,
          fieldSources: Object.fromEntries(
            preview.fields.map((field) => [field.key, "target" as const]),
          ),
        });

        const ours = new Set([ana.id, bia.id, dani.id, eva.id, fia.id]);
        const origins = (await repository.listPatientLeadOrigins(clinicId))
          .filter((item) => ours.has(item.patientId))
          .map((item) => [
            [ana, bia, dani, eva, fia].find(({ id }) => id === item.patientId)!
              .fullName,
            item.eventName ?? null,
          ]);
        expect(origins).toEqual([
          ["Ana Origem", "Aulão Origem"],
          ["Bia Origem", null],
          ["Dani Origem", null],
          ["Dani Origem", "Feira Origem"],
          ["Fia Origem", null],
        ]);

        expect(await repository.listPatientLeadOrigins(otherClinicId)).toEqual(
          [],
        );
      });
    },
  );
}
