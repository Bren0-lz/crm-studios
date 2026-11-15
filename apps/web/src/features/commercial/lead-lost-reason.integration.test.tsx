import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

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

type CatalogResponse = { names: string[] } | { error: string } | "pending";

/** Monta o funil com o cadastro de motivos de perda respondendo `catalog`. */
function setup(catalog: CatalogResponse) {
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
  const moves: Array<Record<string, unknown>> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/stage") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      moves.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...lead, ...body }),
      } as Response;
    }
    if (url.endsWith("/clinic-catalogs/lead_lost_reason")) {
      if (catalog === "pending") return new Promise<Response>(() => {});
      if ("error" in catalog)
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: catalog.error }),
        } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => [
          ...catalog.names.map((name, index) => ({
            id: `r${index}`,
            kind: "lead_lost_reason",
            name,
            active: true,
          })),
          {
            id: "old",
            kind: "lead_lost_reason",
            name: "Desativado",
            active: false,
          },
        ],
      } as Response;
    }
    const body = isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comercial"]}>
      <App />
    </MemoryRouter>,
  );
  return moves;
}

async function openLostModal() {
  fireEvent.change(await screen.findByLabelText("Etapa de Bruna Lead"), {
    target: { value: "lost" },
  });
  return screen.findByRole("dialog", { name: "Marcar lead como perdido" });
}

const optionsOf = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("lead loss reason from the clinic catalog", () => {
  afterEach(() => localStorage.clear());

  it("offers the active registered reasons and records the chosen one", async () => {
    const moves = setup({ names: ["Achou caro", "Sem horário"] });
    const dialog = await openLostModal();
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    const reason = await within(dialog).findByRole("combobox", {
      name: "Motivo da perda",
    });
    expect(optionsOf(reason)).toEqual([
      "Selecione",
      "Achou caro",
      "Sem horário",
      "Outro motivo",
    ]);
    expect(reason).toHaveFocus();
    // Só "Outro motivo" abre o texto livre.
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("Falta: Motivo da perda.");

    fireEvent.change(reason, { target: { value: "Sem horário" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Marcar lead como perdido" }),
      ).not.toBeInTheDocument(),
    );
    expect(moves).toEqual([{ stage: "lost", lostReason: "Sem horário" }]);
  });

  it("requires the free text when 'Outro motivo' is chosen", async () => {
    const moves = setup({ names: ["Achou caro"] });
    const dialog = await openLostModal();
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    const reason = await within(dialog).findByRole("combobox", {
      name: "Motivo da perda",
    });
    fireEvent.change(reason, { target: { value: "Achou caro" } });
    expect(confirm).toBeEnabled();
    fireEvent.change(reason, { target: { value: "__other__" } });
    const other = within(dialog).getByLabelText("Descreva o motivo");
    expect(other).toBeRequired();
    expect(other).toHaveAttribute("maxLength", "500");
    expect(other).toHaveFocus();
    // Trocar para "Outro motivo" descarta o motivo escolhido antes.
    expect(confirm).toBeDisabled();
    fireEvent.change(other, { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(other, { target: { value: " Mudou de cidade " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({ stage: "lost", lostReason: "Mudou de cidade" });
  });

  it("asks only the free text when no reason is registered", async () => {
    setup({ names: [] });
    const dialog = await openLostModal();
    const text = await within(dialog).findByRole("textbox", {
      name: "Motivo da perda",
    });
    expect(text).toBeRequired();
    expect(text).toHaveAttribute("maxLength", "500");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to the free text with a notice when the catalog fails", async () => {
    const moves = setup({ error: "Falha ao carregar cadastros." });
    const dialog = await openLostModal();
    const text = await within(dialog).findByRole("textbox", {
      name: /Motivo da perda/,
    });
    expect(
      within(dialog).getByText(
        "Motivos cadastrados indisponíveis: Falha ao carregar cadastros.",
      ),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled();
    fireEvent.change(text, { target: { value: "Achou caro" } });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(moves).toEqual([{ stage: "lost", lostReason: "Achou caro" }]),
    );
  });

  it("shows a loading state while the catalog is read", async () => {
    setup("pending");
    const dialog = await openLostModal();
    expect(dialog.querySelector(".loading-block")).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toBeDisabled();
  });
});
