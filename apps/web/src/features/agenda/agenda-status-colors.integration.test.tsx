import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("agenda status colors", () => {
  it("colors each appointment by status with a legend in day, week, month and list", async () => {
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
    const at = (hour: number) => {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      return date;
    };
    const appointment = (
      id: string,
      patientName: string,
      status: string,
      hour: number,
    ) => ({
      id,
      patientName,
      status,
      professionalId: "p1",
      professionalColor: "#5c6f68",
      startsAt: at(hour).toISOString(),
      endsAt: new Date(at(hour).getTime() + 50 * 60_000).toISOString(),
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
    });
    const appointments = [
      appointment("a1", "Helena Almeida", "completed", 8),
      appointment("a2", "Bruno Lima", "no_show", 10),
      appointment("a3", "Carla Mendes", "confirmed", 12),
      appointment("a4", "Diego Rocha", "cancelled", 14),
    ];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?") ? appointments : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findAllByText("Helena Almeida");
    fireEvent.click(screen.getByLabelText("Mostrar cancelados"));
    const legend = screen.getByRole("list", { name: "Legenda dos status" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Agendado",
      "Confirmado",
      "Finalizado",
      "Falta ou ausência",
      "Cancelado",
    ]);
    const card = (name: string) =>
      screen.getAllByRole("button", {
        name: new RegExp(`Detalhes de ${name}`),
      })[0]!;
    const check = () => {
      expect(card("Helena Almeida")).toHaveClass("appt-status-completed");
      expect(card("Bruno Lima")).toHaveClass("appt-status-no_show");
      expect(card("Carla Mendes")).toHaveClass("appt-status-confirmed");
      expect(card("Diego Rocha")).toHaveClass(
        "appt-status-cancelled",
        "is-cancelled",
      );
    };
    check();
    for (const view of ["Semana", "Mês", "Dia"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      await screen.findAllByRole("button", { name: /Detalhes de Helena/ });
      expect(
        screen.getByRole("list", { name: "Legenda dos status" }),
      ).toBeInTheDocument();
      if (view !== "Mês") check();
      else expect(card("Helena Almeida")).toHaveClass("appt-status-completed");
    }
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(
      document.querySelector(".agenda-card.appt-status-no_show"),
    ).not.toBeNull();
    check();
  });
});
