import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("client record", () => {
  it("shows the summary on top and the client's plans inside the record", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      clinicId: "11111111-1111-4111-8111-111111111111",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      email: "helena@example.com",
      tags: ["VIP"],
      status: "active",
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const plan = {
      id: "p1",
      patientId: patient.id,
      name: "Pilates 2x",
      status: "active",
      remainingSessions: 5,
      totalSessions: 8,
      validFrom: "2026-01-01",
      services: [],
    };
    const next = new Date(Date.now() + 2 * 86_400_000);
    next.setHours(15, 0, 0, 0);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith(`/patients/${patient.id}`)
        ? patient
        : url.includes("/plans?patientId=")
          ? [plan]
          : url.includes("/appointments?")
            ? [
                {
                  id: "a1",
                  patientId: patient.id,
                  patientName: patient.fullName,
                  serviceName: "Pilates",
                  professionalName: "Ana Martins",
                  startsAt: next.toISOString(),
                  endsAt: next.toISOString(),
                  status: "scheduled",
                },
              ]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={[`/clientes/${patient.id}`]}>
        <App />
      </MemoryRouter>,
    );
    const overview = await screen.findByRole("region", {
      name: "Resumo do cliente",
    });
    expect(overview).toHaveTextContent("(11) 98765-4321");
    expect(overview).toHaveTextContent("helena@example.com");
    expect(overview).toHaveTextContent("VIP");
    expect(await within(overview).findByText("Pilates 2x")).toBeInTheDocument();
    expect(overview).toHaveTextContent("5 sessões restantes de 8");
    const day = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(next);
    const year =
      next.getFullYear() === new Date().getFullYear()
        ? ""
        : ` de ${next.getFullYear()}`;
    expect(
      within(overview).getByText(`${day}${year} · 15:00`),
    ).toBeInTheDocument();
    expect(overview).toHaveTextContent("Pilates · Ana Martins");
    fireEvent.click(screen.getByRole("tab", { name: "Planos" }));
    const panel = screen.getByRole("tabpanel");
    expect(await within(panel).findByText("Pilates 2x")).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Abrir em Planos" }),
    ).toHaveAttribute("href", `/planos?patientId=${patient.id}`);
  });
});
