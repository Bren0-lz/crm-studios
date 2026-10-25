import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";

function login(access?: { modules: string[] }) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    access
      ? JSON.stringify({
          id: "55555555-5555-4555-8555-555555555555",
          fullName: "Carla Consulta",
          email: "carla@movimenta.local",
          role: "user",
          modules: access.modules,
          editModules: [],
        })
      : storedUser({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Aryana Dutra",
          email: "admin@movimenta.local",
          role: "owner",
        }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

/** `/notifications` responde com `notifications`; o resto da tela recebe listas vazias. */
function mockApi(
  notifications: () => Promise<Response> | Response,
  dashboard: object = { date: "2026-10-16", nextAppointments: [] },
) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/notifications")) return notifications();
    return {
      ok: true,
      status: 200,
      json: async () => (url.includes("/dashboard?") ? dashboard : []),
    } as Response;
  });
}

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function renderApp(initialEntry = "/agenda") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("header menus", () => {
  it("shows fixed expenses within the reminder window and opens accounts payable", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/notifications"))
        return json({ date: "2026-10-16", fixedExpensesDue: 2 });
      if (url.includes("/finance/workspace"))
        return json({
          summary: {
            openInCents: 0,
            overdueInCents: 0,
            paidThisMonthInCents: 0,
            receivables: [],
          },
          categories: [],
          costCenters: [],
          payables: [],
          payableOpenInCents: 0,
          payableOverdueInCents: 0,
          paidExpensesThisMonthInCents: 0,
          cashBalanceThisMonthInCents: 0,
          commissionRules: [],
          commissions: [],
          commissionOpenInCents: 0,
          paidCommissionsThisMonthInCents: 0,
        });
      return json(
        url.includes("/dashboard?")
          ? { date: "2026-10-16", nextAppointments: [] }
          : [],
      );
    });
    renderApp();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Notificações: 2 pendências",
      }),
    );
    const item = within(
      screen.getByRole("dialog", { name: "Notificações" }),
    ).getByRole("button", { name: /Despesas fixas a vencer/ });
    expect(item).toHaveTextContent("2");
    fireEvent.click(item);
    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/financeiro",
    );
    expect(
      await screen.findByRole("button", { name: /^Contas a pagar/ }),
    ).toHaveClass("active");
  });

  it("opens notifications with an empty state and closes with Esc", async () => {
    login();
    mockApi(() =>
      json({
        date: "2026-10-16",
        birthdaysToday: 0,
        overdueReceivables: 0,
        pendingFinalization: 0,
      }),
    );
    renderApp();
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(await within(panel).findByText("Nada pendente.")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Notificações" }),
    ).not.toBeInTheDocument();
  });

  it("shows birthdays, overdue installments and appointments to finalize with counts and links", async () => {
    login();
    mockApi(() =>
      json({
        date: "2026-10-16",
        birthdaysToday: 2,
        overdueReceivables: 3,
        pendingFinalization: 1,
      }),
    );
    renderApp();
    // Contador no ícone: soma dos grupos.
    const bell = await screen.findByRole("button", {
      name: "Notificações: 6 pendências",
    });
    expect(bell).toHaveTextContent("6");
    fireEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    const birthdays = within(panel).getByRole("button", {
      name: /Aniversariantes de hoje/,
    });
    expect(birthdays).toHaveTextContent("2");
    const overdue = within(panel).getByRole("button", {
      name: /Parcelas vencidas/,
    });
    expect(overdue).toHaveTextContent("3");
    const pending = within(panel).getByRole("button", {
      name: /Atendimentos a finalizar/,
    });
    expect(pending).toHaveTextContent("1");

    fireEvent.click(pending);
    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/agenda/a-finalizar",
    );
    expect(
      screen.queryByRole("dialog", { name: "Notificações" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByRole(
        "button",
        { name: /Parcelas vencidas/ },
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/financeiro");

    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByRole(
        "button",
        { name: /Aniversariantes de hoje/ },
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/relacionamento");
  });

  it("shows a skeleton while the notifications load", async () => {
    login();
    mockApi(() => new Promise<Response>(() => undefined));
    renderApp();
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      within(panel).getByRole("status", { name: "Carregando notificações" }),
    ).toBeVisible();
    expect(within(panel).queryByText("Nada pendente.")).not.toBeInTheDocument();
  });

  it("reports a loading error and retries", async () => {
    login();
    let calls = 0;
    mockApi(() => {
      calls += 1;
      return calls <= 2
        ? json({ code: "FAIL", message: "Falha" }, 500)
        : json({ date: "2026-10-16", pendingFinalization: 4 });
    });
    renderApp();
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      await within(panel).findByText(
        "Não foi possível carregar as notificações.",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await within(panel).findByRole("button", {
        name: /Atendimentos a finalizar/,
      }),
    ).toHaveTextContent("4");
    expect(
      within(panel).queryByText("Não foi possível carregar as notificações."),
    ).not.toBeInTheDocument();
  });

  it("reminds of scheduled callbacks: lead tasks, snoozed contacts and pause returns", async () => {
    login();
    mockApi(() =>
      json({
        date: "2026-10-16",
        birthdaysToday: 0,
        overdueReceivables: 0,
        pendingFinalization: 0,
        overdueLeadTasks: 2,
        snoozedContactsDue: 1,
        pauseReturnsDue: 3,
      }),
    );
    renderApp();
    const bell = await screen.findByRole("button", {
      name: "Notificações: 6 pendências",
    });
    fireEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      within(panel).getByRole("button", {
        name: /Contatos adiados para retomar/,
      }),
    ).toHaveTextContent("1");
    expect(
      within(panel).getByRole("button", {
        name: /Retornos de pausa previstos/,
      }),
    ).toHaveTextContent("3");
    const tasks = within(panel).getByRole("button", {
      name: /Tarefas comerciais vencidas/,
    });
    expect(tasks).toHaveTextContent("2");
    fireEvent.click(tasks);
    expect(await screen.findByTestId("location")).toHaveTextContent(
      "/comercial",
    );

    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByRole(
        "button",
        { name: /Contatos adiados para retomar/ },
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/relacionamento");

    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByRole(
        "button",
        { name: /Retornos de pausa previstos/ },
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/planos");
  });

  it("only shows the groups of the modules the user can see", async () => {
    login({ modules: ["agenda"] });
    // Mesmo que a resposta traga outros grupos, a tela mostra só o da agenda.
    mockApi(() =>
      json({
        date: "2026-10-16",
        birthdaysToday: 5,
        overdueReceivables: 7,
        pendingFinalization: 1,
        overdueLeadTasks: 4,
        snoozedContactsDue: 2,
        pauseReturnsDue: 6,
      }),
    );
    renderApp();
    const bell = await screen.findByRole("button", {
      name: "Notificações: 1 pendência",
    });
    fireEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      await within(panel).findByRole("button", {
        name: /Atendimentos a finalizar/,
      }),
    ).toBeVisible();
    expect(panel).not.toHaveTextContent("Parcelas vencidas");
    expect(panel).not.toHaveTextContent("Aniversariantes");
    expect(panel).not.toHaveTextContent("Tarefas comerciais");
    expect(panel).not.toHaveTextContent("Contatos adiados");
    expect(panel).not.toHaveTextContent("Retornos de pausa");
  });

  it("does not ask for notifications without agenda, finance or relationship", async () => {
    login({ modules: ["patients"] });
    mockApi(() => json({ date: "2026-10-16" }));
    renderApp("/clientes");
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    expect(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByText(
        "Nada pendente.",
      ),
    ).toBeVisible();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/notifications")),
    ).toBe(false);
  });

  it("keeps profile, settings and logout in the sidebar", async () => {
    login();
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    renderApp();
    const header = await screen.findByRole("banner");
    expect(
      within(header).queryByRole("button", { name: "Menu do usuário" }),
    ).not.toBeInTheDocument();
    const sidebar = screen.getByRole("complementary");
    expect(
      within(sidebar).getByRole("link", { name: "Meu perfil" }),
    ).toHaveAttribute("href", "/perfil");
    fireEvent.click(
      within(sidebar).getByRole("link", { name: "Configurações" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: /Configurações/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Sair: Aryana Dutra" }),
    );
    await vi.waitFor(() =>
      expect(localStorage.getItem("crm.auth.token")).toBeNull(),
    );
  });
});
