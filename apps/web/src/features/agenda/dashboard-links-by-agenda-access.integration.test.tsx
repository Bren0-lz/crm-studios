import type { DashboardViewSummary } from "@crm/contracts";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import "../../test-support/legacy-setup";

describe("dashboard links by agenda access", () => {
  const dashboard = {
    date: "2026-10-12",
    appointmentsToday: 0,
    completedToday: 0,
    patientsActive: 3,
    noShowsThisMonth: 0,
    nextAppointments: [],
  };
  function renderDashboard(
    modules: string[],
    editModules: string[],
    summary: DashboardViewSummary = dashboard,
  ) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules,
        editModules,
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/dashboard") ? summary : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("shows an empty day without claiming the agenda was completed", async () => {
    renderDashboard(["agenda"], []);
    expect(
      await screen.findByText("Nenhum atendimento hoje"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Não há atendimentos agendados para hoje."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agenda concluída")).not.toBeInTheDocument();
  });

  it("shows a completed agenda when today's appointments have been resolved", async () => {
    renderDashboard(["agenda"], [], {
      ...dashboard,
      appointmentsToday: 1,
      completedToday: 1,
    });
    expect(await screen.findByText("Agenda concluída")).toBeInTheDocument();
    expect(
      screen.getByText("Não há atendimentos pendentes hoje."),
    ).toBeInTheDocument();
  });

  it("keeps an overdue pending appointment visible on today's agenda", async () => {
    renderDashboard(["agenda"], [], {
      ...dashboard,
      appointmentsToday: 1,
      nextAppointments: [
        {
          id: "a1",
          clinicId: "clinic",
          patientId: "patient",
          professionalId: "professional",
          roomId: "room",
          serviceId: "service",
          visitType: "regular",
          patientName: "Bruno Souza",
          serviceName: "Pilates",
          professionalName: "Carla",
          professionalColor: "#26705f",
          roomName: "Sala 1",
          status: "scheduled",
          startsAt: "2000-10-12T13:00:00.000Z",
          endsAt: "2000-10-12T14:00:00.000Z",
          createdAt: "2000-10-01T12:00:00.000Z",
          updatedAt: "2000-10-01T12:00:00.000Z",
        },
      ],
    });
    expect(await screen.findByText("Bruno Souza")).toBeInTheDocument();
    expect(screen.getByText("Agendado")).toBeInTheDocument();
    expect(screen.queryByText("Agenda concluída")).not.toBeInTheDocument();
  });

  it("shows 'Ver agenda' but not 'Novo atendimento' when the agenda is view-only", async () => {
    renderDashboard(["agenda"], []);
    expect(
      await screen.findByRole("heading", { name: "Agenda de hoje" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver agenda/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
  });

  it("shows neither agenda link without the agenda module", async () => {
    renderDashboard(["patients"], ["patients"]);
    expect(
      await screen.findByRole("heading", { name: "Agenda de hoje" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ver agenda/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps both agenda links for users who edit the agenda", async () => {
    renderDashboard(["agenda"], ["agenda"]);
    expect(
      await screen.findByRole("link", { name: /Ver agenda/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Novo atendimento/ }),
    ).toBeInTheDocument();
  });
});
