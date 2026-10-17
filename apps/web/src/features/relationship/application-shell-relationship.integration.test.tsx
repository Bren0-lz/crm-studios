import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("lists suggested contacts, opens WhatsApp and records a contact", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const suggestions = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        reason: "plan_expiring",
        referenceKey: "plan-1:2026-10-05",
        detail: "Plano termina em 3 dias",
        dueDate: "2026-10-05",
        priority: 2,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        reason: "single_no_return",
        referenceKey: "appt-9",
        detail: "Veio uma vez há 70 dias e não voltou",
        priority: 5,
      },
    ];
    const settings = {
      birthdayDaysAhead: 7,
      singleNoReturnDays: 60,
      planExpiringDays: 7,
      lowBalanceSessions: 2,
      expiredWithBalanceDays: 60,
      treatmentPausedDays: 30,
      repeatedNoShowCount: 2,
      repeatedNoShowWindowDays: 30,
      formerClientMinDays: 30,
      formerClientMaxDays: 90,
      messages: {
        birthday: "Parabéns, {{nome}}!",
        single_no_return: "Oi {{nome}}, sentimos sua falta.",
        plan_expiring: "Oi {{nome}}, seu plano está acabando.",
        low_balance: "x",
        expired_with_balance: "x",
        treatment_paused: "x",
        repeated_no_show: "x",
        former_client: "x",
        overdue_payment: "x",
        nps_detractor: "x",
      },
    };
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "a1",
            clinicId: "c1",
            actorUserId: "u1",
            createdAt: "2026-09-29T12:00:00.000Z",
            ...activityBody,
          }),
        } as Response;
      }
      const body = url.includes("/relationship/suggestions")
        ? suggestions
        : url.includes("/relationship/settings")
          ? settings
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: /Contatos sugeridos/ }),
    ).toBeInTheDocument();
    await screen.findByText("Helena Almeida");
    // A rota /relacionamento continua valendo, mas o nome visível é um só.
    expect(
      screen.getByRole("heading", { level: 1, name: "Contatos sugeridos" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".page-content")).not.toHaveTextContent(
      /relacionamento/i,
    );
    const helenaCard = (await screen.findByText("Helena Almeida")).closest(
      "article",
    )!;
    expect(
      within(helenaCard).getByText("Plano termina em 3 dias"),
    ).toBeInTheDocument();
    expect(within(helenaCard).getByText("(11) 98765-4321")).toBeInTheDocument();
    const whatsapp = within(helenaCard).getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Oi Helena, seu plano está acabando.")}`,
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveClass("whatsapp-button", "button-sm");
    expect(whatsapp.getAttribute("rel")).toMatch(/\bnoopener\b/);
    const brunoCard = screen.getByText("Bruno Souza").closest("article")!;
    expect(
      within(brunoCard).getByRole("link", { name: /WhatsApp/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511955556666?text=${encodeURIComponent("Oi Bruno, sentimos sua falta.")}`,
    );

    const filters = screen.getByRole("group", { name: "Situação" });
    expect(
      within(filters).getByRole("button", { name: /Todas\s*2/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(filters).getByRole("button", { name: /Plano acabando\s*1/ }),
    );
    expect(screen.queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(within(filters).getByRole("button", { name: /Todas/ }));

    fireEvent.click(
      within(helenaCard).getByRole("button", { name: "Registrar contato" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    expect(
      within(dialog).queryByLabelText("Adiar até"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Resultado"), {
      target: { value: "snoozed" },
    });
    fireEvent.change(within(dialog).getByLabelText("Adiar até"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Observação"), {
      target: { value: "Pediu para ligar depois" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar contato" }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText("Helena Almeida")).not.toBeInTheDocument(),
    );
    expect(activityBody).toEqual({
      patientId: suggestions[0]!.patientId,
      reason: "plan_expiring",
      referenceKey: "plan-1:2026-10-05",
      outcome: "snoozed",
      notes: "Pediu para ligar depois",
      snoozeUntil: "2099-01-10",
    });
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    expect(
      within(filters).getByRole("button", { name: /Todas\s*1/ }),
    ).toBeInTheDocument();
  });

  it("shows upcoming birthdays on the dashboard with congratulations and a sent marker", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const suggestions = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        reason: "birthday",
        referenceKey: "99999999-9999-4999-8999-999999999999:2026",
        detail: "Aniversário hoje",
        dueDate: "2026-10-10",
        priority: 1,
      },
      {
        patientId: "77777777-7777-4777-8777-777777777777",
        patientName: "Carla Dias",
        phone: "11933334444",
        reason: "birthday",
        referenceKey: "77777777-7777-4777-8777-777777777777:2026",
        detail: "Aniversário em 3 dias (13/10)",
        dueDate: "2026-10-13",
        priority: 2,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        reason: "single_no_return",
        referenceKey: "appt-9",
        detail: "Veio uma vez",
        priority: 3,
      },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "a1", ...activityBody }),
        } as Response;
      }
      const body = url.includes("/relationship/suggestions")
        ? suggestions
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : url.includes("/dashboard")
            ? {
                appointmentsToday: 0,
                completedToday: 0,
                patientsActive: 3,
                noShowsThisMonth: 0,
                nextAppointments: [],
              }
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Aniversariantes" })
    ).closest("section")!;
    await waitFor(() =>
      expect(card).toHaveTextContent("Hoje e próximos 7 dias"),
    );
    expect(
      within(card).getByRole("link", { name: "Ver contatos sugeridos" }),
    ).toHaveAttribute("href", "/relacionamento");
    expect(card).not.toHaveTextContent(/relacionamento/i);
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    expect(within(helena).getByText("Aniversário hoje")).toBeInTheDocument();
    const congratulate = within(helena).getByRole("link", {
      name: /Dar parabéns/,
    });
    expect(congratulate).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`,
    );
    expect(congratulate).toHaveAttribute("target", "_blank");
    expect(congratulate).toHaveClass("whatsapp-button", "button-sm");
    expect(congratulate.getAttribute("rel")).toMatch(/\bnoopener\b/);
    const carla = within(card)
      .getByText("Carla Dias")
      .closest(".attention-item") as HTMLElement;
    expect(
      within(carla).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511933334444?text=${encodeURIComponent("Parabéns, Carla!")}`,
    );
    expect(within(card).queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    );
    await vi.waitFor(() =>
      expect(
        within(card).queryByText("Helena Almeida"),
      ).not.toBeInTheDocument(),
    );
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      outcome: "contacted",
    });
    expect(within(card).getByText("Carla Dias")).toBeInTheDocument();
  });

  it("does not load birthdays on the dashboard for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/dashboard")
              ? {
                  appointmentsToday: 0,
                  completedToday: 0,
                  patientsActive: 3,
                  noShowsThisMonth: 0,
                  nextAppointments: [],
                }
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Atendimentos hoje")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Aniversariantes" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });

  it("lists the month's birthdays in the relationship page with a month picker", async () => {
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
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .slice(0, 7);
    const entries = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        birthDate: "1990-02-03",
        date: "2027-02-03",
        day: 3,
        ageTurning: 37,
        referenceKey: "99999999-9999-4999-8999-999999999999:2027",
        congratulated: false,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        birthDate: "2000-02-29",
        date: "2027-02-28",
        day: 28,
        ageTurning: 27,
        referenceKey: "88888888-8888-4888-8888-888888888888:2027",
        congratulated: true,
      },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "a1", ...activityBody }),
        } as Response;
      }
      const body = url.includes("/relationship/birthdays?month=2027-02")
        ? entries
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    const tabs = await screen.findByRole("group", { name: "Visão" });
    expect(
      within(tabs).getByRole("button", { name: "Contatos sugeridos" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(tabs).getByRole("button", { name: "Aniversários do mês" }),
    );
    const monthInput = await screen.findByLabelText("Mês");
    expect(monthInput).toHaveValue(currentMonth);
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) =>
            String(url).includes(
              `/relationship/birthdays?month=${currentMonth}`,
            ),
          ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Nenhum aniversariante neste mês"),
    ).toBeInTheDocument();
    fireEvent.change(monthInput, { target: { value: "2027-02" } });
    const helena = (await screen.findByText("Helena Almeida")).closest(
      "article",
    )!;
    expect(helena).toHaveTextContent("03 de fev.");
    expect(helena).toHaveTextContent("Completa 37 anos");
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`,
    );
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveClass("whatsapp-button", "button-sm");
    expect(
      within(helena)
        .getByRole("link", { name: /Dar parabéns/ })
        .getAttribute("rel"),
    ).toMatch(/\bnoopener\b/);
    const bruno = screen.getByText("Bruno Souza").closest("article")!;
    expect(bruno).toHaveTextContent("28 de fev.");
    expect(within(bruno).getByText("Parabéns enviado")).toBeInTheDocument();
    expect(
      within(bruno).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    );
    expect(
      await within(helena).findByText("Parabéns enviado"),
    ).toBeInTheDocument();
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2027",
      outcome: "contacted",
    });
  });

  it("hides suggested contacts from physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response,
    );
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: /Contatos sugeridos/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Contatos sugeridos" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });

  it("shows relationship settings read-only to reception", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const settings = relationshipSettingsFixture();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings") ? settings : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Prazos e mensagens");
    const planDays = await within(section).findByLabelText(
      "Plano acabando: avisar quantos dias antes do fim",
    );
    expect(planDays).toHaveValue(7);
    expect(planDays).toHaveAttribute("readonly");
    expect(
      within(section).getByLabelText("Mensagem: Veio uma vez"),
    ).toHaveValue("Oi {{nome}}, sentimos sua falta.");
    expect(
      within(section).getByLabelText("Mensagem: Veio uma vez"),
    ).toHaveAttribute("readonly");
    expect(
      within(section).queryByRole("button", {
        name: "Salvar prazos e mensagens",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Usuários" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/admin/")),
    ).toBe(false);
  });

  it("does not show relationship settings to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response,
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("heading", { name: "Prazos e mensagens" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });
});
