import { registerAgendaNoteRoutes } from "./notes-routes.js";
import {
  appointmentInputSchema,
  appointmentRescheduleInputSchema,
  appointmentStatusInputSchema,
  appointmentUpdateInputSchema,
  holidayInputSchema,
  isAppointmentStarted,
  leadAppointmentInputSchema,
  professionalInputSchema,
  recurringAppointmentInputSchema,
  recurringOccurrenceStarts,
  roomInputSchema,
  scheduleBlockInputSchema,
  serviceInputSchema,
  type ApiError,
  type ClinicalAppointmentOption,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

export function registerAgendaRoutes(context: RouteContext) {
  registerAgendaNoteRoutes(context);
  const {
    app,
    authenticate,
    repository,
    assertNoHoliday,
    assertServiceAvailable,
    assertPermissions,
  } = context;

  /** Remarcar/sucessor mantém o serviço: o profissional e a sala novos precisam atendê-lo. */
  async function assertMovedServiceAvailable(
    clinicId: string,
    appointmentId: string,
    input: { professionalId: string; roomId: string },
  ) {
    if (!z.uuid().safeParse(appointmentId).success) return;
    const serviceId = await repository.findAppointmentServiceId(
      clinicId,
      appointmentId,
    );
    if (serviceId)
      await assertServiceAvailable(clinicId, [{ ...input, serviceId }]);
  }

  app.get("/holidays", { preHandler: authenticate }, async (request) => {
    const query = z
      .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
      .parse(request.query);
    return repository.listHolidays(request.user.clinicId, query.from, query.to);
  });

  app.post("/holidays", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createHoliday(
          request.user.clinicId,
          holidayInputSchema.parse(request.body),
        ),
      ),
  );

  app.delete(
    "/holidays/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted =
        z.uuid().safeParse(id).success &&
        (await repository.deleteHoliday(request.user.clinicId, id));
      if (!deleted)
        return reply.status(404).send({
          code: "HOLIDAY_NOT_FOUND",
          message: "Feriado não encontrado.",
        } satisfies ApiError);
      return reply.status(204).send();
    },
  );

  app.get("/professionals", { preHandler: authenticate }, async (request) =>
    repository.listProfessionals(request.user.clinicId),
  );

  app.post(
    "/professionals",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createProfessional(
            request.user.clinicId,
            professionalInputSchema.parse(request.body),
          ),
        ),
  );

  app.get("/rooms", { preHandler: authenticate }, async (request) =>
    repository.listRooms(request.user.clinicId),
  );

  app.post("/rooms", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createRoom(
          request.user.clinicId,
          roomInputSchema.parse(request.body),
        ),
      ),
  );

  app.get("/services", { preHandler: authenticate }, async (request) =>
    repository.listServices(request.user.clinicId),
  );

  app.post("/services", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createService(
          request.user.clinicId,
          serviceInputSchema.parse(request.body),
        ),
      ),
  );

  app.get(
    "/appointments/options",
    { preHandler: authenticate },
    async (request): Promise<ClinicalAppointmentOption[]> => {
      const { from, to } = z
        .object({
          from: z.iso.datetime({ offset: true }),
          to: z.iso.datetime({ offset: true }),
        })
        .parse(request.query);
      const appointments = await repository.listAppointments(
        request.user.clinicId,
        from,
        to,
      );
      return (
        appointments
          // Evolução só para atendimento já iniciado (início − 15 min).
          .filter((item) => item.patientId && isAppointmentStarted(item))
          .map(
            ({
              id,
              patientId,
              startsAt,
              patientName,
              professionalName,
              status,
            }) => ({
              id,
              ...(patientId ? { patientId } : {}),
              startsAt,
              patientName,
              professionalName,
              status,
            }),
          )
      );
    },
  );

  app.get("/appointments", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listAppointments(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });

  // Atendimentos passados ainda agendados/confirmados (QC2): o instante é absoluto, então
  // "agora" no servidor vale para o fuso da clínica.
  app.get(
    "/appointments/pending-finalization",
    { preHandler: authenticate },
    async (request) =>
      repository.listPendingFinalizationAppointments(
        request.user.clinicId,
        new Date().toISOString(),
      ),
  );

  app.post(
    "/appointments",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = appointmentInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      await assertServiceAvailable(request.user.clinicId, [input]);
      return reply
        .status(201)
        .send(await repository.createAppointment(request.user.clinicId, input));
    },
  );

  app.post(
    "/appointments/recurring",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = recurringAppointmentInputSchema.parse(request.body);
      // Mesmas datas que os repositórios geram para cada ocorrência.
      const occurrences = recurringOccurrenceStarts(input);
      await assertNoHoliday(request.user.clinicId, occurrences);
      await assertServiceAvailable(request.user.clinicId, [input]);
      return reply
        .status(201)
        .send(
          await repository.createRecurringAppointments(
            request.user.clinicId,
            input,
          ),
        );
    },
  );

  app.post(
    "/appointments/:id/successor",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = appointmentRescheduleInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      await assertMovedServiceAvailable(
        request.user.clinicId,
        (request.params as { id: string }).id,
        input,
      );
      return reply
        .status(201)
        .send(
          await repository.createAbsenceSuccessor(
            request.user.clinicId,
            request.user.sub,
            (request.params as { id: string }).id,
            input,
          ),
        );
    },
  );
  app.put(
    "/appointments/:id/schedule",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = appointmentRescheduleInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      await assertMovedServiceAvailable(request.user.clinicId, id, input);
      const appointment = await repository.rescheduleAppointment(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return appointment;
    },
  );

  // Editar (QM6): serviço, sala e observação; data, horário e profissional são da remarcação.
  app.patch(
    "/appointments/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = appointmentUpdateInputSchema.parse(request.body);
      const current = z.uuid().safeParse(id).success
        ? await repository.findAppointment(request.user.clinicId, id)
        : null;
      if (!current)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        } satisfies ApiError);
      await assertServiceAvailable(request.user.clinicId, [
        {
          serviceId: input.serviceId,
          professionalId: current.professionalId,
          roomId: input.roomId,
        },
      ]);
      const appointment = await repository.updateAppointment(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        } satisfies ApiError);
      return appointment;
    },
  );

  app.get(
    "/appointments/:id/reschedules",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const events = await repository.listAppointmentReschedules(
        request.user.clinicId,
        id,
      );
      if (!events)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return events;
    },
  );

  app.patch(
    "/appointments/:id/status",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { status, absenceReason } = appointmentStatusInputSchema.parse(
        request.body,
      );
      assertPermissions(
        request,
        status === "cancelled" ? "agenda.cancel" : "agenda.attendance",
      );
      const appointment = await repository.updateAppointmentStatus(
        request.user.clinicId,
        id,
        status,
        absenceReason,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "APPOINTMENT_NOT_FOUND",
          message: "Atendimento não encontrado.",
        });
      return appointment;
    },
  );

  app.get("/schedule-blocks", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listScheduleBlocks(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });

  app.post(
    "/schedule-blocks",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createScheduleBlock(
            request.user.clinicId,
            scheduleBlockInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/schedule-blocks/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const block = await repository.cancelScheduleBlock(
        request.user.clinicId,
        id,
      );
      if (!block)
        return reply.status(404).send({
          code: "SCHEDULE_BLOCK_NOT_FOUND",
          message: "Bloqueio não encontrado.",
        });
      return block;
    },
  );

  app.post(
    "/leads/:id/appointments",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = leadAppointmentInputSchema.parse(request.body);
      await assertNoHoliday(request.user.clinicId, [input.startsAt]);
      await assertServiceAvailable(request.user.clinicId, [input]);
      const appointment = await repository.createLeadAppointment(
        request.user.clinicId,
        id,
        input,
      );
      if (!appointment)
        return reply.status(404).send({
          code: "LEAD_NOT_FOUND",
          message: "Lead não encontrado.",
        });
      return reply.status(201).send(appointment);
    },
  );
}
