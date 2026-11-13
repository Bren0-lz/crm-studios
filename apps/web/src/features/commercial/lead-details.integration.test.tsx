import {
  cleanup,
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

function renderBoard(
  leads: Array<Record<string, unknown>>,
  /** Resposta de `GET /leads/:id/activity`; `"error"` simula falha na leitura. */
  activity?: Record<string, unknown> | "error",
) {
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
    if (activity && url.endsWith("/activity")) {
      return activity === "error"
        ? ({
            ok: false,
            status: 500,
            json: async () => ({ message: "Falha ao carregar o lead." }),
          } as Response)
        : ({ ok: true, status: 200, json: async () => activity } as Response);
    }
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

  it("sends the lead to the trash from the details", async () => {
    const id = "66666666-6666-4666-8666-666666666666";
    renderBoard([
      {
        ...baseLead,
        id,
        fullName: "Diana Excluir",
        phone: "11911112222",
        stage: "new_contact",
      },
    ]);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalhes de Diana Excluir",
      }),
    );
    const dialog = await detailsDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    const confirm = await screen.findByRole("dialog", { name: "Excluir" });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Enviar para a lixeira" }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/^Etapa:/)).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input).endsWith(`/trash/leads/${id}`) &&
            init?.method === "POST",
        ),
    ).toBe(true);
    expect(
      await screen.findByText("Lead Diana Excluir foi para a lixeira."),
    ).toBeInTheDocument();
  });

  it("lists every stage move of the lead in the Movimentações tab", async () => {
    const id = "77777777-7777-4777-8777-777777777777";
    renderBoard(
      [
        {
          ...baseLead,
          id,
          fullName: "Elaine Retorno",
          phone: "11933334444",
          stage: "contacted",
        },
      ],
      {
        contacts: [],
        tasks: [],
        stageHistory: [
          {
            id: "h2",
            leadId: id,
            fromStage: "lost",
            toStage: "contacted",
            actorName: "Aryana Dutra",
            createdAt: "2026-09-03T15:30:00.000Z",
          },
          {
            id: "h1",
            leadId: id,
            fromStage: "stage_antiga",
            toStage: "lost",
            reason: "Preço",
            actorName: "Equipe comercial",
            createdAt: "2026-09-02T14:00:00.000Z",
          },
        ],
      },
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalhes de Elaine Retorno",
      }),
    );
    const dialog = await detailsDialog();
    const detailsTab = within(dialog).getByRole("tab", { name: "Detalhes" });
    const movesTab = within(dialog).getByRole("tab", {
      name: "Movimentações",
    });
    expect(detailsTab).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByText("(11) 93333-4444")).toBeVisible();

    fireEvent.click(movesTab);
    expect(movesTab).toHaveAttribute("aria-selected", "true");
    const timeline = await within(dialog).findByRole("list", {
      name: "Movimentações no funil",
    });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // Mais recente primeiro: voltou de "Perdidos" para "Em contato".
    expect(items[0]!.textContent).toContain("De Perdidos para Em contato");
    expect(items[0]!.textContent).toContain("por Aryana Dutra");
    // Etapa que saiu do funil aparece como removida; a perda mostra o motivo.
    expect(items[1]!.textContent).toContain("De Etapa removida para Perdidos");
    expect(items[1]!.textContent).toContain("Motivo da perda: Preço");
    expect(items[1]!.textContent).toContain("por Equipe comercial");
    expect(items[2]!.textContent).toContain("Lead cadastrado");
    // Os dados do cadastro ficam na outra aba.
    expect(
      within(dialog).getByRole("tabpanel", { name: "Movimentações" }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("tabpanel", { name: "Detalhes" }),
    ).not.toBeInTheDocument();

    // Setas trocam de aba.
    fireEvent.keyDown(movesTab, { key: "ArrowRight" });
    expect(detailsTab).toHaveAttribute("aria-selected", "true");
  });

  it("shows the empty and error states of the Movimentações tab", async () => {
    const lead = {
      ...baseLead,
      id: "88888888-8888-4888-8888-888888888888",
      fullName: "Fabi Sem Historico",
      phone: "11955556666",
      stage: "new_contact",
    };
    renderBoard([lead], { contacts: [], tasks: [], stageHistory: [] });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalhes de Fabi Sem Historico",
      }),
    );
    let dialog = await detailsDialog();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Movimentações" }));
    expect(
      await within(dialog).findByText("Nenhuma movimentação"),
    ).toBeInTheDocument();

    cleanup();
    renderBoard([lead], "error");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalhes de Fabi Sem Historico",
      }),
    );
    dialog = await detailsDialog();
    fireEvent.click(within(dialog).getByRole("tab", { name: "Movimentações" }));
    expect(
      await within(dialog).findByText("Falha ao carregar o lead."),
    ).toBeInTheDocument();
  });
});
