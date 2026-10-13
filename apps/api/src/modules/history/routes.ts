import { auditHistoryQuerySchema } from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerHistoryRoutes(context: RouteContext) {
  const { app, authenticate, repository, visibleHistory } = context;

  app.get(
    "/history/audit-events",
    { preHandler: authenticate },
    async (request) => {
      const { cursor, ...filters } = auditHistoryQuerySchema.parse(
        request.query,
      );
      const page = await repository.listAdminAuditPage(
        request.user.clinicId,
        cursor,
        filters,
      );
      return {
        ...page,
        items: page.items.map((event) => visibleHistory(request, event)),
      };
    },
  );

  app.get("/history/actors", { preHandler: authenticate }, async (request) =>
    repository.listHistoryActors(request.user.clinicId),
  );
}
