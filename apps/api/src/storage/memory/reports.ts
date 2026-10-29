import {
  type Appointment,
  type DashboardSummary,
  type ManagementReport,
  type SaleMovement,
  type SalesReport,
  type SalesPeriodReport,
  type TeamProductionSources,
  allocatePlanRevenue,
  productItemName,
  productNeedsRestock,
} from "@crm/contracts";
import { commissionAmount } from "../../modules/finance/commission-calculation.js";
import { competencesBetween } from "../../modules/reports/team-finance.js";
import { commissionCandidates } from "./commission-operations.js";
import {
  buildSalesReport,
  buildSalesPeriodReport,
  patientSalesHistory,
  withContractedHistory,
  withPatientContacts,
} from "../../modules/reports/sales-report.js";
import type { MemoryRepositoryContext } from "./context.js";
import { localDate, now, today } from "./helpers.js";

export function createReportsRepository(
  repositoryContext: MemoryRepositoryContext,
) {
  async function salesSources(clinicId: string) {
    const sales: SaleMovement[] = [];
    for (const plan of repositoryContext
      .scoped(repositoryContext.patientPlans)
      .filter((item) => item.clinicId === clinicId && !item.sourceTabId)) {
      const base = {
        sourceId: plan.id,
        sourceType: "plan" as const,
        patientId: plan.patientId,
        patientName: plan.patientName,
        itemName: `${plan.name} (${plan.serviceName})`,
        quantity: 1,
      };
      const customerDiscountInCents = repositoryContext.receivables
        .filter((item) => item.planId === plan.id)
        .reduce((sum, item) => sum + (item.customerDiscountInCents ?? 0), 0);
      sales.push({
        ...base,
        id: `${plan.id}:sale`,
        kind: "sale",
        occurredAt: plan.createdAt,
        amountInCents: plan.totalValueInCents,
        ...(customerDiscountInCents ? { customerDiscountInCents } : {}),
      });
      if (plan.cancelledAt)
        sales.push({
          ...base,
          id: `${plan.id}:cancellation`,
          kind: "cancellation",
          occurredAt: plan.cancelledAt,
          amountInCents: -(
            plan.cancelledValueInCents ?? plan.totalValueInCents
          ),
        });
    }
    for (const tab of repositoryContext
      .scoped(repositoryContext.patientTabs)
      .filter((item) => item.clinicId === clinicId && item.closedAt)) {
      const items = [
        ...tab.items.map((item) => ({
          ...item,
          sourceType: "product" as const,
        })),
        ...(tab.services ?? []).map((item) => ({
          id: item.id,
          productName: item.serviceName,
          quantity: 1,
          totalInCents: item.amountInCents,
          sourceType: "service" as const,
        })),
      ];
      for (const item of items) {
        const base = {
          sourceId: tab.id,
          sourceType: item.sourceType,
          patientId: tab.patientId,
          patientName: tab.patientName,
          itemName:
            item.sourceType === "product"
              ? productItemName(item)
              : item.productName,
          quantity: item.quantity,
          ...(tab.receivableId ? { receivableId: tab.receivableId } : {}),
        };
        sales.push({
          ...base,
          id: `${item.id}:sale`,
          kind: "sale",
          occurredAt: tab.closedAt!,
          amountInCents: item.totalInCents,
        });
        if (tab.cancelledAt)
          sales.push({
            ...base,
            id: `${item.id}:cancellation`,
            kind: "cancellation",
            occurredAt: tab.cancelledAt,
            amountInCents: -item.totalInCents,
          });
      }
    }
    return {
      sales,
      payments: repositoryContext.receivedPayments(clinicId),
      appointments: repositoryContext
        .scoped(repositoryContext.appointments)
        .filter((item) => item.clinicId === clinicId),
    };
  }

  return {
    async listTeamProduction(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<TeamProductionSources> {
      const inPeriod = (value: string) => {
        const date = localDate(new Date(value));
        return date >= from && date <= to;
      };
      const consumedPlan = (
        match: (
          movement: (typeof repositoryContext.sessionMovements)[number],
        ) => boolean,
      ) =>
        repositoryContext.sessionMovements.find(
          (movement) => movement.kind === "consumption" && match(movement),
        )?.planId;
      const individual = repositoryContext
        .scoped(repositoryContext.appointments)
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.patientId &&
            item.status === "completed" &&
            inPeriod(item.startsAt),
        )
        .map((item) => {
          const planId = consumedPlan(
            (movement) => movement.appointmentId === item.id,
          );
          return {
            professionalId: item.professionalId,
            professionalName: item.professionalName,
            serviceId: item.serviceId,
            serviceName: item.serviceName,
            ...(planId ? { planId } : {}),
          };
        });
      const collective = repositoryContext.groupAttendance
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            (item.status === "present" || item.outcome === "present"),
        )
        .flatMap((item) => {
          const meeting = repositoryContext.groupSessions.find(
              (entry) =>
                entry.clinicId === clinicId &&
                entry.id === item.sessionId &&
                entry.status !== "cancelled" &&
                inPeriod(entry.startsAt),
            ),
            group = repositoryContext
              .scoped(repositoryContext.groupClasses)
              .find(
                (entry) =>
                  entry.clinicId === clinicId && entry.id === meeting?.groupId,
              );
          if (!meeting || !group) return [];
          const planId = consumedPlan(
            (movement) => movement.groupAttendanceId === item.id,
          );
          return [
            {
              professionalId: meeting.professionalId,
              professionalName: meeting.professionalName,
              serviceId: group.serviceId,
              serviceName: group.serviceName,
              ...(planId ? { planId } : {}),
            },
          ];
        });
      const competences = competencesBetween(from, to);
      return {
        sessions: [...individual, ...collective],
        commissions: repositoryContext
          .scopedCommissions()
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              competences.includes(item.competence),
          )
          .map((item) => ({
            professionalId: item.professionalId,
            professionalName: item.professionalName,
            competence: item.competence,
            amountInCents: item.amountInCents,
            status: item.status,
          })),
        pendingCommissions: competences.flatMap((competence) =>
          commissionCandidates(repositoryContext, clinicId, competence)
            .filter(({ source }) =>
              repositoryContext.professionalInBranchScope(
                source.professionalId,
              ),
            )
            .map(({ source, rule, service }) => ({
              professionalId: source.professionalId,
              professionalName: source.professionalName,
              amountInCents: commissionAmount(rule, service.priceInCents),
            })),
        ),
      };
    },

    async getDashboard(
      clinicId: string,
      date: string,
      professionalIds?: readonly string[],
    ): Promise<DashboardSummary> {
      const month = date.slice(0, 7);
      const inScope = (item: { professionalId: string }) =>
        !professionalIds || professionalIds.includes(item.professionalId);
      const appointmentsToday = repositoryContext
        .scoped(repositoryContext.appointments)
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            inScope(item) &&
            localDate(new Date(item.startsAt)) === date,
        );
      return {
        date,
        appointmentsToday: appointmentsToday.length,
        nonCancelledAppointmentsToday: appointmentsToday.filter(
          (item) => item.status !== "cancelled",
        ).length,
        pendingToday: appointmentsToday.filter(
          (item) => item.status === "scheduled" || item.status === "confirmed",
        ).length,
        awaitingConfirmationToday: appointmentsToday.filter(
          (item) => item.status === "scheduled",
        ).length,
        completedToday: appointmentsToday.filter(
          (item) => item.status === "completed",
        ).length,
        patientsActive: repositoryContext.patients.filter(
          (item) => item.clinicId === clinicId && item.status === "active",
        ).length,
        noShowsThisMonth: repositoryContext
          .scoped(repositoryContext.appointments)
          .filter(
            (item) =>
              item.clinicId === clinicId &&
              inScope(item) &&
              item.startsAt.startsWith(month) &&
              item.status === "no_show",
          ).length,
        nextAppointments: appointmentsToday
          .filter(
            (item) =>
              item.status === "scheduled" || item.status === "confirmed",
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 5),
      };
    },

    async getSalesReport(
      clinicId: string,
      month: string,
    ): Promise<SalesReport> {
      const data = await salesSources(clinicId);
      return buildSalesReport(
        month,
        data.sales,
        data.payments,
        data.appointments,
      );
    },
    async getSalesPeriodReport(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<SalesPeriodReport> {
      const data = await salesSources(clinicId);
      return withPatientContacts(
        withContractedHistory(
          buildSalesPeriodReport(
            from,
            to,
            data.sales,
            data.payments,
            data.appointments,
          ),
          data.sales,
        ),
        new Map(
          repositoryContext.patients
            .filter((item) => item.clinicId === clinicId)
            .map((item) => [
              item.id,
              { phone: item.phone, whatsapp: item.whatsapp },
            ]),
        ),
      );
    },
    async listPatientSales(
      clinicId: string,
      patientId: string,
    ): Promise<SaleMovement[] | null> {
      const exists = repositoryContext.patients.some(
        (item) => item.clinicId === clinicId && item.id === patientId,
      );
      if (!exists) return null;
      const data = await salesSources(clinicId);
      return patientSalesHistory(data.sales, patientId);
    },

    async getManagementReport(
      clinicId: string,
      from: string,
      to: string,
    ): Promise<ManagementReport> {
      const appointments = repositoryContext
        .scoped(repositoryContext.appointments)
        .filter((item) => {
          const date = localDate(new Date(item.startsAt));
          return item.clinicId === clinicId && date >= from && date <= to;
        });
      const attendance = (completed: number, noShows: number) => {
        const decided = completed + noShows;
        return decided ? Math.round((completed / decided) * 100) : 0;
      };
      const breakdown = (
        entries: Array<{ id: string; name: string }>,
        idOf: (appointment: Appointment) => string,
      ) =>
        entries
          .map((entry) => {
            const items = appointments.filter(
              (item) => idOf(item) === entry.id,
            );
            const completed = items.filter(
              (item) => item.status === "completed",
            ).length;
            const noShows = items.filter(
              (item) => item.status === "no_show",
            ).length;
            return {
              ...entry,
              appointments: items.length,
              completed,
              noShows,
              attendanceRate: attendance(completed, noShows),
            };
          })
          .filter((item) => item.appointments > 0)
          .sort((a, b) => b.appointments - a.appointments);
      const leads = repositoryContext
        .scoped(repositoryContext.leads)
        .filter((item) => {
          const date = localDate(new Date(item.createdAt));
          return item.clinicId === clinicId && date >= from && date <= to;
        });
      const sources = [...new Set(leads.map((item) => item.source))];
      const bySource = sources
        .map((source) => {
          const items = leads.filter((item) => item.source === source);
          const won = items.filter((item) => item.stage === "won").length;
          const lost = items.filter((item) => item.stage === "lost").length;
          return {
            source,
            leads: items.length,
            won,
            lost,
            conversionRate: items.length
              ? Math.round((won / items.length) * 100)
              : 0,
          };
        })
        .sort((a, b) => b.leads - a.leads);
      const completed = appointments.filter(
        (item) => item.status === "completed",
      ).length;
      const noShows = appointments.filter(
        (item) => item.status === "no_show",
      ).length;
      const openReceivables = repositoryContext
        .scoped(repositoryContext.receivables)
        .filter((item) => item.clinicId === clinicId && item.status === "open");
      const paidInPeriod = repositoryContext
        .scoped(repositoryContext.receivables)
        .filter((item) => {
          if (
            item.clinicId !== clinicId ||
            item.status !== "paid" ||
            !item.paidAt
          )
            return false;
          const date = localDate(new Date(item.paidAt));
          return date >= from && date <= to;
        });
      const planMovements = repositoryContext.sessionMovements.filter(
        (item) => {
          const plan = repositoryContext
            .scoped(repositoryContext.patientPlans)
            .find(
              (candidate) =>
                candidate.id === item.planId && candidate.clinicId === clinicId,
            );
          const date = localDate(new Date(item.createdAt));
          return plan && item.kind !== "credit" && date >= from && date <= to;
        },
      );
      const netMovement = planMovements.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const activePlans = repositoryContext
        .scoped(repositoryContext.patientPlans)
        .filter(
          (item) => item.clinicId === clinicId && item.status === "active",
        );
      const won = leads.filter((item) => item.stage === "won").length;
      const lost = leads.filter((item) => item.stage === "lost").length;
      const responseTimes = leads
        .map((lead) => {
          const first = repositoryContext.leadContacts
            .filter(
              (contact) =>
                contact.leadId === lead.id && contact.direction !== "internal",
            )
            .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
          return first
            ? Math.max(
                0,
                (new Date(first.occurredAt).getTime() -
                  new Date(lead.createdAt).getTime()) /
                  60_000,
              )
            : null;
        })
        .filter((value): value is number => value !== null);
      const inPeriod = (value?: string) => {
        if (!value) return false;
        const date = localDate(new Date(value));
        return date >= from && date <= to;
      };
      const paidProductTabs = repositoryContext
        .scoped(repositoryContext.patientTabs)
        .filter((tab) => {
          if (tab.clinicId !== clinicId || tab.status !== "closed")
            return false;
          const receivable = repositoryContext
            .scoped(repositoryContext.receivables)
            .find(
              (item) => item.id === tab.receivableId && item.status === "paid",
            );
          return inPeriod(receivable?.paidAt);
        });
      const productReceivableIds = new Set(
        paidProductTabs.flatMap((item) =>
          item.receivableId ? [item.receivableId] : [],
        ),
      );
      const productRevenueInCents = paidProductTabs.reduce(
        (sum, item) => sum + item.totalInCents,
        0,
      );
      const productCostInCents = paidProductTabs.reduce(
        (sum, tab) =>
          sum +
          tab.items.reduce(
            (itemSum, item) => itemSum + item.quantity * item.unitCostInCents,
            0,
          ),
        0,
      );
      const serviceRevenueInCents = paidInPeriod
        .filter((item) => !productReceivableIds.has(item.id))
        .reduce((sum, item) => sum + item.amountInCents, 0);
      const operatingExpensesInCents = repositoryContext
        .scoped(repositoryContext.payables)
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.status === "paid" &&
            inPeriod(item.paidAt),
        )
        .reduce((sum, item) => sum + item.amountInCents, 0);
      const paidCommissions = repositoryContext
        .scopedCommissions()
        .filter(
          (item) =>
            item.clinicId === clinicId &&
            item.status === "paid" &&
            inPeriod(item.paidAt),
        );
      const commissionsInCents = paidCommissions.reduce(
        (sum, item) => sum + item.amountInCents,
        0,
      );
      const grossRevenueInCents = serviceRevenueInCents + productRevenueInCents;
      const grossProfitInCents = grossRevenueInCents - productCostInCents;
      const netResultInCents =
        grossProfitInCents - operatingExpensesInCents - commissionsInCents;
      const percentage = (part: number, total: number) =>
        total ? Math.round((part / total) * 1000) / 10 : 0;
      const byProduct = repositoryContext
        .scoped(repositoryContext.products)
        .filter((product) => product.clinicId === clinicId)
        .map((product) => {
          const soldItems = paidProductTabs.flatMap((tab) =>
            tab.items.filter((item) => item.productId === product.id),
          );
          const unitsSold = soldItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const revenueInCents = soldItems.reduce(
            (sum, item) => sum + item.totalInCents,
            0,
          );
          const costInCents = soldItems.reduce(
            (sum, item) => sum + item.quantity * item.unitCostInCents,
            0,
          );
          const grossProfitInCents = revenueInCents - costInCents;
          return {
            id: product.id,
            name: product.name,
            unitsSold,
            revenueInCents,
            costInCents,
            grossProfitInCents,
            grossMargin: percentage(grossProfitInCents, revenueInCents),
          };
        })
        .filter((item) => item.unitsSold > 0)
        .sort((a, b) => b.revenueInCents - a.revenueInCents);
      const serviceRevenue = new Map<string, number>();
      for (const plan of repositoryContext
        .scoped(repositoryContext.patientPlans)
        .filter((item) => item.clinicId === clinicId)) {
        const received = paidInPeriod
          .filter((item) => item.planId === plan.id)
          .reduce((sum, item) => sum + item.amountInCents, 0);
        const shares = allocatePlanRevenue(received, plan.services);
        plan.services.forEach((entry, index) =>
          serviceRevenue.set(
            entry.serviceId,
            (serviceRevenue.get(entry.serviceId) ?? 0) + shares[index]!,
          ),
        );
      }
      const byServiceProfitability = repositoryContext.services
        .filter((service) => service.clinicId === clinicId)
        .map((service) => {
          const revenueInCents = serviceRevenue.get(service.id) ?? 0;
          const completedAppointments = appointments.filter(
            (item) =>
              item.serviceId === service.id && item.status === "completed",
          ).length;
          const serviceCommissions = paidCommissions
            .filter((commission) => {
              const appointment = repositoryContext
                .scoped(repositoryContext.appointments)
                .find((item) => item.id === commission.appointmentId);
              return appointment?.serviceId === service.id;
            })
            .reduce((sum, item) => sum + item.amountInCents, 0);
          const contributionInCents = revenueInCents - serviceCommissions;
          return {
            id: service.id,
            name: service.name,
            completedAppointments,
            revenueInCents,
            commissionsInCents: serviceCommissions,
            contributionInCents,
            contributionMargin: percentage(contributionInCents, revenueInCents),
          };
        })
        .filter(
          (item) => item.completedAppointments > 0 || item.revenueInCents > 0,
        )
        .sort((a, b) => b.revenueInCents - a.revenueInCents);
      const groups = repositoryContext
        .scoped(repositoryContext.groupClasses)
        .filter((item) => item.clinicId === clinicId && item.active);
      const activeGroupSeats = groups.reduce(
        (sum, item) => sum + item.activeEnrollments,
        0,
      );
      const totalGroupCapacity = groups.reduce(
        (sum, item) => sum + item.capacity,
        0,
      );
      const trialAppointments = appointments.filter(
        (item) =>
          (item.visitType === "trial" || item.visitType === "evaluation") &&
          item.status !== "cancelled",
      );
      const completedTrials = trialAppointments.filter(
        (item) => item.status === "completed",
      );
      const convertedTrials = completedTrials.filter((item) => {
        if (!item.patientId) return false;
        const start = new Date(item.startsAt).getTime();
        const limit = start + 30 * 24 * 60 * 60 * 1000;
        return repositoryContext
          .scoped(repositoryContext.patientPlans)
          .some((plan) => {
            if (plan.clinicId !== clinicId || plan.patientId !== item.patientId)
              return false;
            const createdAt = new Date(plan.createdAt).getTime();
            return createdAt >= start && createdAt <= limit;
          });
      }).length;
      return {
        from,
        to,
        generatedAt: now(),
        appointments: {
          total: appointments.length,
          completed,
          noShows,
          cancelled: appointments.filter((item) => item.status === "cancelled")
            .length,
          attendanceRate: attendance(completed, noShows),
          byVisitType: {
            regular: appointments.filter((item) => item.visitType === "regular")
              .length,
            trial: appointments.filter((item) => item.visitType === "trial")
              .length,
            evaluation: appointments.filter(
              (item) => item.visitType === "evaluation",
            ).length,
          },
        },
        trials: {
          scheduled: trialAppointments.length,
          completed: completedTrials.length,
          converted: convertedTrials,
          conversionRate: completedTrials.length
            ? Math.round((convertedTrials / completedTrials.length) * 100)
            : 0,
        },
        plans: {
          active: activePlans.length,
          availableSessions: activePlans.reduce(
            (sum, item) => sum + item.remainingSessions,
            0,
          ),
          consumedInPeriod: Math.max(0, -netMovement),
        },
        finance: {
          openInCents: openReceivables.reduce(
            (sum, item) => sum + item.amountInCents,
            0,
          ),
          overdueInCents: openReceivables
            .filter((item) => item.dueDate < today())
            .reduce((sum, item) => sum + item.amountInCents, 0),
          paidInPeriodInCents: repositoryContext.receiptEvents
            .filter((event) => {
              const receivable = repositoryContext
                .scoped(repositoryContext.receivables)
                .find((item) => item.id === event.receivableId);
              return (
                receivable?.clinicId === clinicId && inPeriod(event.occurredAt)
              );
            })
            .reduce((sum, event) => sum + event.amountInCents, 0),
        },
        commercial: {
          leadsCreated: leads.length,
          won,
          lost,
          conversionRate: leads.length
            ? Math.round((won / leads.length) * 100)
            : 0,
          averageFirstResponseMinutes: responseTimes.length
            ? Math.round(
                responseTimes.reduce((sum, value) => sum + value, 0) /
                  responseTimes.length,
              )
            : 0,
        },
        byProfessional: breakdown(
          repositoryContext
            .scoped(repositoryContext.professionals)
            .map((item) => ({
              id: item.id,
              name: item.fullName,
            })),
          (appointment) => appointment.professionalId,
        ),
        byService: breakdown(
          repositoryContext.services.map((item) => ({
            id: item.id,
            name: item.name,
          })),
          (appointment) => appointment.serviceId,
        ),
        bySource,
        profitability: {
          dre: {
            serviceRevenueInCents,
            productRevenueInCents,
            grossRevenueInCents,
            productCostInCents,
            grossProfitInCents,
            operatingExpensesInCents,
            commissionsInCents,
            netResultInCents,
            netMargin: percentage(netResultInCents, grossRevenueInCents),
          },
          byService: byServiceProfitability,
          byProduct,
          operational: {
            groupOccupancyRate: percentage(
              activeGroupSeats,
              totalGroupCapacity,
            ),
            activeGroupSeats,
            totalGroupCapacity,
            waitlistCount: groups.reduce(
              (sum, item) => sum + item.waitlistCount,
              0,
            ),
            lowStockCount: repositoryContext
              .scoped(repositoryContext.products)
              .filter(
                (item) =>
                  item.clinicId === clinicId &&
                  productNeedsRestock(item.currentStock, item.restockAlertAt),
              ).length,
            productUnitsSold: byProduct.reduce(
              (sum, item) => sum + item.unitsSold,
              0,
            ),
            averageReceiptInCents: paidInPeriod.length
              ? Math.round(
                  paidInPeriod.reduce(
                    (sum, item) => sum + item.amountInCents,
                    0,
                  ) / paidInPeriod.length,
                )
              : 0,
          },
        },
      };
    },
  };
}
