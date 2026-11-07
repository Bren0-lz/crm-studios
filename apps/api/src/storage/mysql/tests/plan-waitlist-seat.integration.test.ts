import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { patientInputSchema, type PatientPlanInput } from "@crm/contracts";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// Cliente na lista de espera de uma turma com vaga livre: a venda do plano confirma a
// matrícula em vez de recusar como turma cheia.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: venda de plano para cliente da lista de espera`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      // Cada teste usa outro dia: no MySQL o banco é compartilhado e as turmas conflitariam.
      let weekday = 0;
      beforeAll(async () => {
        if (storage === "mysql") {
          database = await createTestDatabase("waitseat");
          repository = new MysqlClinicRepository(database.pool);
        }
      }, 60_000);
      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });
      afterAll(async () => {
        await database?.drop();
      });

      const createPatient = (name: string) =>
        repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            cpf: nextTestCpf(),
            fullName: `${name} ${randomUUID().slice(0, 8)}`,
            phone: "11988887777",
            whatsapp: "11988887777",
            emergencyContactName: "Contato",
            emergencyContactPhone: "11988887777",
          }),
        );

      async function fixture(capacity: number) {
        const [first, second, third] = await Promise.all([
          createPatient("Primeira"),
          createPatient("Segunda"),
          createPatient("Terceira"),
        ]);
        const [professional] = await repository.listProfessionals(clinicId);
        const room = (await repository.listRooms(clinicId)).find(
          (item) => item.capacity >= 2,
        )!;
        const service = await repository.createService(clinicId, {
          name: `Turma ${randomUUID().slice(0, 8)}`,
          durationMinutes: 60,
        });
        const group = await repository.createGroupClass(clinicId, {
          serviceId: service.id,
          professionalId: professional!.id,
          roomId: room.id,
          capacity,
          weeklySlots: [
            { weekday: weekday++, startTime: "21:00", endTime: "22:00" },
          ],
        });
        const enroll = (patientId: string) =>
          repository.createGroupEnrollment(clinicId, {
            groupId: group.id,
            patientId,
          });
        const seated = await enroll(first!.id);
        const waiting = await enroll(second!.id);
        const behind = await enroll(third!.id);
        const services = [
          { serviceId: service.id, totalSessions: 4, totalValueInCents: 20_000 },
        ];
        const template = await repository.createPlanTemplate(
          clinicId,
          actorId,
          {
            name: `Plano da turma ${randomUUID().slice(0, 8)}`,
            totalValueInCents: 20_000,
            services,
          },
        );
        const plan: PatientPlanInput = {
          patientId: second!.id,
          planTemplateId: template.id,
          name: template.name,
          kind: "recurring",
          services,
          totalValueInCents: 20_000,
          installments: 1,
          validFrom: "2026-10-01",
          validUntil: "2026-10-31",
          firstDueDate: "2026-10-15",
          autoRenew: false,
        };
        const purchase = () =>
          repository.purchasePatientPlan(clinicId, actorId, {
            idempotencyKey: randomUUID(),
            plan,
            appointments: [],
            groupId: group.id,
          });
        const enrollments = async () =>
          (
            await repository.getGroupWorkspace(
              clinicId,
              "2039-01-01T00:00:00Z",
              "2039-01-02T00:00:00Z",
            )
          ).enrollments.filter((item) => item.groupId === group.id);
        return { seated, waiting, behind, purchase, enrollments };
      }

      it("confirma a matrícula de quem estava na espera quando há vaga", async () => {
        const { seated, waiting, behind, purchase, enrollments } =
          await fixture(1);
        expect(waiting).toMatchObject({ status: "waitlisted" });
        await repository.cancelGroupEnrollment(clinicId, seated.id);

        const sale = await purchase();
        expect(sale.enrollment).toMatchObject({
          id: waiting.id,
          status: "active",
        });
        const after = await enrollments();
        expect(after.find((item) => item.id === waiting.id)?.status).toBe(
          "active",
        );
        expect(after.find((item) => item.id === behind.id)).toMatchObject({
          status: "waitlisted",
          queuePosition: 1,
        });
      });

      it("continua recusando a venda quando a turma segue cheia", async () => {
        const { waiting, purchase, enrollments } = await fixture(1);
        await expect(purchase()).rejects.toMatchObject({ code: "GROUP_FULL" });
        expect(
          (await enrollments()).find((item) => item.id === waiting.id),
        ).toMatchObject({ status: "waitlisted", queuePosition: 1 });
        expect(
          await repository.listPatientPlans(clinicId, waiting.patientId),
        ).toEqual([]);
      });
    },
  );
}
