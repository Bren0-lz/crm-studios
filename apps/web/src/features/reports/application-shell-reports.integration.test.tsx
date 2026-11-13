import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("shows the NPS card on the reports page for the filtered period", async () => {
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
    const today = new Date().toLocaleDateString("sv-SE");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/satisfaction?")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        } as Response;
      }
      const body = url.includes("from=2026-01-01")
        ? {
            from: "2026-01-01",
            to: "2026-01-31",
            surveys: [],
            summary: {
              total: 0,
              promoters: 0,
              passives: 0,
              detractors: 0,
              nps: null,
            },
          }
        : {
            from: `${today.slice(0, 8)}01`,
            to: today,
            surveys: [],
            summary: {
              total: 4,
              promoters: 2,
              passives: 1,
              detractors: 1,
              nps: 25,
            },
          };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText(
        "2 de 4 respostas recomendariam o estúdio · 1 insatisfeito",
      ),
    ).toBeInTheDocument();
    const card = screen
      .getByText("Satisfação dos clientes")
      .closest("article") as HTMLElement;
    expect(within(card).getByText("Razoável")).toBeInTheDocument();
    const first = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(first?.[0])).toContain(
      `from=${today.slice(0, 8)}01&to=${today}`,
    );
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(
      await screen.findByText("Nenhuma pesquisa respondida no período"),
    ).toBeInTheDocument();
    const updated = screen
      .getByText("Satisfação dos clientes")
      .closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes("/satisfaction?from=2026-01-01&to=2026-01-31"),
        ),
    ).toBe(true);
  });

  it("shows the trials card with the conversion of the filtered period", async () => {
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
    const report = (trials: {
      scheduled: number;
      completed: number;
      converted: number;
      conversionRate: number;
    }) => ({
      from: "2026-01-01",
      to: "2026-01-31",
      generatedAt: "2026-01-31T12:00:00.000Z",
      appointments: {
        total: 0,
        completed: 0,
        noShows: 0,
        cancelled: 0,
        attendanceRate: 0,
        byVisitType: { regular: 0, trial: 0, evaluation: 0 },
      },
      trials,
      plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
      finance: { openInCents: 0, overdueInCents: 0 },
      commercial: {
        leadsCreated: 0,
        won: 0,
        lost: 0,
        conversionRate: 0,
        averageFirstResponseMinutes: 0,
      },
      byProfessional: [],
      byService: [],
      bySource: [],
      profitability: {
        byService: [],
        operational: {
          groupOccupancyRate: 0,
          activeGroupSeats: 0,
          totalGroupCapacity: 0,
          waitlistCount: 0,
          lowStockCount: 0,
        },
      },
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/management?from=2026-01-01")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            report({
              scheduled: 2,
              completed: 0,
              converted: 0,
              conversionRate: 0,
            }),
        } as Response;
      }
      if (url.includes("/reports/management?")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            report({
              scheduled: 6,
              completed: 4,
              converted: 3,
              conversionRate: 75,
            }),
        } as Response;
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText(
        "3 de 4 pessoas fecharam plano (30 dias antes ou depois) · 6 agendadas",
      ),
    ).toBeInTheDocument();
    const card = screen
      .getByText("Aulas experimentais")
      .closest("article") as HTMLElement;
    expect(within(card).getByText("75%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(
      await screen.findByText("2 agendadas · nenhuma realizada no período"),
    ).toBeInTheDocument();
    const updated = screen
      .getByText("Aulas experimentais")
      .closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
  });

  it("shows retention, rankings and age bands for the filtered period", async () => {
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
    const today = new Date().toLocaleDateString("sv-SE");
    const retention = (
      months: Array<{
        month: string;
        activeClients: number;
        newClients: number;
        lostClients: number;
        retentionRate: number | null;
        cancelledPlans: number;
        cancelledValueInCents: number;
      }>,
    ) => ({
      generatedAt: "2026-09-30T12:00:00.000Z",
      from: "2026-08-01",
      to: "2026-09-30",
      startMonth: months[0]?.month ?? "2026-01",
      endMonth: months[months.length - 1]?.month ?? "2026-01",
      months,
      totals: {
        newClients: months.reduce((sum, item) => sum + item.newClients, 0),
        lostClients: months.reduce((sum, item) => sum + item.lostClients, 0),
        cancelledPlans: months.reduce(
          (sum, item) => sum + item.cancelledPlans,
          0,
        ),
        cancelledValueInCents: months.reduce(
          (sum, item) => sum + item.cancelledValueInCents,
          0,
        ),
      },
    });
    const bands = (counts: number[]) =>
      (["0-17", "18-29", "30-44", "45-59", "60+", "unknown"] as const).map(
        (band, index) => ({
          band,
          label: [
            "0 a 17 anos",
            "18 a 29 anos",
            "30 a 44 anos",
            "45 a 59 anos",
            "60 anos ou mais",
            "Sem data de nascimento",
          ][index],
          clients: counts[index],
        }),
      );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.includes("/reports/retention?from=2026-01-01")) {
        return json(
          retention([
            {
              month: "2026-01",
              activeClients: 0,
              newClients: 0,
              lostClients: 0,
              retentionRate: null,
              cancelledPlans: 0,
              cancelledValueInCents: 0,
            },
          ]),
        );
      }
      if (url.includes("/reports/retention?")) {
        return json(
          retention([
            {
              month: "2026-08",
              activeClients: 10,
              newClients: 3,
              lostClients: 1,
              retentionRate: 0.9,
              cancelledPlans: 2,
              cancelledValueInCents: 45000,
            },
            {
              month: "2026-09",
              activeClients: 12,
              newClients: 4,
              lostClients: 2,
              retentionRate: 0.8,
              cancelledPlans: 0,
              cancelledValueInCents: 0,
            },
          ]),
        );
      }
      if (url.includes("/reports/clients?from=2026-01-01")) {
        return json({
          generatedAt: "2026-01-31T12:00:00.000Z",
          from: "2026-01-01",
          to: "2026-01-31",
          topBySessions: [],
          activeClients: 0,
          ageDistribution: bands([0, 0, 0, 0, 0, 0]),
        });
      }
      if (url.includes("/reports/clients?")) {
        return json({
          generatedAt: "2026-09-30T12:00:00.000Z",
          from: "2026-08-01",
          to: "2026-09-30",
          topBySessions: [
            {
              patientId: "p-1",
              patientName: "Helena Almeida",
              completedSessions: 12,
            },
            {
              patientId: "p-2",
              patientName: "Bruno Costa",
              completedSessions: 7,
            },
          ],
          activeClients: 4,
          ageDistribution: bands([0, 1, 2, 0, 0, 1]),
        });
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Clientes" }));
    const retentionPanel = (
      await screen.findByRole("heading", { name: "Retenção mês a mês" })
    ).closest("section") as HTMLElement;
    const august = (
      await within(retentionPanel).findByRole("rowheader", { name: "08/2026" })
    ).closest("tr") as HTMLElement;
    expect(within(august).getByText("90%")).toBeInTheDocument();
    expect(within(august).getByText(/R\$\s450,00/)).toBeInTheDocument();
    expect(
      within(retentionPanel).getByText(
        "7 novos · 3 perdidos · 2 planos cancelados",
        { exact: false },
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    const sessions = (
      await screen.findByRole("heading", { name: "Mais sessões concluídas" })
    ).closest("section") as HTMLElement;
    expect(
      await within(sessions).findByText("1. Helena Almeida"),
    ).toBeInTheDocument();
    expect(within(sessions).getByText("12 sessões")).toBeInTheDocument();
    expect(within(sessions).getByText("2. Bruno Costa")).toBeInTheDocument();
    // Receita por cliente fica em Vendas › Maiores compradores.
    expect(
      screen.queryByRole("heading", { name: "Mais recebimentos" }),
    ).not.toBeInTheDocument();
    const ages = screen
      .getByRole("heading", { name: "Faixa etária" })
      .closest("section") as HTMLElement;
    const thirties = within(ages).getByText("30 a 44 anos")
      .parentElement as HTMLElement;
    expect(within(thirties).getByText("50%")).toBeInTheDocument();
    expect(within(thirties).getByText("2")).toBeInTheDocument();
    expect(
      within(ages).getByText("Sem data de nascimento"),
    ).toBeInTheDocument();
    expect(
      within(ages).getByText("4 clientes ativos no período", { exact: false }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            `/reports/retention?from=${today.slice(0, 8)}01&to=${today}`,
          ),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            `/reports/clients?from=${today.slice(0, 8)}01&to=${today}`,
          ),
        ),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    fireEvent.click(screen.getByRole("tab", { name: "Retenção" }));
    const january = (
      await within(retentionPanel).findByRole("rowheader", { name: "01/2026" })
    ).closest("tr") as HTMLElement;
    expect(within(january).getByText("—")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    expect(
      await screen.findByText(
        "Nenhum cliente com sessão concluída no período.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum cliente ativo no período."),
    ).toBeInTheDocument();
    expect(screen.queryByText("1. Helena Almeida")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            "/reports/retention?from=2026-01-01&to=2026-01-31",
          ),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            "/reports/clients?from=2026-01-01&to=2026-01-31",
          ),
        ),
    ).toBe(true);
  });

  it("tells when the trials card could not be loaded", async () => {
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
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText("Não foi possível carregar as experimentais."),
    ).toBeInTheDocument();
  });
});
