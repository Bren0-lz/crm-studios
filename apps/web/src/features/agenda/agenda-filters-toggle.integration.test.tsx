import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

// RF10 (D2): no celular, filtros e legendas ficam recolhidos no botão "Filtros".
function renderAgenda() {
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
    return date.toISOString();
  };
  const appointment = (id: string, name: string, professionalId: string) => ({
    id,
    patientName: name,
    status: "scheduled",
    professionalId,
    professionalName: professionalId === "p1" ? "Clara Mendes" : "Bia Souza",
    professionalColor: professionalId === "p1" ? "#9a6bc4" : "#3f7fbf",
    startsAt: at(professionalId === "p1" ? 9 : 10),
    endsAt: at(professionalId === "p1" ? 10 : 11),
    serviceName: "Pilates",
    roomName: "Estúdio",
  });
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/appointments?")
      ? [
          appointment("a1", "Helena Almeida", "p1"),
          appointment("a2", "Lucas Ribeiro", "p2"),
        ]
      : url.includes("/professionals")
        ? [
            { id: "p1", fullName: "Clara Mendes", color: "#9a6bc4" },
            { id: "p2", fullName: "Bia Souza", color: "#3f7fbf" },
          ]
        : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("agenda filters toggle (mobile)", () => {
  it("collapses and expands the filters and the legends", async () => {
    renderAgenda();
    await screen.findByRole("button", { name: /Detalhes de Lucas Ribeiro/ });
    const toggle = screen.getByRole("button", { name: "Filtros" });
    const panel = toggle.closest(".agenda-panel")!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toHaveClass("agenda-filters-open");

    // Controla as partes recolhíveis: notas, cancelados + legenda de situações e profissionais.
    const controlled = toggle
      .getAttribute("aria-controls")!
      .split(" ")
      .map((id) => document.getElementById(id));
    expect(controlled).toHaveLength(3);
    expect(controlled.every(Boolean)).toBe(true);
    const parts = controlled as HTMLElement[];
    expect(parts[0]).toContainElement(
      screen.getByRole("checkbox", { name: "Mostrar notas" }),
    );
    expect(parts[1]).toContainElement(
      screen.getByRole("checkbox", { name: "Mostrar cancelados" }),
    );
    expect(parts[1]).toContainElement(
      screen.getByRole("list", { name: "Legenda dos status" }),
    );
    expect(parts[2]).toContainElement(
      screen.getByRole("combobox", { name: "Profissional" }),
    );
    expect(parts[2]).toContainElement(
      screen.getByLabelText("Legenda dos profissionais"),
    );
    // Dia/Semana/Mês e Grade/Lista ficam fora do recolhível.
    for (const name of ["Dia", "Semana", "Mês", "Grade", "Lista"])
      for (const part of parts)
        expect(part).not.toContainElement(screen.getByRole("button", { name }));

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("agenda-filters-open");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toHaveClass("agenda-filters-open");
  });

  it("keeps the filters applied when collapsed and shows how many are active", async () => {
    renderAgenda();
    await screen.findByRole("button", { name: /Detalhes de Lucas Ribeiro/ });
    const toggle = screen.getByRole("button", { name: "Filtros" });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole("combobox", { name: "Profissional" }), {
      target: { value: "p1" },
    });
    expect(toggle).toHaveAccessibleName("Filtros, 1 ativo");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Mostrar cancelados" }),
    );
    expect(toggle).toHaveAccessibleName("Filtros, 2 ativos");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("Filtros, 2 ativos");
    expect(
      screen.queryByRole("button", { name: /Detalhes de Lucas Ribeiro/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Profissional" })).toHaveValue(
      "p1",
    );

    // Nos outros modos o filtro continua aplicado.
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findByRole("button", { name: /Detalhes de Helena Almeida/ });
    expect(
      screen.queryByRole("button", { name: /Detalhes de Lucas Ribeiro/ }),
    ).not.toBeInTheDocument();
    expect(toggle).toHaveAccessibleName("Filtros, 2 ativos");
  });
});
