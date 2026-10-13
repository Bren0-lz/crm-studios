import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { relationshipSettingsFixture } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("view-only relationship", () => {
  it("keeps the congratulations link but hides 'Marcar como enviado' on the dashboard and month birthdays", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["relationship", "settings"],
        editModules: [],
      }),
    );
    const suggestion = {
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      phone: "11987654321",
      whatsapp: "11911112222",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      detail: "Aniversário hoje",
      dueDate: "2026-10-10",
      priority: 1,
    };
    const entry = {
      patientId: "88888888-8888-4888-8888-888888888888",
      patientName: "Bruno Souza",
      phone: "11955556666",
      birthDate: "1990-02-03",
      date: "2027-02-03",
      day: 3,
      ageTurning: 37,
      referenceKey: "88888888-8888-4888-8888-888888888888:2027",
      congratulated: false,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/suggestions")
        ? [suggestion]
        : url.includes("/relationship/birthdays")
          ? [entry]
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
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toBeInTheDocument();
    expect(
      within(helena).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    cleanup();

    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    const tabs = await screen.findByRole("group", { name: "Visão" });
    fireEvent.click(
      within(tabs).getByRole("button", { name: "Aniversários do mês" }),
    );
    const bruno = (await screen.findByText("Bruno Souza")).closest("article")!;
    expect(
      within(bruno).getByRole("link", { name: /Dar parabéns/ }),
    ).toBeInTheDocument();
    expect(
      within(bruno).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
});
