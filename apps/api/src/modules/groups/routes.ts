import {
  groupAttendanceInputSchema,
  groupClassInputSchema,
  groupClassUpdateSchema,
  groupEnrollmentInputSchema,
  replacementBookingInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

export function registerGroupsRoutes(context: RouteContext) {
  const { app, authenticate, repository } = context;

  app.get(
    "/groups/workspace",
    { preHandler: authenticate },
    async (request) => {
      const query = request.query as { from?: string; to?: string };
      if (!query.from || !query.to)
        throw new DomainError(
          "DATE_RANGE_REQUIRED",
          "Informe o período das turmas.",
        );
      return repository.getGroupWorkspace(
        request.user.clinicId,
        query.from,
        query.to,
      );
    },
  );

  app.post("/groups", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createGroupClass(
          request.user.clinicId,
          groupClassInputSchema.parse(request.body),
        ),
      ),
  );

  app.put(
    "/groups/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const group = await repository.updateGroupClass(
        request.user.clinicId,
        id,
        groupClassUpdateSchema.parse(request.body),
      );
      if (!group)
        return reply
          .status(404)
          .send({ code: "GROUP_NOT_FOUND", message: "Turma não encontrada." });
      return group;
    },
  );

  app.post(
    "/group-enrollments",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.createGroupEnrollment(
            request.user.clinicId,
            groupEnrollmentInputSchema.parse(request.body),
          ),
        ),
  );

  app.post(
    "/group-enrollments/:id/cancel",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const enrollment = await repository.cancelGroupEnrollment(
        request.user.clinicId,
        id,
      );
      if (!enrollment)
        return reply.status(404).send({
          code: "GROUP_ENROLLMENT_NOT_FOUND",
          message: "Matrícula não encontrada.",
        });
      return enrollment;
    },
  );

  // Encontros das turmas exibidos na agenda; a reserva é feita ao salvar a turma.
  app.get("/group-sessions", { preHandler: authenticate }, async (request) => {
    const query = request.query as { from?: string; to?: string };
    if (!query.from || !query.to)
      throw new DomainError(
        "DATE_RANGE_REQUIRED",
        "Informe o período da agenda.",
      );
    return repository.listGroupSessions(
      request.user.clinicId,
      query.from,
      query.to,
    );
  });

  app.put(
    "/group-sessions/:sessionId/attendance/:patientId",
    { preHandler: authenticate },
    async (request) => {
      const { sessionId, patientId } = request.params as {
        sessionId: string;
        patientId: string;
      };
      return repository.recordGroupAttendance(
        request.user.clinicId,
        request.user.sub,
        sessionId,
        patientId,
        groupAttendanceInputSchema.parse(request.body),
      );
    },
  );

  app.post(
    "/group-sessions/:id/complete",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = await repository.completeGroupSession(
        request.user.clinicId,
        id,
      );
      if (!session)
        return reply.status(404).send({
          code: "GROUP_SESSION_NOT_FOUND",
          message: "Sessão não encontrada.",
        });
      return session;
    },
  );

  app.post(
    "/group-replacements/book",
    { preHandler: authenticate },
    async (request) =>
      repository.bookReplacement(
        request.user.clinicId,
        request.user.sub,
        replacementBookingInputSchema.parse(request.body),
      ),
  );
}
