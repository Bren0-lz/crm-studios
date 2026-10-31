import { defaultNotificationPreferences } from "@crm/contracts";
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

/**
 * `/notifications` responde com `notifications` e as preferências com o padrão (ou
 * `preferences`); o resto da tela recebe listas vazias.
 */
function mockApi(
  notifications: () => Promise<Response> | Response,
  dashboard: object = { date: "2026-10-16", nextAppointments: [] },
  preferences: object = defaultNotificationPreferences,
) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/notifications/preferences"))
      return json(
        init?.method === "PUT" ? JSON.parse(String(init.body)) : preferences,
      );
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

describe("notification banner, alerts and settings", () => {
  const summary = {
    date: "2026-10-16",
    birthdaysToday: 2,
    overdueReceivables: 3,
    pendingFinalization: 1,
  };

  it("highlights the chosen groups in a fixed header alert without a close button", async () => {
    sessionStorage.clear();
    login();
    mockApi(() => json(summary));
    renderApp();
    const banner = await screen.findByRole("region", { name: "Alertas" });
    expect(banner).toHaveTextContent("4 pendências pedem atenção");
    // Padrão: parcelas vencidas e atendimentos a finalizar em destaque; aniversários não.
    expect(
      within(banner).getByRole("button", { name: /Parcelas vencidas/ }),
    ).toHaveTextContent("3");
    expect(banner).not.toHaveTextContent("Aniversariantes");
    expect(
      screen.getByRole("button", { name: "Notificações: 6 pendências" }),
    ).toHaveClass("is-alerting");

    fireEvent.click(
      within(banner).getByRole("button", { name: /Atendimentos a finalizar/ }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/agenda/a-finalizar",
    );

    // Fica fixo no cabeçalho, sem botão de fechar.
    const fixed = screen.getByRole("region", { name: "Alertas" });
    expect(screen.getByRole("banner")).toContainElement(fixed);
    expect(
      within(fixed).queryByRole("button", { name: "Dispensar alertas" }),
    ).not.toBeInTheDocument();
    sessionStorage.clear();
  });

  it("follows the saved preferences: hidden groups and no banner", async () => {
    sessionStorage.clear();
    login();
    mockApi(() => json(summary), undefined, {
      ...defaultNotificationPreferences,
      hiddenKinds: ["birthdays"],
      showBanner: false,
    });
    renderApp();
    expect(
      await screen.findByRole("button", { name: "Notificações: 4 pendências" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Alertas" }),
    ).not.toBeInTheDocument();
  });

  it("saves the user's settings and applies them right away", async () => {
    sessionStorage.clear();
    login();
    mockApi(() => json(summary));
    renderApp();
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações: 6 pendências" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Notificações" })).getByRole(
        "button",
        { name: "Configurar" },
      ),
    );
    const modal = await screen.findByRole("dialog", {
      name: "Configurar notificações",
    });
    // Só os grupos dos módulos do usuário (admin vê todos).
    expect(
      within(modal).getByRole("checkbox", {
        name: "Mostrar Campanhas automáticas no sino",
      }),
    ).toBeChecked();
    fireEvent.click(
      within(modal).getByRole("checkbox", {
        name: "Mostrar Parcelas vencidas no sino",
      }),
    );
    expect(
      within(modal).getByRole("checkbox", {
        name: "Destacar Parcelas vencidas no topo da tela",
      }),
    ).toBeDisabled();
    fireEvent.click(
      within(modal).getByRole("checkbox", {
        name: "Destacar Aniversariantes de hoje no topo da tela",
      }),
    );
    fireEvent.click(
      within(modal).getByRole("checkbox", {
        name: "Tocar um som quando surgir uma pendência nova",
      }),
    );
    fireEvent.change(
      within(modal).getByRole("combobox", {
        name: /Conferir novas pendências a cada/,
      }),
      { target: { value: "15" } },
    );
    fireEvent.click(
      within(modal).getByRole("button", { name: "Salvar preferências" }),
    );
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Configurar notificações" }),
      ).not.toBeInTheDocument(),
    );
    const saved = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).includes("/notifications/preferences") &&
          init?.method === "PUT",
      );
    expect(JSON.parse(String(saved?.[1]?.body))).toEqual({
      hiddenKinds: ["overdueReceivables"],
      highlightedKinds: [
        "overdueReceivables",
        "pendingFinalization",
        "overdueLeadTasks",
        "birthdays",
      ],
      showBanner: true,
      showToasts: true,
      playSound: true,
      refreshMinutes: 15,
    });
    expect(
      await screen.findByRole("button", { name: "Notificações: 3 pendências" }),
    ).toBeVisible();
    const banner = screen.getByRole("region", { name: "Alertas" });
    expect(banner).toHaveTextContent("Aniversariantes de hoje");
    expect(banner).not.toHaveTextContent("Parcelas vencidas");
  });

  it("warns on screen when a new pending item shows up", async () => {
    sessionStorage.clear();
    login();
    let overdue = 1;
    mockApi(() => json({ date: "2026-10-16", overdueReceivables: overdue }));
    renderApp();
    const bell = await screen.findByRole("button", {
      name: "Notificações: 1 pendência",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    overdue = 3;
    // Abrir o sino confere de novo.
    fireEvent.click(bell);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Nova pendência");
    expect(alert).toHaveTextContent("Parcelas vencidas: 3");
    fireEvent.click(within(alert).getByRole("button", { name: "Ver" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/financeiro");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays quiet when on-screen warnings are turned off", async () => {
    sessionStorage.clear();
    login();
    let overdue = 1;
    mockApi(
      () => json({ date: "2026-10-16", overdueReceivables: overdue }),
      undefined,
      { ...defaultNotificationPreferences, showToasts: false },
    );
    renderApp();
    const bell = await screen.findByRole("button", {
      name: "Notificações: 1 pendência",
    });
    overdue = 3;
    fireEvent.click(bell);
    expect(
      await screen.findByRole("button", { name: "Notificações: 3 pendências" }),
    ).toBeVisible();
    expect(screen.queryByText("Nova pendência")).not.toBeInTheDocument();
  });
});
