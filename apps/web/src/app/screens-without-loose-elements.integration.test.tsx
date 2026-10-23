import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";
import { isLeadBoardUrl, leadBoardResponse } from "../test-support/lead-board";

describe("screens without loose elements", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };

  it('groups clinical follow-up actions with a keyboard-accessible "Mais ações" menu', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/patients")
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    const more = await screen.findByRole("button", { name: "Mais ações" });
    // Cabeçalho do prontuário: ação principal visível, o resto no menu.
    const actions = more.closest(".clinical-chart-actions") as HTMLElement;
    for (const name of ["Nova avaliação", "Imprimir", "Exportar"]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Novo modelo" }),
    ).not.toBeInTheDocument();
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Mais ações" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Nova medição",
      "Novo objetivo",
      "Anexar arquivo",
      "Novo alerta clínico",
      "Novo modelo",
      "Encerrar tratamento",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Nova medição" }),
    ).toHaveFocus();
    fireEvent.keyDown(
      within(menu).getByRole("menuitem", { name: "Nova medição" }),
      { key: "ArrowDown" },
    );
    expect(
      within(menu).getByRole("menuitem", { name: "Novo objetivo" }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();

    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: "Novo objetivo" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Novo objetivo terapêutico" }),
    ).toBeInTheDocument();
  });

  it('highlights "Novo lead" when the CRM has no leads', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () => leadBoardResponse(input, []) ?? [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Nenhum lead cadastrado"),
    ).toBeInTheDocument();
    expect(document.querySelector(".kanban-board")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar primeiro lead" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Novo lead" }),
    ).toBeInTheDocument();
  });

  it("shows a short hint in empty CRM columns", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "contacted",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = isLeadBoardUrl(String(input))
        ? leadBoardResponse(String(input), [lead])
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Bruna Lead")).closest(
      ".kanban-column",
    ) as HTMLElement;
    expect(card.querySelector(".kanban-empty-hint")).toBeNull();
    expect(
      screen.getByText("Leads recém-cadastrados aparecem aqui."),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".kanban-empty-hint")).toHaveLength(5);
    expect(
      screen.queryByText("Nenhum lead cadastrado"),
    ).not.toBeInTheDocument();
  });

  it('puts "Matricular cliente" in the page header instead of floating between panels', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/groups/workspace?")
        ? {
            groups: [],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    const enroll = await screen.findByRole("button", {
      name: "Matricular cliente",
    });
    expect(enroll.closest(".page-header")).not.toBeNull();
    expect(enroll).toHaveClass("secondary-button");
    expect(container.querySelector(".group-actions-bar")).toBeNull();
    fireEvent.click(enroll);
    const dialog = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Dados da matrícula" }),
    ).toBeInTheDocument();
  });
});
