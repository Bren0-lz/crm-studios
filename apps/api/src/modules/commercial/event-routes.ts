import { eventInputSchema } from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

/** Eventos do comercial: o participante é um lead do CRM ligado ao evento. */
export function registerEventRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  const idParams = z.object({ id: z.uuid() });
  const notFound = () =>
    new DomainError("EVENT_NOT_FOUND", "Evento não encontrado.", 404);

  app.get("/events", { preHandler: authenticate }, async (request) =>
    repository.listEvents(request.user.clinicId),
  );
  app.get("/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const event = await repository.getEvent(request.user.clinicId, id);
    if (!event) throw notFound();
    return event;
  });
  app.post("/events", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createEvent(
          request.user.clinicId,
          request.user.sub,
          eventInputSchema.parse(request.body),
        ),
      ),
  );
  app.put("/events/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const event = await repository.updateEvent(
      request.user.clinicId,
      request.user.sub,
      id,
      eventInputSchema.parse(request.body),
    );
    if (!event) throw notFound();
    return event;
  });
}
