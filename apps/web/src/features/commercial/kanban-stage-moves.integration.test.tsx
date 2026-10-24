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
import {
  isLeadBoardUrl,
  leadBoardResponse,
} from "../../test-support/lead-board";

describe("commercial board stage moves", () => {
  it("moves a lead only by the card selector, without success notices, and asks the loss reason", async () => {
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
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "new_contact",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
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
      const body = isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = () =>
      screen.getByText("Bruna Lead").closest("article") as HTMLElement;
    const column = (name: string) =>
      screen.getByRole("region", { name }) as HTMLElement;
    await screen.findByText("Bruna Lead");
    // O cartão não é mais arrastável: soltar sobre outra coluna não muda a etapa.
    expect(card()).not.toHaveAttribute("draggable");
    const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card(), { dataTransfer: transfer });
    fireEvent.dragOver(column("Proposta"), { dataTransfer: transfer });
    fireEvent.drop(column("Proposta"), { dataTransfer: transfer });
    expect(column("Proposta")).not.toHaveClass("drag-over");
    expect(moves).toEqual([]);
    expect(within(column("Novos")).getByText("Bruna Lead")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Etapa de Bruna Lead"), {
      target: { value: "contacted" },
    });
    await waitFor(() => expect(moves).toEqual([{ stage: "contacted" }]));
    await waitFor(() =>
      expect(
        within(column("Em contato")).getByText("Bruna Lead"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Os totais das colunas acompanham a mudança sem recarregar o funil.
    expect(within(column("Em contato")).getByRole("banner").textContent).toBe(
      "Em contato1",
    );
    expect(within(column("Novos")).getByRole("banner").textContent).toBe(
      "Novos0",
    );

    fireEvent.change(screen.getByLabelText("Etapa de Bruna Lead"), {
      target: { value: "proposal" },
    });
    await waitFor(() =>
      expect(
        within(column("Proposta")).getByText("Bruna Lead"),
      ).toBeInTheDocument(),
    );
    expect(moves).toEqual([{ stage: "contacted" }, { stage: "proposal" }]);
    expect(within(column("Em contato")).getByRole("banner").textContent).toBe(
      "Em contato0",
    );
    expect(within(column("Proposta")).getByRole("banner").textContent).toBe(
      "Proposta1",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Etapa de Bruna Lead"), {
      target: { value: "lost" },
    });
    const lost = screen.getByRole("dialog", {
      name: "Marcar lead como perdido",
    });
    fireEvent.change(within(lost).getByLabelText("Motivo da perda"), {
      target: { value: "Sem disponibilidade" },
    });
    fireEvent.click(within(lost).getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Marcar lead como perdido" }),
      ).not.toBeInTheDocument(),
    );
    expect(moves[2]).toEqual({
      stage: "lost",
      lostReason: "Sem disponibilidade",
    });
    expect(
      within(column("Perdidos")).getByText("Bruna Lead"),
    ).toBeInTheDocument();
    expect(
      within(column("Perdidos")).getByText("Sem disponibilidade"),
    ).toBeInTheDocument();
    expect(within(column("Perdidos")).getByRole("banner").textContent).toBe(
      "Perdidos1",
    );
    expect(within(column("Proposta")).getByRole("banner").textContent).toBe(
      "Proposta0",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
