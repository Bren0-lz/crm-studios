import type { AdminAuditPage } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  OWNER_ID,
} from "../../test-support/legacy-fixtures.js";
import { nextTestCpf } from "../../test-support/cpf.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

/** RF1: as rotas gravam quem contratou, matriculou e movimentou o saldo. */
describe("responsável no histórico de plano, matrícula e saldo", () => {
  it("usa o usuário da requisição na contratação, na matrícula, na vaga da espera e no atendimento", async () => {
    const { app, token, repository } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const history = async (action: string, entityId: string) =>
      (
        await app.inject({
          url: `/history/audit-events?action=${action}`,
          headers,
        })
      )
        .json<AdminAuditPage>()
        .items.find((event) => event.entityId === entityId);
    try {
      const patient = (name: string) =>
        repository.createPatient(clinicId, {
          cpf: nextTestCpf(),
          fullName: `${name} ${randomUUID().slice(0, 6)}`,
          phone: "11988887777",
          tags: [],
        });
      const [professional] = await repository.listProfessionals(clinicId),
        rooms = await repository.listRooms(clinicId),
        [service] = await repository.listServices(clinicId);
      const room = rooms.find((item) => item.capacity >= 2)!;

      // Contratação pela ficha (/plans) e atendimento finalizado.
      const client = await patient("Cliente do plano");
      const template = await repository.createPlanTemplate(
        clinicId,
        OWNER_ID,
        {
          name: `Plano ${randomUUID().slice(0, 6)}`,
          planType: "single",
          kind: "single",
          totalValueInCents: 9000,
          services: [
            {
              serviceId: service!.id,
              totalSessions: 1,
              totalValueInCents: 9000,
            },
          ],
        },
      );
      const created = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          patientId: client.id,
          planTemplateId: template.id,
          name: template.name,
          kind: "single",
          totalValueInCents: 9000,
          services: [
            {
              serviceId: service!.id,
              totalSessions: 1,
              totalValueInCents: 9000,
            },
          ],
          installments: 1,
          firstDueDate: "2025-05-08",
          validFrom: "2025-05-08",
          validUntil: "2025-05-08",
        },
      });
      expect(created.statusCode).toBe(201);
      const plan = created.json<{ id: string }>();
      expect(await history("plan.created", plan.id)).toMatchObject({
        actorUserId: OWNER_ID,
      });
      const appointment = await repository.createAppointment(clinicId, {
        patientId: client.id,
        professionalId: professional!.id,
        roomId: room.id,
        serviceId: service!.id,
        startsAt: "2025-05-08T13:00:00Z",
        visitType: "regular",
        notes: "",
        planId: plan.id,
      });
      const completed = await app.inject({
        method: "PATCH",
        url: `/appointments/${appointment.id}/status`,
        headers,
        payload: { status: "completed" },
      });
      expect(completed.statusCode).toBe(200);
      const consumption = (
        await repository.listSessionMovements(clinicId, plan.id)
      ).find((item) => item.kind === "consumption")!;
      expect(
        await history("session.movement", consumption.id),
      ).toMatchObject({ actorUserId: OWNER_ID });

      // Matrícula em Turmas e confirmação pela Lista de espera.
      const group = await repository.createGroupClass(clinicId, {
        serviceId: service!.id,
        professionalId: professional!.id,
        roomId: room.id,
        capacity: 1,
        weeklySlots: [{ weekday: 0, startTime: "21:30", endTime: "22:30" }],
      });
      const first = await patient("Primeira"),
        second = await patient("Segunda");
      const enroll = (patientId: string) =>
        app.inject({
          method: "POST",
          url: "/group-enrollments",
          headers,
          payload: { groupId: group.id, patientId },
        });
      const active = (await enroll(first.id)).json<{ id: string }>();
      expect(await history("group.enrolled", active.id)).toMatchObject({
        actorUserId: OWNER_ID,
      });
      const waiting = (await enroll(second.id)).json<{
        id: string;
        status: string;
      }>();
      expect(waiting.status).toBe("waitlisted");
      await app.inject({
        method: "POST",
        url: `/group-enrollments/${active.id}/cancel`,
        headers,
      });
      const confirmed = await app.inject({
        method: "POST",
        url: `/group-enrollments/${waiting.id}/confirm`,
        headers,
      });
      expect(confirmed.statusCode).toBe(200);
      expect(await history("group.enrolled", waiting.id)).toMatchObject({
        actorUserId: OWNER_ID,
      });
    } finally {
      await app.close();
    }
  });
});
