import type { DashboardViewSummary } from "@crm/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import "../../test-support/legacy-setup";

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <output data-testid="location-state">
        {JSON.stringify(location.state)}
      </output>
    </>
  );
}

describe("Novo atendimento do Dashboard", () => {
  const dashboard: DashboardViewSummary = {
    date: "2026-10-12",
    appointmentsToday: 0,
    nonCancelledAppointmentsToday: 0,
    pendingToday: 0,
    awaitingConfirmationToday: 0,
    completedToday: 0,
    patientsActive: 3,
    noShowsThisMonth: 0,
    nextAppointments: [],
  };

  function renderApp(editModules: string[], initialEntry: string) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["agenda"],
        editModules,
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/dashboard") ? dashboard : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );
  }

  it("abre o modal na agenda com um clique e tira o parâmetro da URL", async () => {
    renderApp(["agenda"], "/");
    const link = await screen.findByRole("link", { name: /Novo atendimento/ });
    expect(link).toHaveAttribute("href", "/agenda?novo=1");
    fireEvent.click(link);
    expect(
      await screen.findByRole("dialog", { name: "Novo atendimento" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/agenda$/),
    );
    // Sem parâmetro nem estado de navegação: recarregar ou voltar não reabre o modal.
    await waitFor(() =>
      expect(screen.getByTestId("location-state")).toHaveTextContent("null"),
    );
    expect(
      screen.getByRole("dialog", { name: "Novo atendimento" }),
    ).toBeInTheDocument();
  });

  it("não abre o modal sem permissão de criar atendimento", async () => {
    renderApp([], "/agenda?novo=1");
    expect(
      await screen.findByRole("heading", { name: "Agenda" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/agenda$/),
    );
    expect(
      screen.queryByRole("dialog", { name: "Novo atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
  });
});
