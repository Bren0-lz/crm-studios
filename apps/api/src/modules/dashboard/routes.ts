import {
  isOverdueReceivable,
  notificationPreferencesSchema,
  recurringPayableReminders,
  unsignedReceiptPatientCount,
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
import { loadAutoCampaignQueue } from "../communications/auto-campaigns.js";

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
   * (financeiro, mesma regra da etiqueta "Pagamento atrasado"), clientes com recibo enviado e
   * não assinado, no horário do aviso configurado na clínica (financeiro), despesas fixas no prazo de
   * aviso configurado ou vencidas (financeiro), atendimentos a finalizar
   * (agenda) e os retornos combinados pela equipe: tarefas comerciais vencidas (crm),
   * contatos adiados que voltaram à lista (relacionamento) e pausas com retorno previsto
   * até hoje (planos). Com Comunicações, as campanhas automáticas com mensagens pendentes.
   */
  app.get(
    "/notifications/preferences",
    { preHandler: authenticate },
    async (request) =>
      repository.getNotificationPreferences(
        request.user.clinicId,
        request.user.sub,
      ),
  );

  app.put(
    "/notifications/preferences",
    { preHandler: authenticate },
    async (request) =>
      repository.saveNotificationPreferences(
        request.user.clinicId,
        request.user.sub,
        notificationPreferencesSchema.parse(request.body),
      ),
  );

  app.get("/notifications", { preHandler: authenticate }, async (request) => {
    const { clinicId } = request.user;
    const modules = requestAccess.get(request)?.modules ?? [];
    const settings = await repository.getClinicSettings(clinicId);
    const now = new Date();
    const timezone = settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE;
    const date = clinicDateOf(now, timezone);
    const [
      birthdays,
      finance,
      recurringDue,
      pending,
      leads,
      snoozed,
      plans,
      inventory,
      autoQueue,
    ] = await Promise.all([
      modules.includes("relationship")
        ? repository.listBirthdays(clinicId, date.slice(0, 7))
        : undefined,
      modules.includes("finance")
        ? repository.getFinancialSummary(clinicId)
        : undefined,
      modules.includes("finance")
        ? Promise.all([
            repository.listRecurringPayables(clinicId),
            repository.getFinancialWorkspace(clinicId),
          ]).then(
            ([models, workspace]) =>
              recurringPayableReminders(models, workspace.payables, date)
                .length,
          )
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
      modules.includes("crm") ? repository.listLeads(clinicId) : undefined,
      modules.includes("relationship")
        ? Promise.all([
            repository.listContactSuggestions(clinicId, modules),
            repository.listContactActivities(clinicId),
          ]).then(([suggestions, activities]) => {
            // Sugestão visível com "Adiar contato" registrado: o adiamento acabou.
            const returned = suggestions.filter((suggestion) =>
              activities.some(
                (activity) =>
                  activity.outcome === "snoozed" &&
                  activity.patientId === suggestion.patientId &&
                  activity.reason === suggestion.reason &&
                  activity.referenceKey === suggestion.referenceKey,
              ),
            );
            return new Set(returned.map((item) => item.patientId)).size;
          })
        : undefined,
      modules.includes("plans")
        ? repository.listPatientPlans(clinicId)
        : undefined,
      requestAccess
        .get(request)
        ?.permissions.includes("patients.inventory_view")
        ? repository.getInventoryWorkspace(clinicId)
        : undefined,
      modules.includes("communications")
        ? loadAutoCampaignQueue(repository, clinicId, modules)
        : undefined,
    ]);
    const groupWorkspace =
      modules.includes("groups") && modules.includes("patients")
        ? await repository.getGroupWorkspace(
            clinicId,
            now.toISOString(),
            now.toISOString(),
          )
        : undefined;
    const groupVacancies = groupWorkspace?.groups.flatMap((group) => {
      if (!group.active || group.activeEnrollments >= group.capacity) return [];
      const waiting = groupWorkspace.enrollments
        .filter(
          (item) => item.groupId === group.id && item.status === "waitlisted",
        )
        .sort(
          (a, b) =>
            (a.queuePosition ?? 0) - (b.queuePosition ?? 0) ||
            a.enrolledAt.localeCompare(b.enrolledAt),
        );
      const first = waiting[0];
      return first
        ? [
            {
              groupId: group.id,
              groupName: group.name,
              vacancies: group.capacity - group.activeEnrollments,
              waiting: waiting.length,
              enrollmentId: first.id,
              patientId: first.patientId,
              patientName: first.patientName,
            },
          ]
        : [];
    });
    return {
      date,
      ...(groupVacancies ? { groupVacancies } : {}),
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
      ...(finance
        ? {
            unsignedReceipts: unsignedReceiptPatientCount(finance.receivables),
          }
        : {}),
      ...(recurringDue !== undefined
        ? { recurringPayablesDue: recurringDue }
        : {}),
      ...(pending ? { pendingFinalization: pending.length } : {}),
      ...(leads
        ? {
            overdueLeadTasks: leads
              .filter((lead) => !["won", "lost"].includes(lead.stage))
              .reduce((sum, lead) => sum + lead.overdueTasks, 0),
          }
        : {}),
      ...(snoozed !== undefined ? { snoozedContactsDue: snoozed } : {}),
      ...(plans
        ? {
            pauseReturnsDue: plans.filter(
              (plan) =>
                plan.status === "paused" &&
                plan.pauseExpectedReturn !== undefined &&
                plan.pauseExpectedReturn <= date,
            ).length,
          }
        : {}),
      ...(inventory
        ? {
            lowStockProducts: inventory.products.filter(
              (product) => product.active && product.lowStock,
            ).length,
          }
        : {}),
      ...(autoQueue
        ? {
            autoCampaigns: autoQueue.campaigns
              .filter((campaign) => campaign.pending > 0)
              .map((campaign) => ({
                id: campaign.campaignId,
                name: campaign.name,
                pending: campaign.pending,
              })),
          }
        : {}),
    } satisfies NotificationsSummary;
  });
}
