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

const preview = {
  columns: [
    { index: 0, title: "Nome", samples: ["Maria"] },
    { index: 1, title: "Telefone", samples: ["11999990000"] },
  ],
  mapping: ["fullName", "phone"],
  rows: [
    {
      line: 2,
      fullName: "Maria",
      phone: "11999990000",
      status: "valid",
      errors: [],
      warnings: ["Já é cliente: Maria Souza."],
    },
    {
      line: 3,
      fullName: "Nova",
      phone: "11988880000",
      status: "valid",
      errors: [],
    },
  ],
  errors: [],
  totals: { valid: 2, error: 0 },
};

describe("importar leads por planilha (LI1)", () => {
  it("abre pelo botão Importar leads, avisa quem já é cliente e envia origem e etapa escolhidas", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana",
        email: "admin@example.com",
        role: "owner",
      }),
    );
    const imports: Record<string, unknown>[] = [];
    let boardLoads = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      let body: unknown = [];
      if (url.endsWith("/leads/import/preview")) body = preview;
      else if (url.endsWith("/leads/import")) {
        imports.push(JSON.parse(String(init?.body ?? "{}")));
        body = { created: 2, warnings: 1, errors: 0 };
      } else if (isLeadBoardUrl(url)) {
        boardLoads++;
        body = leadBoardResponse(url, []);
      }
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Importar leads" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Importar leads",
    });
    fireEvent.change(within(dialog).getByLabelText("Etapa do funil"), {
      target: { value: "contacted" },
    });
    fireEvent.change(within(dialog).getByLabelText("Planilha de leads"), {
      target: { files: [new File(["Nome;Telefone\n"], "leads.csv")] },
    });
    expect(
      await within(dialog).findByText(
        "Já é cliente: Maria Souza. Será importada.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText("1 com aviso")).toBeVisible();
    const before = boardLoads;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Importar 2 lead(s)" }),
    );
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "2 lead(s) importado(s), 1 com aviso de contato já cadastrado e 0 com erro.",
    );
    expect(imports[0]).toMatchObject({
      fileName: "leads.csv",
      mapping: ["fullName", "phone"],
      source: "Planilha",
      stage: "contacted",
    });
    await waitFor(() => expect(boardLoads).toBeGreaterThan(before));
  });
});
