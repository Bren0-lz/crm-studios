import { randomUUID } from "node:crypto";
import { patientInputSchema } from "@crm/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { buildApp } from "../../../app.js";
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

// Lista de espera com a espera das turmas (RE14): GET /waitlist/groups.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: espera das turmas na lista de espera`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let app: Awaited<ReturnType<typeof buildApp>>;
      let headers: { authorization: string };

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("waitlistgroups");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(async () => {
        if (storage === "memory") repository = new MemoryClinicRepository();
        app = await buildApp({ repository, logger: false });
        headers = {
          authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
        };
      });

      afterEach(async () => {
        await app?.close();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("lists waitlisted enrollments with group and position, then follows confirm and cancel", async () => {
        const createPatient = (name: string) =>
          repository.createPatient(
            clinicId,
            patientInputSchema.parse({
              cpf: nextTestCpf(),
              fullName: `${name} ${randomUUID().slice(0, 8)}`,
              phone: "11988887777",
              whatsapp: "11988887777",
              emergencyContactName: "Contato de Emergência",
              emergencyContactPhone: "11988887777",
              emergencyContactWhatsapp: "11988887777",
            }),
          );
        const ana = await createPatient("Ana");
        const bruno = await createPatient("Bruno");
        const carla = await createPatient("Carla");
        const [professional] = await repository.listProfessionals(clinicId),
          rooms = await repository.listRooms(clinicId),
          [service] = await repository.listServices(clinicId);
        const room = rooms.find((item) => item.capacity >= 3)!;
        // Domingo à noite, fora dos atendimentos demo.
        const group = await repository.createGroupClass(clinicId, {
          name: `TESTE Turma ${randomUUID().slice(0, 8)}`,
          serviceId: service!.id,
          professionalId: professional!.id,
          roomId: room.id,
          capacity: 1,
          weeklySlots: [{ weekday: 0, startTime: "21:00", endTime: "22:00" }],
        });
        const enroll = (patientId: string) =>
          repository.createGroupEnrollment(clinicId, {
            groupId: group.id,
            patientId,
          });
        const active = await enroll(ana.id);
        const bruno1 = await enroll(bruno.id);
        const carla2 = await enroll(carla.id);
        expect([active.status, bruno1.status, carla2.status]).toEqual([
          "active",
          "waitlisted",
          "waitlisted",
        ]);

        const list = async () => {
          const response = await app.inject({
            method: "GET",
            url: "/waitlist/groups",
            headers,
          });
          expect(response.statusCode).toBe(200);
          return (
            response.json() as {
              enrollment: {
                id: string;
                patientId: string;
                queuePosition?: number;
                status: string;
              };
              group: {
                id: string;
                name: string;
                serviceId: string;
                serviceName: string;
                capacity: number;
                activeEnrollments: number;
              };
            }[]
          ).filter((item) => item.group.id === group.id);
        };

        const first = await list();
        expect(
          first.map((item) => [
            item.enrollment.patientId,
            item.enrollment.queuePosition,
            item.enrollment.status,
          ]),
        ).toEqual([
          [bruno.id, 1, "waitlisted"],
          [carla.id, 2, "waitlisted"],
        ]);
        expect(first[0]!.group).toMatchObject({
          name: group.name,
          serviceId: service!.id,
          serviceName: service!.name,
          capacity: 1,
          activeEnrollments: 1,
        });

        // Remover da espera usa o cancelamento da matrícula e reordena a fila.
        const removed = await app.inject({
          method: "POST",
          url: `/group-enrollments/${bruno1.id}/cancel`,
          headers,
        });
        expect(removed.statusCode).toBe(200);
        expect(
          (await list()).map((item) => [
            item.enrollment.patientId,
            item.enrollment.queuePosition,
          ]),
        ).toEqual([[carla.id, 1]]);

        // Vaga aberta não promove ninguém; a oferta aceita confirma pela rota de Turmas.
        await repository.cancelGroupEnrollment(clinicId, active.id);
        const open = await list();
        expect(open).toHaveLength(1);
        expect(open[0]!.group.activeEnrollments).toBe(0);
        const confirmed = await app.inject({
          method: "POST",
          url: `/group-enrollments/${carla2.id}/confirm`,
          headers,
        });
        expect(confirmed.statusCode).toBe(200);
        expect(await list()).toEqual([]);
      });
    },
  );
}
