import { branchInputSchema } from "@crm/contracts";
import { z } from "zod";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerBranchesRoutes(context: RouteContext) {
  const { app, authenticate, repository, accessibleBranches } = context;

  // Filiais ativas que o usuário logado pode escolher no cabeçalho.
  app.get("/branches", { preHandler: authenticate }, async (request) => {
    const user = await repository.findUserById(
      request.user.clinicId,
      request.user.sub,
    );
    return user ? accessibleBranches(user) : [];
  });

  app.get("/admin/branches", { preHandler: authenticate }, async (request) =>
    repository.listBranches(request.user.clinicId),
  );

  app.post(
    "/admin/branches",
    { preHandler: authenticate },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await repository.saveBranch(
            request.user.clinicId,
            request.user.sub,
            branchInputSchema.parse(request.body),
          ),
        ),
  );

  app.put(
    "/admin/branches/:id",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(request.params);
      const branch = await repository.saveBranch(
        request.user.clinicId,
        request.user.sub,
        branchInputSchema.parse(request.body),
        id,
      );
      if (!branch)
        return reply
          .status(404)
          .send({
            code: "BRANCH_NOT_FOUND",
            message: "Filial não encontrada.",
          });
      return branch;
    },
  );
}
