import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function renderDashboard(sales: Record<string, unknown>) {
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
  const date = new Date().toLocaleDateString("sv-SE");
  const response = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/reports/sales?")) return response(sales);
    if (url.includes("/dashboard"))
      return response({
        date,
        appointmentsToday: 0,
        nonCancelledAppointmentsToday: 0,
        pendingToday: 0,
        awaitingConfirmationToday: 0,
        completedToday: 0,
        patientsActive: 0,
        noShowsThisMonth: 0,
        nextAppointments: [],
      });
    return response([]);
  });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

const period = (values: Record<string, number>) => ({
  from: "2026-10-01",
  to: "2026-10-15",
  receivedInCents: 0,
  attendedPatients: 0,
  ...values,
});

describe("dashboard sales card", () => {
  it("shows net sales with refunds apart and no impossible percent", async () => {
    renderDashboard({
      current: period({
        netSalesInCents: 49000,
        grossSalesInCents: 59000,
        cancelledSalesInCents: 10000,
      }),
      previousComparable: period({
        netSalesInCents: -700000,
        grossSalesInCents: 0,
        cancelledSalesInCents: 700000,
      }),
      changeInCents: 749000,
      changePercent: null,
      patientsWithoutReturn: [],
    });
    expect(await screen.findByText("Vendido líquido")).toBeInTheDocument();
    expect(screen.getByText("R$ 490,00")).toBeInTheDocument();
    expect(
      screen.getByText("Antes dos estornos: R$ 590,00 · Estornos: R$ 100,00"),
    ).toBeInTheDocument();
    const badge = screen.getByText("Sem base de comparação · +R$ 7.490,00");
    expect(badge).toHaveClass("trend-badge", "better");
    expect(badge.textContent).not.toMatch(/%/);
  });

  it("hides the refund line when there is no refund", async () => {
    renderDashboard({
      current: period({
        netSalesInCents: 12000,
        grossSalesInCents: 12000,
        cancelledSalesInCents: 0,
      }),
      previousComparable: period({
        netSalesInCents: 10000,
        grossSalesInCents: 10000,
        cancelledSalesInCents: 0,
      }),
      changeInCents: 2000,
      changePercent: 20,
      patientsWithoutReturn: [],
    });
    expect(await screen.findByText("Vendido líquido")).toBeInTheDocument();
    expect(screen.getByText("+20% vs. mês anterior comparável")).toHaveClass(
      "better",
    );
    expect(screen.queryByText(/Antes dos estornos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Estornos:/)).not.toBeInTheDocument();
  });
});
