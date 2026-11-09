import {
  eventInputSchema,
  leadInputSchema,
  eventLeadInputSchema,
} from "@crm/contracts";
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
  otherClinicId = "99999999-9999-4999-8999-999999999999",
  actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: eventos do comercial`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("eventos");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const participant = (eventId: string, fullName: string, extra = {}) =>
        repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName,
            phone: `119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
            source: "Digitado pela equipe",
            interest: "Evento",
            eventId,
            ...extra,
          }),
        );

      it("imports incomplete participants atomically, skips repeated contacts and is isolated by clinic", async () => {
        const event = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Importação " + randomUUID().slice(0, 8),
            startsAt: "2026-11-08T12:00:00.000Z",
          }),
        );
        const participant = (fields: Record<string, string>) =>
          eventLeadInputSchema.parse({ eventId: event.id, ...fields });
        const input = participant({ phone: "123" });
        // EN1: o segundo "123" repete quem já entrou pela linha anterior e é ignorado.
        expect(
          await repository.importEventParticipants(clinicId, event.id, [
            input,
            input,
            participant({ email: "apenas@example.com" }),
            participant({ notes: "Sem contato" }),
            participant({ notes: "Outro sem contato" }),
          ]),
        ).toEqual({ created: 4, linked: 0, skipped: 1 });
        expect(
          (await repository.getEvent(clinicId, event.id))?.participants,
        ).toHaveLength(4);
        await expect(
          repository.importEventParticipants(otherClinicId, event.id, [
            participant({ phone: "456" }),
          ]),
        ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
        await expect(
          repository.importEventParticipants(clinicId, event.id, [
            participant({ phone: "456" }),
            {
              ...participant({ phone: "789" }),
              responsibleUserId: randomUUID(),
            },
          ]),
        ).rejects.toMatchObject({ code: "RESPONSIBLE_USER_NOT_FOUND" });
        const detail = await repository.getEvent(clinicId, event.id);
        expect(detail?.participants).toHaveLength(4);
        expect(
          detail?.participants.filter((item) => item.phone === "456"),
        ).toHaveLength(0);
        // Contato repetido do evento importado de novo: tudo ignorado, nada gravado.
        expect(
          await repository.importEventParticipants(clinicId, event.id, [
            input,
            participant({ email: "APENAS@example.com" }),
          ]),
        ).toEqual({ created: 0, linked: 0, skipped: 2 });
      });

      it("creates, lists and edits an event, isolated by clinic", async () => {
        const created = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Aulão na praça " + randomUUID().slice(0, 8),
            location: "Praça Central, Campinas",
            attendeeCount: 130,
            startsAt: "2026-11-08T12:00:00.000Z",
            notes: "Levar tapetes",
          }),
        );
        expect(created).toMatchObject({
          clinicId,
          location: "Praça Central, Campinas",
          attendeeCount: 130,
          startsAt: "2026-11-08T12:00:00.000Z",
          notes: "Levar tapetes",
          createdBy: actorId,
          participantCount: 0,
        });
        expect(created.branchId).toBeUndefined();
        expect(created.createdByName).toBeTruthy();
        expect(
          (await repository.listEvents(clinicId)).map((item) => item.id),
        ).toContain(created.id);
        expect(await repository.listEvents(otherClinicId)).toEqual([]);
        expect(await repository.getEvent(otherClinicId, created.id)).toBeNull();

        const updated = await repository.updateEvent(
          clinicId,
          actorId,
          created.id,
          eventInputSchema.parse({
            name: created.name + " (2ª ed.)",
            startsAt: "2026-11-09T12:00:00.000Z",
            location: "",
          }),
        );
        expect(updated).toMatchObject({
          id: created.id,
          name: created.name + " (2ª ed.)",
          startsAt: "2026-11-09T12:00:00.000Z",
          createdBy: actorId,
          createdAt: created.createdAt,
        });
        expect(updated!.location).toBeUndefined();
        expect(updated!.attendeeCount).toBeUndefined();
        expect(updated!.notes).toBeUndefined();
        expect(
          await repository.updateEvent(
            otherClinicId,
            actorId,
            created.id,
            eventInputSchema.parse({
              name: "Outra clínica",
              startsAt: "2026-11-09T12:00:00.000Z",
            }),
          ),
        ).toBeNull();
      });

      it("saves the event service, filters by it and clears it when the service is deleted", async () => {
        const [service, other] = await repository.listServices(clinicId);
        const name = "Serviço " + randomUUID().slice(0, 8);
        const event = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name,
            startsAt: "2026-11-08T12:00:00.000Z",
            serviceId: service!.id,
          }),
        );
        expect(event).toMatchObject({
          serviceId: service!.id,
          serviceName: service!.name,
        });
        const names = async (serviceId?: string) =>
          (
            await repository.listEvents(clinicId, serviceId ? { serviceId } : {})
          ).map((item) => item.id);
        expect(await names(service!.id)).toContain(event.id);
        expect(await names(other!.id)).not.toContain(event.id);
        expect(await names()).toContain(event.id);
        await expect(
          repository.createEvent(
            clinicId,
            actorId,
            eventInputSchema.parse({
              name,
              startsAt: "2026-11-08T12:00:00.000Z",
              serviceId: randomUUID(),
            }),
          ),
        ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
        const otherClinicService = (
          await repository.listServices(otherClinicId)
        )[0];
        if (otherClinicService)
          await expect(
            repository.createEvent(
              clinicId,
              actorId,
              eventInputSchema.parse({
                name,
                startsAt: "2026-11-08T12:00:00.000Z",
                serviceId: otherClinicService.id,
              }),
            ),
          ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
        const cleared = await repository.updateEvent(
          clinicId,
          actorId,
          event.id,
          eventInputSchema.parse({
            name,
            startsAt: "2026-11-08T12:00:00.000Z",
            serviceId: "",
          }),
        );
        expect(cleared!.serviceId).toBeUndefined();
        expect(await names(service!.id)).not.toContain(event.id);
        if (!pool) return;
        // FK `ON DELETE SET NULL`: apagar o serviço deixa o evento sem serviço.
        const serviceId = randomUUID();
        await pool.query(
          `INSERT INTO services (id, clinic_id, name, duration_minutes)
           VALUES ($1, $2, 'Serviço temporário', 60)`,
          [serviceId, clinicId],
        );
        await repository.updateEvent(
          clinicId,
          actorId,
          event.id,
          eventInputSchema.parse({
            name,
            startsAt: "2026-11-08T12:00:00.000Z",
            serviceId,
          }),
        );
        await pool.query("DELETE FROM services WHERE id = $1", [serviceId]);
        expect((await repository.getEvent(clinicId, event.id))!.serviceId)
          .toBeUndefined();
      });

      it("deletes an event keeping the participants as leads and removes a participant", async () => {
        const create = (name: string) =>
          repository.createEvent(
            clinicId,
            actorId,
            eventInputSchema.parse({
              name: name + " " + randomUUID().slice(0, 8),
              startsAt: "2026-11-08T12:00:00.000Z",
            }),
          );
        const event = await create("Exclusão"),
          other = await create("Outro");
        const ana = await participant(event.id, "Ana Removida"),
          bia = await participant(event.id, "Bia Fica"),
          caio = await participant(other.id, "Caio Outro");
        expect(
          await repository.removeEventParticipant(clinicId, event.id, caio.id),
        ).toBe(false);
        expect(
          await repository.removeEventParticipant(
            otherClinicId,
            event.id,
            ana.id,
          ),
        ).toBe(false);
        expect(
          await repository.removeEventParticipant(clinicId, event.id, ana.id),
        ).toBe(true);
        expect(
          await repository.removeEventParticipant(clinicId, event.id, ana.id),
        ).toBe(false);
        const detail = await repository.getEvent(clinicId, event.id);
        expect(detail!.participants.map((item) => item.id)).toEqual([bia.id]);
        expect(detail!.participantCount).toBe(1);

        expect(await repository.deleteEvent(otherClinicId, event.id)).toBe(
          false,
        );
        expect(await repository.deleteEvent(clinicId, event.id)).toBe(true);
        expect(await repository.deleteEvent(clinicId, event.id)).toBe(false);
        expect(await repository.getEvent(clinicId, event.id)).toBeNull();
        expect(
          (await repository.listEvents(clinicId)).map((item) => item.id),
        ).not.toContain(event.id);
        const leads = await repository.listLeads(clinicId);
        for (const id of [ana.id, bia.id]) {
          const lead = leads.find((item) => item.id === id);
          expect(lead).toBeDefined();
          expect(lead!.eventId).toBeUndefined();
        }
        expect(leads.find((item) => item.id === caio.id)!.eventId).toBe(
          other.id,
        );
      });

      it("links participants as leads and counts the four indicators", async () => {
        const event = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Feira " + randomUUID().slice(0, 8),
            startsAt: "2026-11-08T12:00:00.000Z",
          }),
        );
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const ana = await participant(event.id, "Ana Evento");
        // A origem é sempre a do evento; o interesse informado conta como interessado.
        expect(ana).toMatchObject({
          eventId: event.id,
          source: `Evento: ${event.name}`,
          interest: "Evento",
        });
        const bia = await participant(event.id, "Bia Evento", {
          interest: "Pilates",
        });
        const caio = await participant(event.id, "Caio Evento", {
          interest: "Dança",
        });
        const davi = await participant(event.id, "Davi Evento", {
          interest: "Pilates",
        });
        // Lead fora do evento não entra na lista.
        await repository.createLead(
          clinicId,
          leadInputSchema.parse({
            fullName: "Lead sem evento",
            phone: "11977770000",
            source: "Instagram",
            interest: "Pilates",
          }),
        );
        await repository.createLeadContact(clinicId, actorId, ana.id, {
          channel: "whatsapp",
          direction: "outbound",
          notes: "Mandei a grade de horários",
        });
        await repository.createLeadContact(clinicId, actorId, bia.id, {
          channel: "phone",
          direction: "outbound",
          notes: "Quer Pilates à noite",
        });
        // Tentativa sem resposta: fica no histórico, mas não conta como contatado.
        const attempt = await repository.createLeadContact(
          clinicId,
          actorId,
          caio.id,
          {
            channel: "phone",
            direction: "outbound",
            notes: "Não atendeu",
            occurredAt: "2026-11-09T15:30:00.000Z",
            reached: false,
          },
        );
        expect(attempt).toMatchObject({ reached: false, notes: "Não atendeu" });
        expect(
          (await repository.getLeadActivity(clinicId, ana.id))?.contacts[0],
        ).toMatchObject({ reached: true });
        await repository.moveLead(clinicId, actorId, davi.id, "lost", "Mudou");
        const appointment = {
          professionalId: professional!.id,
          roomId: room!.id,
          serviceId: service!.id,
          notes: "",
        };
        await repository.createLeadAppointment(clinicId, bia.id, {
          ...appointment,
          startsAt: "2099-04-07T13:00:00.000Z",
          visitType: "evaluation",
        });
        await repository.createLeadAppointment(clinicId, caio.id, {
          ...appointment,
          startsAt: "2099-04-07T15:00:00.000Z",
          visitType: "trial",
        });
        // Avaliação continua contando depois da conversão (o horário passa para o cliente).
        await repository.convertLead(clinicId, actorId, caio.id, {
          cpf: nextTestCpf(),
          ...testPatientContact,
        });

        const detail = (await repository.getEvent(clinicId, event.id))!;
        expect(detail.participantCount).toBe(4);
        expect(detail.participants.map((item) => item.fullName)).toEqual([
          "Ana Evento",
          "Bia Evento",
          "Caio Evento",
          "Davi Evento",
        ]);
        expect(
          detail.participants.map((item) => item.evaluationAt ?? null),
        ).toEqual([
          null,
          "2099-04-07T13:00:00.000Z",
          "2099-04-07T15:00:00.000Z",
          null,
        ]);
        expect(
          detail.participants.map((item) => Boolean(item.contactedAt)),
        ).toEqual([true, true, false, false]);
        expect(detail.participants[2]?.lastContactAt).toBe(
          "2026-11-09T15:30:00.000Z",
        );
        expect(detail.indicators).toEqual({
          contacted: 2,
          interested: 2,
          evaluations: 2,
          converted: 1,
        });
        expect(
          (await repository.listEvents(clinicId)).find(
            (item) => item.id === event.id,
          )?.participantCount,
        ).toBe(4);
        // A edição do lead não troca o vínculo com o evento.
        const edited = await repository.updateLead(
          clinicId,
          actorId,
          ana.id,
          leadInputSchema.parse({
            fullName: "Ana Evento",
            phone: ana.phone,
            source: ana.source,
            interest: "Pilates",
          }),
        );
        expect(edited?.eventId).toBe(event.id);
        await expect(
          participant(randomUUID(), "Evento inexistente"),
        ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
      });

      it("shows branch events only in their branch and network events everywhere", async () => {
        const centro = (await repository.saveBranch(clinicId, actorId, {
          name: "Centro " + randomUUID().slice(0, 8),
        }))!;
        const [matriz] = await repository.listBranches(clinicId);
        const inCentro = { branchIds: [centro.id], writeBranchId: centro.id };
        const inMatriz = {
          branchIds: [matriz!.id],
          writeBranchId: matriz!.id,
        };
        const branchEvent = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Evento do Centro " + randomUUID().slice(0, 8),
            startsAt: "2026-11-10T12:00:00.000Z",
            branchId: centro.id,
          }),
        );
        const networkEvent = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Evento da rede " + randomUUID().slice(0, 8),
            startsAt: "2026-11-11T12:00:00.000Z",
          }),
        );
        expect(branchEvent.branchId).toBe(centro.id);
        // Participante do evento da filial entra na filial do evento.
        const lead = await participant(
          branchEvent.id,
          "Participante do Centro",
        );
        expect(lead.branchId).toBe(centro.id);
        await repository.branchScope.run(inCentro, () =>
          participant(networkEvent.id, "Participante da rede no Centro"),
        );
        const ids = (scope: typeof inCentro) =>
          repository.branchScope.run(scope, async () =>
            (await repository.listEvents(clinicId)).map((item) => item.id),
          );
        expect(await ids(inCentro)).toEqual(
          expect.arrayContaining([branchEvent.id, networkEvent.id]),
        );
        expect(await ids(inMatriz)).toContain(networkEvent.id);
        expect(await ids(inMatriz)).not.toContain(branchEvent.id);
        expect(
          await repository.branchScope.run(inMatriz, () =>
            repository.getEvent(clinicId, branchEvent.id),
          ),
        ).toBeNull();
        // Participantes seguem o escopo de filial da consulta.
        const networkInMatriz = await repository.branchScope.run(inMatriz, () =>
          repository.getEvent(clinicId, networkEvent.id),
        );
        expect(networkInMatriz?.participants).toEqual([]);
        expect(networkInMatriz?.participantCount).toBe(0);
        const networkInCentro = await repository.branchScope.run(inCentro, () =>
          repository.getEvent(clinicId, networkEvent.id),
        );
        expect(networkInCentro?.participantCount).toBe(1);
        // Não grava evento em filial fora da seleção.
        await expect(
          repository.branchScope.run(inMatriz, () =>
            repository.createEvent(
              clinicId,
              actorId,
              eventInputSchema.parse({
                name: "Fora da seleção",
                startsAt: "2026-11-12T12:00:00.000Z",
                branchId: centro.id,
              }),
            ),
          ),
        ).rejects.toMatchObject({ code: "BRANCH_ACCESS_DENIED" });
        await expect(
          repository.createEvent(
            clinicId,
            actorId,
            eventInputSchema.parse({
              name: "Filial inexistente",
              startsAt: "2026-11-12T12:00:00.000Z",
              branchId: randomUUID(),
            }),
          ),
        ).rejects.toMatchObject({ code: "BRANCH_NOT_FOUND" });
      });

      it("informa quando o participante virou cliente (conversão ou vínculo na importação)", async () => {
        const event = await repository.createEvent(
          clinicId,
          actorId,
          eventInputSchema.parse({
            name: "Conversões " + randomUUID().slice(0, 8),
            startsAt: "2026-11-08T12:00:00.000Z",
          }),
        );
        const phone = `119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
        await repository.createPatient(clinicId, {
          fullName: "Cliente Antiga",
          phone,
          cpf: nextTestCpf(),
          tags: [],
          ...testPatientContact,
        });
        expect(
          await repository.importEventParticipants(clinicId, event.id, [
            eventLeadInputSchema.parse({
              eventId: event.id,
              fullName: "Cliente Antiga",
              phone,
            }),
          ]),
        ).toMatchObject({ linked: 1 });
        const nova = await participant(event.id, "Nova Cliente");
        await participant(event.id, "Sem Conversão");
        const before = Date.now();
        await repository.convertLead(clinicId, actorId, nova.id, {
          cpf: nextTestCpf(),
          ...testPatientContact,
        });
        const detail = (await repository.getEvent(clinicId, event.id))!;
        const byName = (name: string) =>
          detail.participants.find((item) => item.fullName === name)!;
        const linked = byName("Cliente Antiga");
        // Importado já ligado a um cliente: vale o cadastro do participante.
        expect(linked.convertedAt).toBe(linked.createdAt);
        const converted = Date.parse(byName("Nova Cliente").convertedAt ?? "");
        expect(converted).toBeGreaterThanOrEqual(before - 1000);
        expect(converted).toBeLessThanOrEqual(Date.now() + 1000);
        expect(byName("Sem Conversão").convertedAt).toBeUndefined();
      });
    },
  );
}
