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

// RC8: o cadastro guiado vende o plano com o contrato emitido e as sessões do avulso reservadas.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cadastro guiado com contrato e sessões`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("guidedsale");
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
        tags: [],
      });

      async function fixtures() {
        const [professional] = await repository.listProfessionals(clinicId),
          [room] = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const services = [
          { serviceId: service!.id, totalSessions: 1, totalValueInCents: 9000 },
        ];
        const single = await repository.createPlanTemplate(
          clinicId,
          demoUserId,
          {
            name: `Avulso RC8 ${randomUUID().slice(0, 6)}`,
            kind: "single",
            totalValueInCents: 9000,
            services,
          },
        );
        const template = await repository.createDocumentTemplate(clinicId, {
          name: `Contrato do avulso ${randomUUID().slice(0, 6)}`,
          kind: "consent",
          body: "Eu, {{paciente_nome}}, contrato a sessão avulsa do estúdio.",
        });
        const plan = {
          planTemplateId: single.id,
          services,
          name: single.name,
          serviceId: service!.id,
          totalSessions: 1,
          validFrom: saoPauloToday(),
          validUntil: "2099-12-31",
          totalValueInCents: 9000,
          installments: 1,
          firstDueDate: saoPauloToday(),
        };
        // Horário único por teste (o banco MySQL é compartilhado entre eles).
        const day = 10 + Math.floor(Math.random() * 18);
        const appointment = {
          professionalId: professional!.id,
          roomId: room!.id,
          serviceId: service!.id,
          startsAt: `2098-03-${day}T${10 + Math.floor(Math.random() * 8)}:00:00.000Z`,
          visitType: "regular" as const,
        };
        return { plan, appointment, template, service: service! };
      }

      it("reserves the single's sessions and issues its document in the registration", async () => {
        const { plan, appointment, template } = await fixtures();
        const result = await repository.createPatientWithNextStep(
          clinicId,
          demoUserId,
          {
            next: "single",
            patient: patient("Lia Avulsa"),
            plan,
            document: { templateId: template.id, title: template.name },
            appointments: [appointment],
          },
        );
        expect(result.plan).toMatchObject({ kind: "single" });
        expect(result.appointments).toHaveLength(1);
        expect(result.appointments![0]).toMatchObject({
          patientId: result.patient.id,
          planId: result.plan!.id,
          startsAt: appointment.startsAt,
        });
        expect(result.document).toMatchObject({
          status: "issued",
          patientId: result.patient.id,
          planId: result.plan!.id,
          templateId: template.id,
        });
      });

      it("issues the document of an additional plan and books the additional single", async () => {
        const { plan, appointment, template } = await fixtures();
        const services = plan.services.map((item) => ({
          ...item,
          totalSessions: 4,
          totalValueInCents: 30000,
        }));
        const subscription = await repository.createPlanTemplate(
          clinicId,
          demoUserId,
          {
            name: `Pacote RC8 ${randomUUID().slice(0, 6)}`,
            totalValueInCents: 30000,
            services,
          },
        );
        const result = await repository.createPatientWithNextStep(
          clinicId,
          demoUserId,
          {
            next: "plan",
            patient: patient("Rui Pacote"),
            plan: {
              ...plan,
              planTemplateId: subscription.id,
              name: subscription.name,
              kind: "fixed_package",
              services,
              totalValueInCents: 30000,
            },
            groupId: undefined,
            additionalPlans: [
              {
                plan: { ...plan, kind: "single" },
                groupId: undefined,
                document: { templateId: template.id, title: template.name },
                appointments: [appointment],
              },
            ],
          },
        );
        expect(result.document).toBeUndefined();
        expect(result.appointments).toBeUndefined();
        const [extra] = result.additionalPlans!;
        expect(extra!.plan).toMatchObject({ kind: "single" });
        expect(extra!.appointments).toHaveLength(1);
        expect(extra!.document).toMatchObject({
          status: "issued",
          planId: extra!.plan.id,
        });
      });

      it("undoes the client, plan and document when a session conflicts", async () => {
        const { plan, appointment, template } = await fixtures();
        await repository.createPatientWithNextStep(clinicId, demoUserId, {
          next: "single",
          patient: patient("Primeira"),
          plan,
          appointments: [appointment],
        });
        const before = (await repository.listIssuedDocuments(clinicId)).length;
        const second = patient("Segunda");
        await expect(
          repository.createPatientWithNextStep(clinicId, demoUserId, {
            next: "single",
            patient: second,
            plan,
            document: { templateId: template.id, title: template.name },
            appointments: [appointment],
          }),
        ).rejects.toMatchObject({ code: "APPOINTMENT_CONFLICT" });
        expect(
          (await repository.listPatients(clinicId)).some(
            (item) => item.fullName === second.fullName,
          ),
        ).toBe(false);
        expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(
          before,
        );
      });

      it("refuses sessions of another service", async () => {
        const { plan, appointment } = await fixtures();
        const other = await repository.createService(clinicId, {
          name: `Outro ${randomUUID().slice(0, 6)}`,
          durationMinutes: 50,
        });
        await expect(
          repository.createPatientWithNextStep(clinicId, demoUserId, {
            next: "single",
            patient: patient("Serviço errado"),
            plan,
            appointments: [{ ...appointment, serviceId: other.id }],
          }),
        ).rejects.toMatchObject({ code: "PLAN_SCHEDULE_MISMATCH" });
      });
    },
  );
}
