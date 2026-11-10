import type { ManagementReport } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const professional = {
  id: "p1",
  name: "Beatriz Lima",
  appointments: 11,
  completed: 10,
  noShows: 1,
  attendanceRate: 91,
};

function report(withValues: boolean): ManagementReport {
  return {
    from: "2026-01-01",
    to: "2026-01-31",
    generatedAt: "2026-01-31T12:00:00.000Z",
    appointments: {
      total: 11,
      completed: 10,
      noShows: 1,
      cancelled: 0,
      attendanceRate: 91,
      byVisitType: { regular: 11, trial: 0, evaluation: 0 },
    },
    trials: { scheduled: 0, completed: 0, converted: 0, conversionRate: 0 },
    plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
    finance: { openInCents: 0, overdueInCents: 0 },
    commercial: {
      leadsCreated: 0,
      won: 0,
      lost: 0,
      conversionRate: 0,
      averageFirstResponseMinutes: 0,
    },
    byProfessional: [professional],
    byService: [{ ...professional, id: "s1", name: "Pilates individual" }],
    bySource: [],
    ...(withValues
      ? {
          teamFinance: {
            commissionMonths: ["2026-01"],
            byProfessional: [
              {
                id: "p1",
                name: "Beatriz Lima",
                completedSessions: 10,
                generatedInCents: 123400,
                commission: {
                  paidInCents: 10000,
                  openInCents: 2000,
                  pendingInCents: 340,
                  totalInCents: 12340,
                },
              },
            ],
            byService: [
              {
                id: "s1",
                name: "Pilates individual",
                completedSessions: 10,
                generatedInCents: 123400,
                averageTicketInCents: 12340,
              },
            ],
            byGroup: [
              {
                id: "g1",
                name: "Turma de segunda de manhã",
                serviceName: "Pilates em grupo",
                professionalName: "Beatriz Lima",
                capacity: 4,
                activeEnrollments: 3,
                occupancyRate: 75,
                monthlySessions: 8,
                monthlyRevenueInCents: 60000,
                potentialRevenueInCents: 80000,
                idleRevenueInCents: 20000,
              },
            ],
          },
        }
      : {}),
    profitability: {
      byService: [
        {
          id: "s1",
          name: "Pilates individual",
          completedAppointments: 10,
          revenueInCents: 99900,
          commissionsInCents: 0,
          contributionInCents: 99900,
          contributionMargin: 100,
        },
      ],
      operational: {
        groupOccupancyRate: 0,
        activeGroupSeats: 0,
        totalGroupCapacity: 0,
        waitlistCount: 0,
        lowStockCount: 0,
      },
    },
  };
}

async function openTeamTab(
  withValues: boolean,
  data: ManagementReport = report(withValues),
) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    storedUser({
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role: "owner",
    }),
  );
  vi.mocked(fetch).mockImplementation(async (input) =>
    String(input).includes("/reports/management?")
      ? ({
          ok: true,
          status: 200,
          json: async () => data,
        } as Response)
      : ({
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        } as Response),
  );
  render(
    <MemoryRouter initialEntries={["/relatorios"]}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Equipe e origens" }));
}

const money = (text: string) => text.replace(/\s/g, " ");

describe("team finance report", () => {
  it("shows generated value, monthly commission and group potential", async () => {
    await openTeamTab(true);
    const professionals = (
      await screen.findByRole("table", {
        name: "Produção e comissão por profissional no período",
      })
    ).closest("table") as HTMLElement;
    const row = within(professionals).getByRole("row", {
      name: /Beatriz Lima/,
    });
    expect(money(row.textContent ?? "")).toContain("R$ 1.234,00");
    expect(money(row.textContent ?? "")).toContain("R$ 123,40");
    // Pago e a pagar de cada profissional ficam no Financeiro.
    expect(money(row.textContent ?? "")).not.toContain("a pagar");
    expect(screen.getByText("Comissão de jan. de 2026.")).toBeInTheDocument();
    const services = screen.getByRole("table", {
      name: "Produção por serviço no período",
    });
    // O recebido por serviço fica em Rentabilidade.
    expect(money(services.textContent ?? "")).not.toContain("R$ 999,00");
    expect(
      within(services).queryByRole("columnheader", { name: "Recebido" }),
    ).not.toBeInTheDocument();
    const groups = screen.getByRole("table", {
      name: "Rendimento mensal e potencial por turma",
    });
    const group = within(groups).getByRole("row", {
      name: /Turma de segunda de manhã/,
    });
    expect(group).toHaveTextContent("3/4");
    expect(money(group.textContent ?? "")).toContain("R$ 600,00");
    expect(money(group.textContent ?? "")).toContain("R$ 800,00");
    expect(money(group.textContent ?? "")).toContain("R$ 200,00");
  });

  it("keeps only the counts when the API sends no values", async () => {
    await openTeamTab(false);
    expect(
      await screen.findByRole("table", { name: "Por profissional no período" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", {
        name: "Rendimento mensal e potencial por turma",
      }),
    ).not.toBeInTheDocument();
  });

  it("lists professionals and services from the highest revenue to the lowest", async () => {
    const data = report(true);
    const team = data.teamFinance!;
    const commission = team.byProfessional[0]!.commission;
    team.byProfessional = [
      {
        id: "p2",
        name: "Ana Souza",
        completedSessions: 2,
        generatedInCents: 20000,
        commission,
      },
      ...team.byProfessional,
    ];
    data.byProfessional = [
      ...data.byProfessional,
      { ...professional, id: "p3", name: "Zeca Agenda", completed: 0 },
    ];
    team.byService = [
      {
        id: "s2",
        name: "Avaliação",
        completedSessions: 1,
        generatedInCents: 5000,
        averageTicketInCents: 5000,
      },
      ...team.byService,
    ];
    data.profitability.byService = [
      ...data.profitability.byService,
      {
        id: "s3",
        name: "Depilação",
        completedAppointments: 0,
        revenueInCents: 3000,
        commissionsInCents: 0,
        contributionInCents: 3000,
        contributionMargin: 100,
      },
    ];
    await openTeamTab(true, data);
    const names = (table: HTMLElement) =>
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.firstChild?.textContent);
    expect(
      names(
        await screen.findByRole("table", {
          name: "Produção e comissão por profissional no período",
        }),
      ),
    ).toEqual(["Beatriz Lima", "Ana Souza", "Zeca Agenda"]);
    expect(
      names(
        screen.getByRole("table", {
          name: "Produção por serviço no período",
        }),
      ),
    ).toEqual(["Pilates individual", "Avaliação"]);
  });
});
