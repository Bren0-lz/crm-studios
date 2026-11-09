import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  openSettingsSection,
  patientTag,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

// QV5: botões de Configurações não repetem a palavra quando o nome já começa com ela.
describe("settings labels without repeated prefix", () => {
  it("names the tag buttons once when the tag name starts with Etiqueta", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Limited Settings",
        email: "limited@test.local",
        role: "user",
        modules: ["settings"],
        editModules: [],
        permissions: [
          "settings.view",
          "settings.tags_update",
          "settings.tags_delete",
        ],
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/patient-tags")
              ? [patientTag("Etiqueta VIP"), patientTag("Pilates")]
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Etiquetas");
    expect(
      await screen.findByRole("button", { name: "Editar Etiqueta VIP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar etiqueta Pilates" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /etiqueta etiqueta/i }),
    ).not.toBeInTheDocument();
  });
});
