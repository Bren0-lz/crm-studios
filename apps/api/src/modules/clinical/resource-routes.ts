import { clinicalResourceInputSchema } from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";
export function registerClinicalResourceRoutes({
  app,
  authenticate,
  repository,
  assertPermissions,
}: RouteContext) {
  app.get(
    "/clinical-resources/catalog",
    { preHandler: authenticate },
    async (request) =>
      repository.listClinicalResources(
        request.user.clinicId,
        request.user.sub,
        undefined,
        "read",
        true,
      ),
  );
  const query = z.object({ patientId: z.uuid().optional() });
  app.get("/clinical-sources", { preHandler: authenticate }, async (request) =>
    repository.listClinicalSources(
      request.user.clinicId,
      query.parse(request.query).patientId,
    ),
  );
  app.get(
    "/clinical-resources",
    { preHandler: authenticate },
    async (request) =>
      repository.listClinicalResources(
        request.user.clinicId,
        request.user.sub,
        query.parse(request.query).patientId,
      ),
  );
  app.get(
    "/clinical-resources/export",
    { preHandler: authenticate },
    async (request) =>
      repository.listClinicalResources(
        request.user.clinicId,
        request.user.sub,
        query.parse(request.query).patientId,
        "export",
      ),
  );
  app.post(
    "/clinical-resources",
    { preHandler: authenticate },
    async (request, reply) => {
      const input = clinicalResourceInputSchema.parse(request.body);
      assertPermissions(
        request,
        input.kind === "evolution" || input.kind === "clinical_document"
          ? "clinical.records_create"
          : input.kind === "evolution_template"
            ? "clinical.templates_create"
            : "clinical.resources_manage",
      );
      return reply
        .status(201)
        .send(
          await repository.saveClinicalResource(
            request.user.clinicId,
            request.user.sub,
            input,
          ),
        );
    },
  );
  app.put(
    "/clinical-resources/:id",
    { preHandler: authenticate },
    async (request) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params),
        input = clinicalResourceInputSchema.parse(request.body);
      assertPermissions(
        request,
        input.kind === "evolution" || input.kind === "clinical_document"
          ? "clinical.records_update"
          : input.kind === "evolution_template"
            ? "clinical.templates_create"
            : "clinical.resources_manage",
      );
      return repository.saveClinicalResource(
        request.user.clinicId,
        request.user.sub,
        input,
        id,
      );
    },
  );
  app.post(
    "/clinical-resources/:id/finalize",
    { preHandler: authenticate },
    async (request) =>
      repository.finalizeClinicalResource(
        request.user.clinicId,
        request.user.sub,
        z.object({ id: z.uuid() }).parse(request.params).id,
      ),
  );
}
