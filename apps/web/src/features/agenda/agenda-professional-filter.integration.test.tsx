import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function renderAgenda(restricted = false) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    restricted
      ? JSON.stringify({
          id: "33333333-3333-4333-8333-333333333333",
          fullName: "Clara Mendes",
          email: "clara@movimenta.local",
          role: "user",
          modules: ["agenda"],
          editModules: [],
          permissions: ["agenda.view"],
        })
      : storedUser({
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
          // Sem "ver todos", a API devolve só a agenda do profissional ligado.
          ...(restricted ? [] : [appointment("a2", "Lucas Ribeiro", "p2")]),
        ]
      : url.includes("/group-sessions?")
        ? [
            {
              id: "g1",
              groupId: "t1",
              groupName: "Dançaterapia Turma A",
              professionalId: "p1",
              professionalName: "Clara Mendes",
              roomId: "r1",
              roomName: "Sala de Dança",
              startsAt: at(7),
              endsAt: at(8),
              status: "scheduled",
              attendanceCount: 0,
            },
          ]
        : url.includes("/professionals")
          ? [
              { id: "p1", fullName: "Clara Mendes", color: "#9a6bc4" },
              { id: "p2", fullName: "Bia Souza", color: "#3f7fbf" },
            ]
          : url.endsWith("/profile")
            ? { professional: { id: "p1", fullName: "Clara Mendes" } }
            : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("agenda by professional", () => {
  it("shows the professional dot on group classes in the month and week views", async () => {
    renderAgenda();
    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const monthGroup = (await screen.findByText("Dançaterapia Turma A"))
      .parentElement!;
    expect(monthGroup).toHaveClass("month-group");
    expect(monthGroup.style.getPropertyValue("--pro-color")).toBe("#9a6bc4");
    expect(monthGroup.querySelector(".pro-dot")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    const weekGroup = await screen.findByRole("article", {
      name: "Dançaterapia Turma A",
    });
    expect(weekGroup.style.getPropertyValue("--pro-color")).toBe("#9a6bc4");
    expect(weekGroup.querySelector(".pro-dot")).toBeInTheDocument();
  });

  it("filters appointments and group classes by professional", async () => {
    renderAgenda();
    fireEvent.click(await screen.findByRole("button", { name: "Semana" }));
    await screen.findByRole("button", { name: /Detalhes de Lucas Ribeiro/ });
    expect(
      screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }),
    ).toBeInTheDocument();

    const filter = screen.getByRole("combobox", { name: "Profissional" });
    fireEvent.change(filter, { target: { value: "p2" } });
    expect(
      screen.getByRole("button", { name: /Detalhes de Lucas Ribeiro/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Detalhes de Helena Almeida/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Dançaterapia Turma A")).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: "p1" } });
    expect(
      screen.queryByRole("button", { name: /Detalhes de Lucas Ribeiro/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dançaterapia Turma A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    await screen.findByRole("button", { name: /Detalhes de Helena Almeida/ });
    expect(
      screen.queryByRole("columnheader", { name: /Bia Souza/ }),
    ).not.toBeInTheDocument();
  });

  it("without seeing every agenda, hides the filter and shows only the own professional", async () => {
    renderAgenda(true);
    fireEvent.click(await screen.findByRole("button", { name: "Dia" }));
    expect(
      await screen.findByRole("columnheader", { name: /Clara Mendes/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /Bia Souza/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Profissional" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Legenda dos profissionais")).queryByText(
        "Bia Souza",
      ),
    ).not.toBeInTheDocument();
  });
});
