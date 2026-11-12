import { nextTestCpf } from "../../../test-support/cpf.js";
import { saoPauloToday } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoUserId } from "../../../demo-scenarios.js";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

// TW3: turma cheia no cadastro guiado vai para a Lista de espera, sem plano nem cobrança.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cadastro guiado com turma cheia`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("guidedwait");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const patient = (name: string) => ({
        cpf: nextTestCpf(),
        fullName: `${name} ${randomUUID().slice(0, 8)}`,
        phone: "11988886666",
        whatsapp: "11988886666",
        emergencyContactName: "Contato de Emergência",
        emergencyContactPhone: "11988886666",
        emergencyContactWhatsapp: "11988886666",
        tags: [],
      });

      it("creates the waitlist entry with the desired group and refuses a plan without a seat", async () => {
        const [professional] = await repository.listProfessionals(clinicId),
          rooms = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const room = rooms.find((item) => item.capacity >= 1)!;
        const group = await repository.createGroupClass(clinicId, {
          serviceId: service!.id,
          professionalId: professional!.id,
          roomId: room.id,
          capacity: 1,
          weeklySlots: [{ weekday: 0, startTime: "21:00", endTime: "22:00" }],
        });
        const services = [
          {
            serviceId: service!.id,
            totalSessions: 4,
            totalValueInCents: 20000,
          },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          demoUserId,
          { name: "Plano TW3", totalValueInCents: 20000, services },
        );
        const plan = {
          planTemplateId: template.id,
          services,
          name: "Plano TW3",
          serviceId: service!.id,
          kind: "recurring" as const,
          totalSessions: 4,
          validFrom: saoPauloToday(),
          validUntil: "2099-12-31",
          totalValueInCents: 20000,
          installments: 1,
          firstDueDate: saoPauloToday(),
        };
        const first = await repository.createPatientWithNextStep(
          clinicId,
          demoUserId,
          // Mesmo formato que a rota entrega depois do parse.
          {
            next: "plan",
            patient: patient("Ocupa Vaga"),
            plan,
            groupId: group.id,
          } as never,
        );
        expect(first.enrollment).toMatchObject({ status: "active" });

        const lateName = patient("Sem Vaga");
        await expect(
          repository.createPatientWithNextStep(clinicId, demoUserId, {
            next: "plan",
            patient: lateName,
            plan,
            groupId: group.id,
          } as never),
        ).rejects.toMatchObject({ code: "GROUP_FULL" });
        expect(
          await repository.listPatients(clinicId, lateName.fullName),
        ).toEqual([]);

        const waiting = await repository.createPatientWithNextStep(
          clinicId,
          demoUserId,
          {
            next: "waitlist",
            patient: patient("Na Espera"),
            waitlist: [{ serviceId: service!.id, groupId: group.id }],
          } as never,
        );
        expect(waiting.plan).toBeUndefined();
        expect(waiting.waitlistEntries).toEqual([
          expect.objectContaining({
            patientId: waiting.patient.id,
            kind: "service",
            serviceId: service!.id,
            status: "waiting",
            notes: `Turma desejada: ${group.name}`,
          }),
        ]);
        const plans = await repository.listPatientPlans(clinicId);
        expect(
          plans.filter((item) => item.patientId === waiting.patient.id),
        ).toEqual([]);
      });
    },
  );
}
