import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("cancelled appointments in the agenda", () => {
  it("leaves cancelled appointments out of the counts and shows them only on demand", async () => {
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
    const base = {
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
    };
    const appointments = [
      {
        ...base,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        patientName: "Helena Almeida",
        status: "scheduled",
      },
      {
        ...base,
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        patientName: "Ana Barbosa",
        status: "cancelled",
      },
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
    expect(await screen.findByText("Helena Almeida")).toBeInTheDocument();
    expect(screen.queryByText("Ana Barbosa")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(
      await screen.findByRole("button", {
        name: /1 atendimentos, 0 aulas de turma/,
      }),
    ).toHaveTextContent("1 atendimento");

    fireEvent.click(screen.getByLabelText("Mostrar cancelados"));
    const cancelled = screen.getByRole("button", {
      name: /Detalhes de Ana Barbosa/,
    });
    expect(cancelled).toHaveClass("is-cancelled");
    expect(
      screen.getByRole("button", { name: /1 atendimentos, 0 aulas de turma/ }),
    ).toBeInTheDocument();
  });
});

describe("modal eyebrow", () => {
  it("shows the module name instead of 'Cadastro rápido' in agenda modals", async () => {
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
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?")
              ? [
                  {
                    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    patientName: "Helena Almeida",
                    professionalColor: "#5c6f68",
                    startsAt: startsAt.toISOString(),
                    endsAt: startsAt.toISOString(),
                    serviceName: "Pilates",
                    professionalName: "Dra. Ana Martins",
                    roomName: "Sala Movimento",
                    status: "scheduled",
                  },
                ]
              : [],
        }) as Response,
    );
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
    expect(dialog).toHaveTextContent("Agenda");
    expect(dialog).not.toHaveTextContent("Cadastro rápido");
  });
});
