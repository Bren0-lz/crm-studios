import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { moreActionNames } from "../../test-support/patient-actions";

describe("clients header", () => {
  it("keeps only New client in view and groups the secondary actions in 'Mais'", async () => {
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
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: /Novo cliente/ }),
    ).toHaveClass("primary-button");
    for (const name of ["Inativar antigos", "Importar", "Exportar"])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(moreActionNames()).toEqual(["Importar", "Exportar", "Lixeira"]);
    expect(
      readFileSync(
        `${process.cwd()}/src/styles/04-dashboard-clients.css`,
        "utf8",
      ),
    ).toContain("white-space: nowrap");
  });
});
