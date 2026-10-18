import type { Appointment, DashboardViewSummary } from "@crm/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

afterEach(() => {
  vi.useRealTimers();
});

function appointment(
  id: string,
  patientName: string,
  status: Appointment["status"],
  startsAt: Date,
): Appointment {
  return {
    id,
    clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    patientId: `${id}-patient`,
    professionalId: "p1",
    roomId: "r1",
    serviceId: "s1",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
    visitType: "regular",
    status,
    patientName,
    professionalName: "Dra. Ana Martins",
    professionalColor: "#2f7d6d",
    roomName: "Sala 1",
    serviceName: "Pilates",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
}

function signIn(modules: string[], editModules: string[]) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify({
      id: "55555555-5555-4555-8555-555555555555",
      fullName: "Rita Recepção",
      email: "rita@movimenta.local",
      role: "user",
      modules,
      editModules,
    }),
  );
}

const dashboard: DashboardViewSummary = {
  date: "2026-10-12",
  appointmentsToday: 0,
  nonCancelledAppointmentsToday: 0,
  pendingToday: 0,
  awaitingConfirmationToday: 0,
  completedToday: 0,
  noShowsThisMonth: 0,
  nextAppointments: [],
  pendingFinalization: 2,
};

describe("appointments pending finalization", () => {
  it("links the dashboard card to the list and marks the selected ones as completed", async () => {
    signIn(["agenda"], ["agenda"]);
    let pending = [
      appointment(
        "a1",
        "Paula Pendente",
        "confirmed",
        new Date("2026-10-01T13:00:00Z"),
      ),
      appointment(
        "a2",
        "Otávio Esquecido",
        "scheduled",
        new Date("2026-10-10T13:00:00Z"),
      ),
    ];
    const patches: Array<{ url: string; body: unknown }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { status: string };
        patches.push({ url, body });
        const id = url.split("/").at(-2)!;
        const updated = pending.find((item) => item.id === id)!;
        pending = pending.filter((item) => item.id !== id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...updated, status: body.status }),
        } as Response;
      }
      const body = url.includes("/dashboard")
        ? { ...dashboard, pendingFinalization: pending.length }
        : url.includes("/appointments/pending-finalization")
          ? pending
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Atendimentos a finalizar (2)",
      }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Finalizar atendimentos/ });
    expect(link).toHaveAttribute("href", "/agenda/a-finalizar");
    fireEvent.click(link);

    const list = await screen.findByRole("list", {
      name: "Atendimentos a finalizar",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByText("Pendente de finalização")).toHaveLength(
      2,
    );
    const complete = screen.getByRole("button", {
      name: "Marcar como realizados",
    });
    expect(complete).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Selecionar Paula Pendente/ }),
    );
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    fireEvent.click(complete);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar como realizados" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: /Selecionar Paula Pendente/ }),
      ).not.toBeInTheDocument(),
    );
    expect(patches).toEqual([
      {
        url: expect.stringContaining("/appointments/a1/status") as string,
        body: { status: "completed" },
      },
    ]);
    expect(
      screen.getByRole("checkbox", { name: /Selecionar Otávio Esquecido/ }),
    ).not.toBeChecked();
  });

  it("marks every selected appointment as a no-show in one action", async () => {
    signIn(["agenda"], ["agenda"]);
    let pending = [
      appointment(
        "a1",
        "Paula Pendente",
        "confirmed",
        new Date("2026-10-01T13:00:00Z"),
      ),
      appointment(
        "a2",
        "Otávio Esquecido",
        "scheduled",
        new Date("2026-10-10T13:00:00Z"),
      ),
    ];
    const patches: Array<{ url: string; body: unknown }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { status: string };
        patches.push({ url, body });
        const id = url.split("/").at(-2)!;
        const updated = pending.find((item) => item.id === id)!;
        pending = pending.filter((item) => item.id !== id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...updated, status: body.status }),
        } as Response;
      }
      const body = url.includes("/appointments/pending-finalization")
        ? pending
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda/a-finalizar"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText("Selecionar todos"));
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar falta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar falta" }),
    );
    expect(await screen.findByText("Nada a finalizar")).toBeInTheDocument();
    expect(patches.map((item) => item.body)).toEqual([
      { status: "no_show" },
      { status: "no_show" },
    ]);
  });

  it("shows the refusal for an appointment that has not started and keeps it pending (QC3)", async () => {
    signIn(["agenda"], ["agenda"]);
    let pending = [
      appointment(
        "a1",
        "Paula Pendente",
        "confirmed",
        new Date("2026-10-01T13:00:00Z"),
      ),
      appointment(
        "a2",
        "Otávio Remarcado",
        "scheduled",
        new Date("2026-10-10T13:00:00Z"),
      ),
    ];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH") {
        const id = url.split("/").at(-2)!;
        // a2 foi remarcado para o futuro por outra pessoa: a API recusa.
        if (id === "a2")
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "APPOINTMENT_NOT_STARTED",
              message: "Disponível a partir de 19/10 às 09:45.",
            }),
          } as Response;
        const updated = pending.find((item) => item.id === id)!;
        pending = pending.filter((item) => item.id !== id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...updated, status: "completed" }),
        } as Response;
      }
      const body = url.includes("/appointments/pending-finalization")
        ? pending
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda/a-finalizar"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText("Selecionar todos"));
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar como realizados" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar como realizados" }),
    );
    expect(
      await screen.findByText(
        "1 atendimento não pôde ser atualizado: Disponível a partir de 19/10 às 09:45.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Paula Pendente")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Otávio Remarcado")).toBeInTheDocument();
  });

  it("lists without batch actions for read-only agenda access", async () => {
    signIn(["agenda"], []);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments/pending-finalization")
        ? [
            appointment(
              "a1",
              "Paula Pendente",
              "confirmed",
              new Date("2026-10-01T13:00:00Z"),
            ),
          ]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda/a-finalizar"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Paula Pendente")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Marcar como realizados" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Seu acesso não permite registrar presença ou falta."),
    ).toBeInTheDocument();
  });

  it("shows the error when the list cannot be loaded", async () => {
    signIn(["agenda"], ["agenda"]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/appointments/pending-finalization"))
        return {
          ok: false,
          status: 500,
          json: async () => ({
            code: "INTERNAL",
            message: "Falha ao carregar os atendimentos.",
          }),
        } as Response;
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda/a-finalizar"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Falha ao carregar os atendimentos."),
    ).toBeInTheDocument();
  });

  it("explains that attended clients count only completed appointments", async () => {
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
    const period = {
      from: "2026-10-01",
      to: "2026-10-12",
      netSalesInCents: 0,
      receivedInCents: 0,
      attendedPatients: 3,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/dashboard")
        ? dashboard
        : url.includes("/reports/sales")
          ? {
              month: "2026-10",
              generatedAt: "2026-10-12T12:00:00.000Z",
              current: period,
              previousComparable: period,
              changeInCents: 0,
              changePercent: null,
              sales: [],
              payments: [],
              patientsWithoutReturn: [],
            }
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Ajuda: Clientes atendidos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ajuda: Sem retorno" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Conta só atendimentos marcados como realizados/),
    ).toBeInTheDocument();
  });

  it("badges past scheduled/confirmed blocks in day grid, week, month and list", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 15, 0));
    signIn(["agenda"], ["agenda"]);
    const at = (hour: number) => new Date(2026, 9, 14, hour, 0);
    const appointments = [
      appointment("a1", "Paula Pendente", "confirmed", at(10)),
      appointment("a2", "Rita Realizada", "completed", at(8)),
      appointment("a3", "Felipe Futuro", "scheduled", at(17)),
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/appointments?")
        ? appointments
        : url.includes("/professionals")
          ? [
              {
                id: "p1",
                fullName: "Dra. Ana Martins",
                color: "#2f7d6d",
                active: true,
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
    const card = (name: string) =>
      screen.getAllByRole("button", {
        name: new RegExp(`Detalhes de ${name}`),
      })[0]!;
    // O Mês mostra só os 2 primeiros eventos do dia (o futuro fica em "+1 evento").
    const check = (label: string, withFuture = true) => {
      expect(
        within(card("Paula Pendente")).getByText(label),
      ).toBeInTheDocument();
      expect(
        within(card("Rita Realizada")).queryByText(label),
      ).not.toBeInTheDocument();
      if (withFuture)
        expect(
          within(card("Felipe Futuro")).queryByText(label),
        ).not.toBeInTheDocument();
    };
    await screen.findAllByRole("button", { name: /Detalhes de Paula/ });
    check("A finalizar");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findAllByRole("button", { name: /Detalhes de Paula/ });
    check("A finalizar");
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    await screen.findAllByRole("button", { name: /Detalhes de Paula/ });
    check("A finalizar", false);
    expect(card("Paula Pendente")).toHaveAccessibleName(
      /pendente de finalização/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    await screen.findAllByRole("button", { name: /Detalhes de Paula/ });
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    await screen.findAllByRole("button", { name: /Detalhes de Paula/ });
    check("Pendente de finalização");
  });
});
