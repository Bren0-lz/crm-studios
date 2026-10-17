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

function dataTransfer() {
  return { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
}

function dragTo(card: HTMLElement, column: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(card, { dataTransfer: transfer });
  fireEvent.dragOver(column, { dataTransfer: transfer });
  fireEvent.drop(column, { dataTransfer: transfer });
  fireEvent.dragEnd(card, { dataTransfer: transfer });
}

describe("commercial board drag and drop", () => {
  it("moves a lead by dropping it on a column and opens the modal for lost and won", async () => {
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
          json: async () => ({ ...lead, stage: body.stage }),
        } as Response;
      }
      const body = url.endsWith("/leads") ? [lead] : [];
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
    expect(card()).toHaveAttribute("draggable", "true");

    // A coluna sob o cursor fica destacada.
    fireEvent.dragStart(card(), { dataTransfer: dataTransfer() });
    fireEvent.dragOver(column("Proposta"), { dataTransfer: dataTransfer() });
    expect(column("Proposta")).toHaveClass("drag-over");
    fireEvent.dragEnd(card(), { dataTransfer: dataTransfer() });
    expect(column("Proposta")).not.toHaveClass("drag-over");

    dragTo(card(), column("Em contato"));
    await waitFor(() => expect(moves).toEqual([{ stage: "contacted" }]));
    expect(
      await screen.findByText("Bruna Lead movido para Em contato."),
    ).toBeInTheDocument();
    expect(
      within(column("Em contato")).getByText("Bruna Lead"),
    ).toBeInTheDocument();

    dragTo(card(), column("Perdidos"));
    expect(
      screen.getByRole("dialog", { name: "Marcar lead como perdido" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Marcar lead como perdido" }),
      ).not.toBeInTheDocument(),
    );

    dragTo(card(), column("Ganhos"));
    expect(
      screen.getByRole("dialog", { name: "Converter lead em cliente" }),
    ).toBeInTheDocument();
    expect(moves).toHaveLength(1);
  });
});
