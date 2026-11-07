import { z } from "zod";
import { administrativeRegistryInputSchema } from "@crm/contracts";
import {
  clinicCatalogKindSchema,
  clinicCatalogInputSchema,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerCatalogRoutes({
  app,
  authenticate,
  repository,
}: RouteContext) {
  app.get("/admin/registry", { preHandler: authenticate }, async (request) =>
    repository.getAdministrativeRegistry(request.user.clinicId),
  );
  app.put(
    "/admin/registry/:id",
    { preHandler: authenticate },
    async (request) => {
      const input = administrativeRegistryInputSchema.parse(request.body);
      return repository.updateAdministrativeRegistry(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
        input,
      );
    },
  );
  app.get(
    "/clinic-catalogs/:kind",
    { preHandler: authenticate },
    async (request) =>
      repository.listClinicCatalog(
        request.user.clinicId,
        clinicCatalogKindSchema.parse(
          (request.params as { kind: string }).kind,
        ),
      ),
  );
  app.post(
    "/clinic-catalogs/:kind",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.saveClinicCatalog(
            request.user.clinicId,
            request.user.sub,
            clinicCatalogKindSchema.parse(
              (request.params as { kind: string }).kind,
            ),
            clinicCatalogInputSchema.parse(request.body),
          ),
        ),
  );
  app.put(
    "/clinic-catalogs/:kind/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { kind, id } = z
        .object({ kind: clinicCatalogKindSchema, id: z.uuid() })
        .parse(request.params);
      const item = await repository.saveClinicCatalog(
        request.user.clinicId,
        request.user.sub,
        clinicCatalogKindSchema.parse(kind),
        clinicCatalogInputSchema.parse(request.body),
        id,
      );
      return (
        item ??
        reply.status(404).send({
          code: "CATALOG_NOT_FOUND",
          message: "Cadastro não encontrado.",
        })
      );
    },
  );
}
