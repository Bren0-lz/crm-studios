import {
  agendaNoteInputSchema,
  agendaNoteUpdateSchema,
  agendaNoteScopeSchema,
} from "@crm/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

export function registerAgendaNoteRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  // O CRM usa admin/user; o vínculo com professionals identifica o profissional.
  async function professionalScope(request: FastifyRequest) {
    if (request.user.role === "admin") return undefined;
    return (
      await repository.getOwnProfile(request.user.clinicId, request.user.sub)
    )?.professional?.id;
  }
  function assertTarget(
    scope: string | undefined,
    professionalId: string | null,
  ) {
    if (scope && professionalId !== scope)
      throw new DomainError(
        "AGENDA_NOTE_FORBIDDEN",
        "Você só pode gerenciar suas próprias notas.",
        403,
      );
  }
  function notFound() {
    return new DomainError(
      "AGENDA_NOTE_NOT_FOUND",
      "Nota não encontrada.",
      404,
    );
  }
  const scopeQuery = z.object({ scope: agendaNoteScopeSchema });
  const idParams = z.object({ id: z.uuid() });
  app.get("/agenda-notes", { preHandler: authenticate }, async (request) => {
    const { from, to } = z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      })
      .refine(
        (range) => Date.parse(range.to) > Date.parse(range.from),
        "Informe um período válido.",
      )
      .parse(request.query);
    return repository.listAgendaNotes(
      request.user.clinicId,
      from,
      to,
      await professionalScope(request),
    );
  });
  app.post(
    "/agenda-notes",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = agendaNoteInputSchema.parse(request.body);
      assertTarget(await professionalScope(request), input.professionalId);
      return reply
        .status(201)
        .send(
          await repository.createAgendaNotes(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );
  app.patch(
    "/agenda-notes/:id",
    { preHandler: authenticate },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { scope } = scopeQuery.parse(request.query);
      const input = agendaNoteUpdateSchema.parse(request.body);
      const professional = await professionalScope(request);
      assertTarget(professional, input.professionalId);
      const result = await repository.updateAgendaNote(
        request.user.clinicId,
        request.user.sub,
        id,
        input,
        scope,
        professional,
      );
      if (!result) throw notFound();
      return result;
    },
  );
  app.delete(
    "/agenda-notes/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { scope } = scopeQuery.parse(request.query);
      if (
        !(await repository.deleteAgendaNote(
          request.user.clinicId,
          request.user.sub,
          id,
          scope,
          await professionalScope(request),
        ))
      )
        throw notFound();
      return reply.status(204).send();
    },
  );
}
