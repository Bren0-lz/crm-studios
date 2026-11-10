import {
  type WaitlistOptions,
  waitlistEntryInputSchema,
  waitlistEntryUpdateSchema,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

/** Lista de espera: clientes aguardando turma de um serviço ou reposição de um produto. */
export function registerWaitlistRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  const idParams = z.object({ id: z.uuid() });
  const notFound = () =>
    new DomainError(
      "WAITLIST_ENTRY_NOT_FOUND",
      "Entrada da lista de espera não encontrada.",
      404,
    );
  app.get("/waitlist", { preHandler: authenticate }, async (request) =>
    repository.listWaitlist(request.user.clinicId),
  );
  // Quem só acessa a lista de espera também precisa escolher o serviço ou o produto.
  app.get(
    "/waitlist/options",
    { preHandler: authenticate },
    async (request): Promise<WaitlistOptions> => {
      const [services, inventory] = await Promise.all([
        repository.listServices(request.user.clinicId),
        repository.getInventoryWorkspace(request.user.clinicId),
      ]);
      const byName = (left: { name: string }, right: { name: string }) =>
        left.name.localeCompare(right.name, "pt-BR");
      return {
        services: services
          .filter((item) => item.active)
          .map(({ id, name }) => ({ id, name }))
          .sort(byName),
        products: inventory.products
          .filter((item) => item.active)
          .map(({ id, name, currentStock }) => ({ id, name, currentStock }))
          .sort(byName),
      };
    },
  );
  app.post("/waitlist", { preHandler: authenticate }, async (request, reply) =>
    reply
      .status(201)
      .send(
        await repository.createWaitlistEntry(
          request.user.clinicId,
          request.user.sub,
          waitlistEntryInputSchema.parse(request.body),
        ),
      ),
  );
  app.patch("/waitlist/:id", { preHandler: authenticate }, async (request) => {
    const { id } = idParams.parse(request.params);
    const entry = await repository.updateWaitlistEntry(
      request.user.clinicId,
      request.user.sub,
      id,
      waitlistEntryUpdateSchema.parse(request.body),
    );
    if (!entry) throw notFound();
    return entry;
  });
  app.delete(
    "/waitlist/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      if (!(await repository.deleteWaitlistEntry(request.user.clinicId, id)))
        throw notFound();
      return reply.status(204).send();
    },
  );
}
