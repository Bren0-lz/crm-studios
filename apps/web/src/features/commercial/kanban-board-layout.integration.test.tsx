import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const commercialCss = readFileSync(
  `${process.cwd()}/src/styles/10-commercial-communications.css`,
  "utf8",
);

function rule(selector: string) {
  const start = commercialCss.indexOf(`${selector} {`);
  return commercialCss.slice(start, commercialCss.indexOf("}", start));
}

describe("commercial board layout", () => {
  it("keeps every stage on one scrollable row with the horizontal bar in view", async () => {
    const board = rule(".kanban-board");
    expect(board).toContain("grid-auto-flow: column");
    expect(board).toMatch(/grid-auto-columns: minmax\(/);
    expect(board).not.toContain("grid-template-columns");
    expect(board).toContain("overflow: scroll");
    expect(board).toContain("max-height");

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
      const body = /\/leads(\?|$)/.test(String(input))
        ? [
            {
              id: "l1",
              clinicId: "c1",
              fullName: "Lead Novo",
              phone: "11999990000",
              source: "Instagram",
              interest: "Pilates",
              stage: "new_contact",
              tags: [],
              openTasks: 0,
              overdueTasks: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Lead Novo");
    const columns = Array.from(
      document.querySelectorAll(".kanban-board > .kanban-column header strong"),
    ).map((item) => item.textContent);
    expect(columns).toEqual([
      "Novos",
      "Em contato",
      "Avaliação",
      "Proposta",
      "Ganhos",
      "Perdidos",
    ]);
  });
});
