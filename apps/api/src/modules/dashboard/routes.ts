import {
  isOverdueReceivable,
  type DashboardViewSummary,
  type NotificationsSummary,
} from "@crm/contracts";
import type { RouteContext } from "../../infrastructure/route-context.js";
import {
  agendaProfessionalScope,
  inProfessionalScope,
  professionalIdsQuery,
} from "../agenda/professional-scope.js";
import {
  clinicDateOf,
  DEFAULT_CLINIC_TIMEZONE,
} from "../finance/daily-cash.js";

export function registerDashboardRoutes(context: RouteContext) {
  const { app, authenticate, repository, requestAccess } = context;
  const professionalScope = agendaProfessionalScope(context);

  app.get("/dashboard", { preHandler: authenticate }, async (request) => {
    const query = request.query as { date?: string; professionalIds?: string };
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
    // Escolha "Visualização da agenda" do painel; sem "ver todos", só o próprio profissional.
    const scope = access.modules.includes("agenda")
      ? await professionalScope(
          request,
          professionalIdsQuery.parse(query.professionalIds),
        )
      : undefined;
    const summary = await repository.getDashboard(
      request.user.clinicId,
      date,
      scope,
    );
    const pendingFinalization = access.modules.includes("agenda")
      ? inProfessionalScope(
          await repository.listPendingFinalizationAppointments(
            request.user.clinicId,
            new Date().toISOString(),
          ),
          scope,
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

  /**
   * Sino do cabeçalho (QM13): só contagens, cada grupo apenas com o módulo correspondente.
   * Aniversariantes do dia ainda sem parabéns (relacionamento), parcelas vencidas em aberto
   * (financeiro, mesma regra da etiqueta "Pagamento atrasado") e atendimentos a finalizar
   * (agenda).
   */
  app.get("/notifications", { preHandler: authenticate }, async (request) => {
    const { clinicId } = request.user;
    const modules = requestAccess.get(request)?.modules ?? [];
    const settings = await repository.getClinicSettings(clinicId);
    const date = clinicDateOf(
      new Date(),
      settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
    );
    const [birthdays, finance, pending] = await Promise.all([
      modules.includes("relationship")
        ? repository.listBirthdays(clinicId, date.slice(0, 7))
        : undefined,
      modules.includes("finance")
        ? repository.getFinancialSummary(clinicId)
        : undefined,
      modules.includes("agenda")
        ? Promise.all([
            repository.listPendingFinalizationAppointments(
              clinicId,
              new Date().toISOString(),
            ),
            professionalScope(request),
          ]).then(([items, scope]) => inProfessionalScope(items, scope))
        : undefined,
    ]);
    return {
      date,
      ...(birthdays
        ? {
            birthdaysToday: birthdays.filter(
              (item) => item.date === date && !item.congratulated,
            ).length,
          }
        : {}),
      ...(finance
        ? {
            overdueReceivables: finance.receivables.filter((item) =>
              isOverdueReceivable(item, date),
            ).length,
          }
        : {}),
      ...(pending ? { pendingFinalization: pending.length } : {}),
    } satisfies NotificationsSummary;
  });
}
