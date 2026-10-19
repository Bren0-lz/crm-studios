import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { localIsoDate } from "../../shared/lib/formatting";

describe("day schedule grid", () => {
  it("shows a column per professional and opens a prefilled appointment from a free slot", async () => {
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
    const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const bia = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalId: ana,
      professionalName: "Ana Martins",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      serviceName: "Pilates",
      roomName: "Estúdio",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/professionals")
        ? [
            { id: ana, fullName: "Ana Martins", color: "#547A6B" },
            { id: bia, fullName: "Bia Souza", color: "#547A6B" },
          ]
        : url.includes("/appointments?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    const grid = await screen.findByRole("table", {
      name: "Agenda do dia por profissional",
    });
    expect(
      within(grid).getByRole("columnheader", { name: "Ana Martins" }),
    ).toBeInTheDocument();
    const card = within(grid).getByRole("button", {
      name: "Detalhes de Helena Almeida",
    });
    // Uma hora = duas linhas de 30 minutos.
    expect(card.closest("td")).toHaveAttribute("rowspan", "2");
    expect(
      within(grid).queryByRole("button", {
        name: "Agendar com Ana Martins às 10:30",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(grid).getByRole("button", {
        name: "Agendar com Bia Souza às 14:00",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Novo atendimento",
    });
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(bia);
    expect(within(dialog).getByLabelText("Horário")).toHaveValue("14:00");
    expect(
      within(dialog).getByRole("button", { name: "Data" }),
    ).toHaveTextContent(localIsoDate().split("-").reverse().join("/"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(
      screen.queryByRole("table", { name: "Agenda do dia por profissional" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Status do atendimento" }),
    ).toBeInTheDocument();
  });
});
