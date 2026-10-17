import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";

function login() {
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
}

describe("header menus", () => {
  it("opens notifications with an empty state and closes with Esc", async () => {
    login();
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/dashboard?")
              ? { date: "2026-10-16", nextAppointments: [] }
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(
      await within(panel).findByText("Nenhuma notificação."),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Notificações" }),
    ).not.toBeInTheDocument();
  });

  it("lists today's pending appointments as notifications", async () => {
    login();
    const startsAt = new Date();
    startsAt.setHours(15, 0, 0, 0);
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/dashboard?")
              ? {
                  date: "2026-10-16",
                  nextAppointments: [
                    {
                      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                      patientName: "Helena Almeida",
                      serviceName: "Pilates",
                      startsAt: startsAt.toISOString(),
                      endsAt: startsAt.toISOString(),
                      status: "scheduled",
                    },
                  ],
                }
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Notificações" }),
    );
    const panel = screen.getByRole("dialog", { name: "Notificações" });
    expect(await within(panel).findByText("Helena Almeida")).toBeVisible();
    expect(panel).toHaveTextContent("Pendente hoje às 15:00 · Pilates");
  });

  it("opens the user menu with profile data, settings and logout", async () => {
    login();
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Menu do usuário" }),
    );
    const panel = screen.getByRole("dialog", { name: "Menu do usuário" });
    expect(panel).toHaveTextContent("admin@movimenta.local");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Configurações" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: /Configurações/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Menu do usuário" })).getByRole(
        "button",
        { name: "Sair" },
      ),
    );
    await vi.waitFor(() =>
      expect(localStorage.getItem("crm.auth.token")).toBeNull(),
    );
  });
});
