import type { DashboardViewSummary } from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";

export function registerDashboardRoutes(context: RouteContext) {
  const { app, authenticate, repository, requestAccess } = context;

  app.get("/dashboard", { preHandler: authenticate }, async (request) => {
    const query = request.query as { date?: string };
    const date =
      query.date ??
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
    await repository.renewDuePatientPlans(
      request.user.clinicId,
      request.user.sub,
    );
    const access = requestAccess.get(request)!;
    if (
      !access.modules.includes("agenda") &&
      !access.modules.includes("patients")
    )
      return { date } satisfies DashboardViewSummary;
    const summary = await repository.getDashboard(request.user.clinicId, date);
    const pendingFinalization = access.modules.includes("agenda")
      ? (
          await repository.listPendingFinalizationAppointments(
            request.user.clinicId,
            new Date().toISOString(),
          )
        ).length
      : undefined;
    return {
      date,
      ...(access.modules.includes("agenda")
        ? {
            appointmentsToday: summary.appointmentsToday,
            nonCancelledAppointmentsToday:
              summary.nonCancelledAppointmentsToday,
            pendingToday: summary.pendingToday,
            awaitingConfirmationToday: summary.awaitingConfirmationToday,
            completedToday: summary.completedToday,
            noShowsThisMonth: summary.noShowsThisMonth,
            nextAppointments: summary.nextAppointments,
            pendingFinalization,
          }
        : {}),
      ...(access.modules.includes("patients")
        ? { patientsActive: summary.patientsActive }
        : {}),
    } satisfies DashboardViewSummary;
  });
}
