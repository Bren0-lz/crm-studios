import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  fillAppointmentForm,
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("shows appointments in the monthly agenda and opens a selected day", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const groupStartsAt = new Date(startsAt);
    groupStartsAt.setHours(18, 0, 0, 0);
    const groupSession = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      groupId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      groupName: "Pilates Turma A",
      professionalName: "Dra. Ana Martins",
      roomName: "Estúdio 1",
      startsAt: groupStartsAt.toISOString(),
      endsAt: new Date(groupStartsAt.getTime() + 60 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?")
              ? [appointment]
              : String(input).includes("/group-sessions?")
                ? [groupSession]
                : [],
        }) as Response,
    );

    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", {
      name: /1 atendimentos, 1 aulas de turma, 0 bloqueios/,
    });
    expect(screen.getByText("Pilates Turma A")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ turmas?$/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Detalhes do atendimento" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day);
    const dayDialog = screen.getByRole("dialog");
    expect(dayDialog).toHaveTextContent("2 eventos neste dia.");
    expect(dayDialog).toHaveTextContent(
      "Pilates Turma ADra. Ana Martins · Estúdio 1",
    );
    expect(dayDialog.textContent!.indexOf("Helena Almeida")).toBeLessThan(
      dayDialog.textContent!.indexOf("Pilates Turma A"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day.closest(".month-day")!);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir dia na agenda" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Pilates Turma A" }),
    ).toHaveTextContent("Dra. Ana Martins · Estúdio 1");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(await screen.findByText("10:00–10:50")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
  });

  it("lists appointments and group classes in chronological order", async () => {
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
    const at = (hours: number) => {
      const value = new Date();
      value.setHours(hours, 0, 0, 0);
      return value;
    };
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: at(10).toISOString(),
      endsAt: at(11).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const session = (id: string, groupName: string, hours: number) => ({
      id,
      groupId: id,
      groupName,
      professionalName: "Dr. Paulo Nunes",
      roomName: "Estúdio 1",
      startsAt: at(hours).toISOString(),
      endsAt: at(hours + 1).toISOString(),
      status: "scheduled",
    });
    const sessions = [
      session("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Pilates Turma B", 18),
      session(
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "Dançaterapia Turma A",
        8,
      ),
    ];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?")
              ? [appointment]
              : String(input).includes("/group-sessions?")
                ? sessions
                : [],
        }) as Response,
    );
    const order = (container: Element) => {
      const text = container.textContent ?? "";
      return ["Dançaterapia Turma A", "Helena Almeida", "Pilates Turma B"].map(
        (name) => text.indexOf(name),
      );
    };
    const isAscending = (positions: number[]) =>
      positions.every(
        (value, index) =>
          value >= 0 && (index === 0 || value > positions[index - 1]!),
      );

    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".day-agenda")!))).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".week-agenda")!))).toBe(
      true,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const today = await screen.findByRole("button", {
      name: /1 atendimentos, 2 aulas de turma/,
    });
    const cell = today.closest(".month-day")!;
    expect(cell).toHaveTextContent("Dançaterapia Turma A");
    expect(cell.textContent!.indexOf("Dançaterapia Turma A")).toBeLessThan(
      cell.textContent!.indexOf("Helena Almeida"),
    );
    expect(cell).toHaveTextContent("+1 evento");
  });

  it("lets reception reschedule a visible appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const next = new Date(start);
    next.setHours(11, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana Martins",
      professionalColor: "#5c6f68",
      roomId: "55555555-5555-4555-8555-555555555555",
      roomName: "Sala Movimento",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 50 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PUT"
          ? { ...appointment, startsAt: next.toISOString() }
          : url.includes("/appointments?") ||
              url.includes("/appointments/options?")
            ? [appointment]
            : url.includes("/professionals")
              ? [
                  {
                    id: appointment.professionalId,
                    fullName: appointment.professionalName,
                    color: appointment.professionalColor,
                  },
                ]
              : url.includes("/rooms")
                ? [{ id: appointment.roomId, name: appointment.roomName }]
                : url.includes("/services")
                  ? [
                      {
                        id: appointment.serviceId,
                        name: appointment.serviceName,
                      },
                    ]
                  : url.includes("/patients")
                    ? [
                        {
                          id: appointment.patientId,
                          fullName: appointment.patientName,
                        },
                      ]
                    : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remarcar atendimento" }),
    );
    expect(
      screen.getByRole("heading", { name: "Reagendar atendimento" }),
    ).toBeInTheDocument();
    const reschedule = screen.getByRole("dialog", {
      name: "Reagendar atendimento",
    });
    fireEvent.click(within(reschedule).getByRole("button", { name: "Data" }));
    expect(
      await within(reschedule).findByText("Nenhum compromisso registrado."),
    ).toBeInTheDocument();
    expect(
      reschedule.querySelector('[data-date][aria-pressed="true"]'),
    ).toHaveAttribute("data-date", start.toLocaleDateString("sv-SE"));
    fireEvent.change(
      within(reschedule).getByLabelText("Horário do atendimento"),
      { target: { value: "11:00" } },
    );
    expect(within(reschedule).getByLabelText("Horário")).toHaveValue("11:00");
    fireEvent.click(
      within(reschedule).getByRole("button", { name: "Fechar calendário" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar reagendamento" }),
    );
    const updateCall = await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call).toBeDefined();
      return call;
    });
    expect(updateCall?.[0]).toContain(
      `/appointments/${appointment.id}/schedule`,
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      professionalId: appointment.professionalId,
      roomId: appointment.roomId,
      startsAt: next.toISOString(),
    });
  });

  it("hides the contracts page from physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Fisio",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Contratos" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/document")),
    ).toBe(false);
  });

  it("hides the satisfaction button when the appointment already has a survey", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/satisfaction?")
        ? {
            from: "2026-09-01",
            to: "2026-09-30",
            surveys: [
              {
                id: "s-0",
                appointmentId: appointment.id,
                patientId: appointment.patientId,
                score: 6,
              },
            ],
            summary: {
              total: 1,
              promoters: 0,
              passives: 0,
              detractors: 1,
              nps: -100,
            },
          }
        : url.includes("/appointments?") ||
            url.includes("/appointments/options?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      await screen.findByText("Satisfação registrada: nota 6"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(call?.[0])).toMatch(
      /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/,
    );
  });

  it("does not offer satisfaction on appointments that are not completed", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?")
        ? [appointment]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      screen.getByRole("button", { name: "Cancelar atendimento" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/satisfaction")),
    ).toBe(false);
  });

  it("lets the owner list, create and delete holidays in settings", async () => {
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
    const existing = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId: "11111111-1111-4111-8111-111111111111",
      date: "2026-12-25",
      name: "Natal",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    const created = {
      ...existing,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      date: "2026-11-15",
      name: "Proclamação da República",
    };
    let postBody: Record<string, unknown> | undefined;
    let duplicate = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/holidays") && init?.method === "POST") {
        if (duplicate) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "HOLIDAY_DUPLICATE",
              message: "Já existe um feriado cadastrado nesta data.",
            }),
          } as Response;
        }
        postBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes("/holidays/") && init?.method === "DELETE") {
        // 204 sem corpo: ler JSON aqui falharia, como no navegador.
        return {
          ok: true,
          status: 204,
          json: async () => {
            throw new SyntaxError("Unexpected end of JSON input");
          },
        } as unknown as Response;
      }
      const body = url.includes("/holidays")
        ? [existing]
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : url.includes("/admin/clinic-settings")
            ? null
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Feriados");
    expect(await within(section).findByText("Natal")).toBeInTheDocument();
    expect(within(section).getByText("25/12/2026")).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText("Data"), {
      target: { value: "2026-11-15" },
    });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), {
      target: { value: "Proclamação da República" },
    });
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar feriado" }),
    );
    expect(
      await within(section).findByText("Proclamação da República"),
    ).toBeInTheDocument();
    expect(postBody).toEqual({
      date: "2026-11-15",
      name: "Proclamação da República",
    });
    // Lista em ordem crescente de data e formulário limpo para o próximo cadastro.
    expect(section.textContent!.indexOf("15/11/2026")).toBeLessThan(
      section.textContent!.indexOf("25/12/2026"),
    );
    expect(within(section).getByLabelText("Nome do feriado")).toHaveValue("");

    duplicate = true;
    fireEvent.change(within(section).getByLabelText("Data"), {
      target: { value: "2026-12-25" },
    });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), {
      target: { value: "Natal de novo" },
    });
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar feriado" }),
    );
    expect(
      await within(section).findByText(
        "Já existe um feriado cadastrado nesta data.",
      ),
    ).toBeInTheDocument();

    // Excluir pede confirmação num modal próprio (antes era window.confirm); Voltar não exclui.
    fireEvent.click(
      within(section).getByRole("button", { name: "Excluir feriado Natal" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Excluir feriado" });
    expect(within(dialog).getByText("Natal · 25/12/2026")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A agenda volta a aceitar atendimentos em 25/12/2026.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(
      within(section).getByRole("button", { name: "Excluir feriado Natal" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir feriado" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(within(section).queryByText("Natal")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "DELETE");
    expect(deleteCall?.[0]).toContain(`/holidays/${existing.id}`);
    expect(
      within(section).getByText("Proclamação da República"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no holidays", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : url.includes("/admin/clinic-settings")
          ? null
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Feriados");
    expect(
      await within(section).findByText("Nenhum feriado cadastrado"),
    ).toBeInTheDocument();
  });

  it("does not show the holidays section to reception", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Prazos e mensagens");
    expect(
      screen.queryByRole("heading", { name: "Feriados" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/holidays")),
    ).toBe(false);
  });

  it("marks holidays in the day, week and month agenda and shows the API error when booking on one", async () => {
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
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const holiday = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId: "11111111-1111-4111-8111-111111111111",
      date: today,
      name: "Aniversário da cidade",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    const message =
      "Não é possível agendar em 01/01/2027: é feriado (Aniversário da cidade).";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: "HOLIDAY", message }),
        } as Response;
      }
      const body = url.includes("/holidays")
        ? [holiday]
        : url.includes("/professionals")
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                fullName: "Dra. Ana Martins",
                color: "#5c6f68",
              },
            ]
          : url.includes("/rooms")
            ? [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Sala Movimento",
                },
              ]
            : url.includes("/services")
              ? [
                  {
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Fisioterapia individual",
                    priceInCents: 12000,
                  },
                ]
              : url.includes("/patients")
                ? [
                    {
                      id: "99999999-9999-4999-8999-999999999999",
                      fullName: "Helena Almeida",
                    },
                  ]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );

    // Dia: aviso com o nome, mesmo sem atendimentos.
    expect(
      await screen.findByText("Feriado: Aniversário da cidade"),
    ).toBeInTheDocument();
    const holidayCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/holidays"));
    expect(String(holidayCall?.[0])).toContain(
      `/holidays?from=${today}&to=${today}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() =>
      expect(container.querySelector(".week-agenda")).toHaveTextContent(
        "Feriado: Aniversário da cidade",
      ),
    );
    expect(
      container.querySelectorAll(".week-agenda .week-holiday"),
    ).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", {
      name: /feriado: Aniversário da cidade/,
    });
    expect(day.closest(".month-day")).toHaveTextContent(
      "Aniversário da cidade",
    );
    expect(
      container.querySelectorAll(".month-grid .month-holiday"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    fillAppointmentForm(
      screen.getByRole("dialog", { name: "Novo atendimento" }),
      "Helena Almeida",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar atendimento" }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Novo atendimento" }),
    ).toBeInTheDocument();
  });

  it("shows the emergency contact highlighted in the appointment details without an SOS button", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const patient = {
      id: appointment.patientId,
      fullName: "Helena Almeida",
      recordNumber: "PAC-00001",
      phone: "11987654321",
      emergencyContactName: "Maria Souza (mãe)",
      emergencyContactPhone: "11955556666",
      status: "active",
      tags: [],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body =
        url.includes("/appointments?") || url.includes("/appointments/options?")
          ? [appointment]
          : url.includes("/patients")
            ? [patient]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes do atendimento",
    });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
    const contact = within(dialog).getByText(
      "Maria Souza (mãe) · (11) 95555-6666",
    );
    expect(contact.closest(".emergency-contact")).toHaveTextContent(
      "Contato de emergência",
    );
  });

  it("sends the chosen visit type when booking a new appointment", async () => {
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
    let posted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return {
          ok: false,
          status: 409,
          json: async () => ({
            code: "APPOINTMENT_CONFLICT",
            message: "Horário ocupado.",
          }),
        } as Response;
      }
      const body = url.includes("/professionals")
        ? [
            {
              id: "33333333-3333-4333-8333-333333333333",
              fullName: "Dra. Ana Martins",
              color: "#5c6f68",
            },
          ]
        : url.includes("/rooms")
          ? [
              {
                id: "55555555-5555-4555-8555-555555555555",
                name: "Sala Movimento",
              },
            ]
          : url.includes("/services")
            ? [
                {
                  id: "77777777-7777-4777-8777-777777777777",
                  name: "Fisioterapia individual",
                  priceInCents: 12000,
                },
              ]
            : url.includes("/patients")
              ? [
                  {
                    id: "99999999-9999-4999-8999-999999999999",
                    fullName: "Helena Almeida",
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Dia disponível");
    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    const type = screen.getByLabelText("Tipo");
    expect(type).toHaveValue("");
    expect(
      within(type)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Selecione", "Atendimento", "Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    fillAppointmentForm(dialog, "Helena Almeida");
    fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    const chosenDate = dialog.querySelector<HTMLButtonElement>(
      '[data-date][aria-pressed="true"]',
    )!.dataset.date!;
    fireEvent.change(within(dialog).getByLabelText("Horário do atendimento"), {
      target: { value: "14:30" },
    });
    expect(within(dialog).getByLabelText("Horário")).toHaveValue("14:30");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar calendário" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar atendimento" }),
    );
    expect(await screen.findByText("Horário ocupado.")).toBeInTheDocument();
    expect(posted).toMatchObject({
      patientId: "99999999-9999-4999-8999-999999999999",
      visitType: "evaluation",
      startsAt: new Date(`${chosenDate}T14:30`).toISOString(),
    });
  });
});
