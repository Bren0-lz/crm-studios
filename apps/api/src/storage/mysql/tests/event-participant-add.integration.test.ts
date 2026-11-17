import { eventInputSchema, eventLeadInputSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
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

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

// RE2: o participante digitado passa pela mesma regra da importação (EN1).
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: participante de evento que já é cliente`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("eventadd");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const suffix = () =>
        String(Math.floor(Math.random() * 1e4)).padStart(4, "0");

      async function setup() {
        const event = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Aulão " + randomUUID().slice(0, 8),
            startsAt: "2026-11-08T12:00:00.000Z",
          }),
        );
        const phone = `1197777${suffix()}`;
        const patient = await repository.createPatient(clinicId, {
          fullName: "Cliente Existente",
          phone,
          email: `cliente-${randomUUID().slice(0, 8)}@example.com`,
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });
        const add = (fields: Record<string, string>) =>
          repository.createLead(
            clinicId,
            eventLeadInputSchema.parse({ eventId: event.id, ...fields }),
          );
        return { event, patient, phone, add };
      }

      it("liga ao cliente pelo telefone, e-mail ou CPF, sem cliente novo", async () => {
        const { event, patient, phone, add } = await setup();
        const patientsBefore = (await repository.listPatients(clinicId)).length;
        const lead = await add({
          fullName: "Cliente Existente",
          phone: `+55 (${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`,
        });
        expect(lead).toMatchObject({
          eventId: event.id,
          convertedPatientId: patient.id,
          stage: "won",
        });
        const byEmail = await add({
          fullName: "Pelo email",
          email: patient.email!.toUpperCase(),
        });
        expect(byEmail).toMatchObject({
          convertedPatientId: patient.id,
          stage: "won",
        });
        expect(await repository.listPatients(clinicId)).toHaveLength(
          patientsBefore,
        );
        const participants = (await repository.getEvent(clinicId, event.id))!
          .participants;
        expect(participants.find((item) => item.id === lead.id)).toMatchObject({
          convertedPatientId: patient.id,
          stage: "won",
        });
      });

      it("liga pelo CPF e cria lead solto quando só o nome coincide", async () => {
        const { event, patient, add } = await setup();
        const byCpf = await add({ fullName: "Doc", cpf: patient.cpf! });
        expect(byCpf.convertedPatientId).toBe(patient.id);
        const sameName = await add({
          fullName: "Cliente Existente",
          phone: `1196666${suffix()}`,
        });
        expect(sameName.convertedPatientId).toBeUndefined();
        expect(sameName.stage).not.toBe("won");
        expect(
          (await repository.getEvent(clinicId, event.id))!.participants,
        ).toHaveLength(2);
      });

      it("participante sem nome ligado ao cliente recebe o nome do cadastro (RF5)", async () => {
        const { event, patient, phone, add } = await setup();
        const lead = await add({ phone });
        expect(lead).toMatchObject({
          convertedPatientId: patient.id,
          fullName: "Cliente Existente",
        });
        // Nome já informado não é sobrescrito.
        const named = await add({ fullName: "Apelido", cpf: patient.cpf! });
        expect(named).toMatchObject({
          convertedPatientId: patient.id,
          fullName: "Apelido",
        });
        // Sem contato de cliente, o participante continua sem nome.
        const loose = await add({ phone: `1194444${suffix()}` });
        expect(loose.fullName).toBe("");
        const participants = (await repository.getEvent(clinicId, event.id))!
          .participants;
        expect(participants.find((item) => item.id === lead.id)!.fullName).toBe(
          "Cliente Existente",
        );
      });

      it("importação: linha sem nome ligada ao cliente recebe o nome dele (RF5)", async () => {
        const { event, patient, phone } = await setup();
        const row = (fields: Record<string, string>) =>
          eventLeadInputSchema.parse({ eventId: event.id, ...fields });
        expect(
          await repository.importEventParticipants(clinicId, event.id, [
            row({ phone }),
            row({ fullName: "Apelido", cpf: patient.cpf! }),
            row({ phone: `1193333${suffix()}` }),
          ]),
        ).toMatchObject({ linked: 2, created: 1, skipped: 0 });
        const names = (await repository.getEvent(clinicId, event.id))!
          .participants.map((item) => item.fullName)
          .sort();
        expect(names).toEqual(["", "Apelido", "Cliente Existente"]);
      });

      it("recusa participante repetido no evento com 409", async () => {
        const { event, add } = await setup();
        const phone = `1195555${suffix()}`;
        await add({ fullName: "Ana", phone });
        await expect(
          add({ fullName: "Ana de novo", phone: `55${phone}` }),
        ).rejects.toMatchObject({
          code: "EVENT_PARTICIPANT_EXISTS",
          statusCode: 409,
        });
        // Sem contato nunca é repetido.
        await add({ fullName: "Sem contato 1" });
        await add({ fullName: "Sem contato 2" });
        expect(
          (await repository.getEvent(clinicId, event.id))!.participants,
        ).toHaveLength(3);
      });
    },
  );
}
