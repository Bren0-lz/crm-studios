import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("filtros de atendimento e relacionamento dos clientes", () => {
  it("filtra por turma, serviço, profissional e agendamento com os dados do resumo", async () => {
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
    const patient = (id: string, fullName: string) => ({
      id,
      recordNumber: `PAC-${id.slice(-5)}`,
      fullName,
      phone: "11987654321",
      tags: [],
      status: "active",
    });
    const lara = patient("99999999-9999-4999-8999-999999999991", "Lara Turma");
    const otavio = patient(
      "99999999-9999-4999-8999-999999999992",
      "Otávio Avulso",
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patients/segments"))
        return jsonResponse([
          {
            patientId: lara.id,
            activePlans: 1,
            renewalDue: false,
            availableReplacements: 0,
            waiting: 0,
            services: ["Pilates"],
            groups: ["Pilates manhã"],
            professionals: ["Marina Costa"],
            lastVisitOn: "2000-01-10",
          },
          {
            patientId: otavio.id,
            activePlans: 0,
            renewalDue: false,
            availableReplacements: 0,
            waiting: 0,
            services: ["Depilação"],
            groups: [],
            professionals: ["Paula Lima"],
            nextAppointmentAt: "2099-01-01T13:00:00.000Z",
          },
        ]);
      if (url.includes("/patients?") || url.endsWith("/patients"))
        return jsonResponse([lara, otavio]);
      return jsonResponse([]);
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Abrir ficha de Lara Turma" });
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(screen.getByText("Atendimento e relacionamento"));
    const group = await screen.findByRole("combobox", { name: "Turma" });
    await waitFor(() => expect(group).toBeEnabled());
    expect(
      within(group)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todos", "Pilates manhã"]);
    expect(
      within(screen.getByRole("combobox", { name: "Serviço" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todos", "Depilação", "Pilates"]);

    fireEvent.change(group, { target: { value: "Pilates manhã" } });
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Lara Turma" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir ficha de Otávio Avulso" }),
    ).not.toBeInTheDocument();

    fireEvent.change(group, { target: { value: "" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Próximo agendamento" }),
      { target: { value: "scheduled" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Profissional" }), {
      target: { value: "Paula Lima" },
    });
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Otávio Avulso" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir ficha de Lara Turma" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Próximo agendamento" }),
      { target: { value: "" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Profissional" }), {
      target: { value: "" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Último atendimento" }),
      { target: { value: "over_90" } },
    );
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Lara Turma" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir ficha de Otávio Avulso" }),
    ).not.toBeInTheDocument();
  });
});
