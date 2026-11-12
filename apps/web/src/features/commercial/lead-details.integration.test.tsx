import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

const baseLead = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  source: "Instagram",
  interest: "Pilates",
  tags: [],
  openTasks: 0,
  overdueTasks: 0,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

function renderBoard(leads: Array<Record<string, unknown>>) {
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
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = isLeadBoardUrl(url) ? leadBoardResponse(url, leads) : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
}

/** Modal de detalhes: o único com o subtítulo "Etapa: …". */
async function detailsDialog() {
  return (await screen.findByText(/^Etapa:/)).closest(
    '[role="dialog"]',
  ) as HTMLElement;
}

describe("commercial lead details", () => {
  it("opens the lead details by clicking the card, but not from its icons", async () => {
    renderBoard([
      {
        ...baseLead,
        id: "44444444-4444-4444-8444-444444444444",
        fullName: "Bruna Lead",
        phone: "11987654321",
        email: "bruna@example.com",
        notes: "Prefere horários de manhã.",
        stage: "new_contact",
      },
    ]);
    await screen.findByText("Bruna Lead");
    const card = screen
      .getByText("Bruna Lead")
      .closest("article") as HTMLElement;

    // O seletor de etapa tem ação própria: clicar nele não abre os detalhes.
    fireEvent.click(screen.getByLabelText("Etapa de Bruna Lead"));
    expect(screen.queryByText(/^Etapa:/)).not.toBeInTheDocument();

    fireEvent.click(card.querySelector(".lead-card-chips") as HTMLElement);
    const dialog = await detailsDialog();
    expect(within(dialog).getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(within(dialog).getByText("bruna@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("Instagram")).toBeInTheDocument();
    expect(within(dialog).getByText("Pilates")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Prefere horários de manhã."),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Motivo da perda"),
    ).not.toBeInTheDocument();

    // "Editar cadastro" troca os detalhes pelo formulário de edição.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Editar cadastro" }),
    );
    expect(
      await screen.findByDisplayValue("bruna@example.com"),
    ).toBeInTheDocument();
  });

  it("shows the loss reason and notes of a lost lead", async () => {
    renderBoard([
      {
        ...baseLead,
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Perdida",
        phone: "11912345678",
        notes: "Achou o valor alto; retomar em março.",
        stage: "lost",
        lostReason: "Preço",
      },
    ]);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalhes de Carla Perdida",
      }),
    );
    const dialog = await detailsDialog();
    expect(within(dialog).getByText("Carla Perdida")).toBeInTheDocument();
    const loss = within(dialog).getByRole("region", { name: "Perda do lead" });
    expect(within(loss).getByText("Motivo da perda")).toBeInTheDocument();
    expect(within(loss).getByText("Preço")).toBeInTheDocument();
    expect(
      within(loss).getByText("Achou o valor alto; retomar em março."),
    ).toBeInTheDocument();
  });
});
