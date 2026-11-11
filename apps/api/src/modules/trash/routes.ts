import {
  trashKindModules,
  trashKindSchema,
  trashPurgeInputSchema,
  type TrashImpact,
  type TrashItem,
} from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
import { DomainError } from "../../repository.js";

/**
 * Lixeira de clientes, leads, atendimentos e planos do cliente. Enviar exige `trash.send`; ver,
 * restaurar e excluir de vez exigem `trash.view`. As duas pedem também acesso à área do tópico.
 */
export function registerTrashRoutes({
  app,
  authenticate,
  assertPermissions,
  repository,
}: RouteContext) {
  const kindParams = z.object({ kind: trashKindSchema });
  const itemParams = z.object({ kind: trashKindSchema, id: z.string() });
  const parseItem = (params: unknown) => {
    const parsed = itemParams.parse(params);
    if (!z.uuid().safeParse(parsed.id).success)
      throw new DomainError(
        "TRASH_ITEM_NOT_FOUND",
        "Item não encontrado.",
        404,
      );
    return parsed;
  };

  app.get("/trash/:kind", { preHandler: authenticate }, async (request) => {
    const { kind } = kindParams.parse(request.params);
    assertPermissions(request, `${trashKindModules[kind]}.view`);
    return repository.listTrash(request.user.clinicId, kind) as Promise<
      TrashItem[]
    >;
  });

  app.post(
    "/trash/:kind/:id",
    { preHandler: authenticate },
    async (request, reply): Promise<TrashItem> => {
      const { kind, id } = parseItem(request.params);
      assertPermissions(request, `${trashKindModules[kind]}.view`);
      const item = await repository.sendToTrash(
        request.user.clinicId,
        request.user.sub,
        kind,
        id,
      );
      reply.status(201);
      return item;
    },
  );

  app.get(
    "/trash/:kind/:id/impact",
    { preHandler: authenticate },
    async (request): Promise<TrashImpact> => {
      const { kind, id } = parseItem(request.params);
      assertPermissions(request, `${trashKindModules[kind]}.view`);
      return repository.trashImpact(request.user.clinicId, kind, id);
    },
  );

  app.post(
    "/trash/:kind/:id/restore",
    { preHandler: authenticate },
    async (request, reply) => {
      const { kind, id } = parseItem(request.params);
      assertPermissions(request, `${trashKindModules[kind]}.view`);
      await repository.restoreFromTrash(
        request.user.clinicId,
        request.user.sub,
        kind,
        id,
      );
      return reply.status(204).send();
    },
  );

  app.delete(
    "/trash/:kind/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { kind, id } = parseItem(request.params);
      assertPermissions(request, `${trashKindModules[kind]}.view`);
      trashPurgeInputSchema.parse(request.body ?? {});
      await repository.purgeFromTrash(
        request.user.clinicId,
        request.user.sub,
        kind,
        id,
      );
      return reply.status(204).send();
    },
  );
}
