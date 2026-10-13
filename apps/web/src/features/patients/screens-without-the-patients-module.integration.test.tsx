import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { patientTag } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("screens without the patients module", () => {
  const option = {
    id: "99999999-9999-4999-8999-999999999999",
    fullName: "Helena Almeida",
    tags: ["pilates"],
  };
  function renderAs(module: string, path: string) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Personalizada",
        email: "carla@movimenta.local",
        role: "user",
        modules: [module],
        editModules: [module],
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      // Como a API: sem ver Clientes (nem Planos), o cadastro completo e os planos dão 403.
      if (/\/patients(\?|$)/.test(url) || /\/plans(\?|$)/.test(url))
        return {
          ok: false,
          status: 403,
          json: async () => ({
            code: "COMMERCIAL_ACCESS_DENIED",
            message: "Seu usuário não possui permissão para ver Clientes.",
          }),
        } as Response;
      const body = url.includes("/patients/options")
        ? [option]
        : url.includes("/patient-tags")
          ? [patientTag("pilates", "#2f855a", 1)]
          : url.includes("/communications")
            ? { deliveryMode: "outbox_only", preferences: [], messages: [] }
            : url.includes("/groups/workspace?")
              ? {
                  groups: [],
                  enrollments: [],
                  sessions: [],
                  attendance: [],
                  replacementCredits: [],
                }
              : url.includes("/document-templates")
                ? [
                    {
                      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                      name: "Contrato padrão",
                      kind: "contract",
                      version: 1,
                      body: "Contrato",
                      active: true,
                      createdAt: new Date().toISOString(),
                    },
                  ]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
  }
  function expectOnlyOptions() {
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/patients/options"))).toBe(true);
    expect(urls.some((url) => /\/patients(\?|$)/.test(url))).toBe(false);
    expect(screen.queryByText(/não possui permissão/)).not.toBeInTheDocument();
  }

  it("opens the agenda and lists clients in a new appointment", async () => {
    renderAs("agenda", "/agenda");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Cliente" }));
    expect(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Adicionar cliente" }),
    ).not.toBeInTheDocument();
    expectOnlyOptions();
  });

  it("opens communications with the client list and the broadcast tags", async () => {
    renderAs("communications", "/comunicacoes");
    fireEvent.focus(await screen.findByRole("combobox", { name: "Cliente" }));
    expect(
      await screen.findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    const panel = (
      await screen.findByRole("heading", { name: "Comunicado segmentado" })
    ).closest("section")!;
    expect(
      await within(panel).findByRole("button", { name: /^pilates/ }),
    ).toBeInTheDocument();
    expectOnlyOptions();
  });

  it("opens contracts without the clients and plans modules", async () => {
    renderAs("contracts", "/contratos");
    expect(
      await screen.findByRole("button", { name: "Criar rascunho" }),
    ).toBeDisabled();
    fireEvent.focus(screen.getByRole("combobox", { name: "Cliente" }));
    expect(
      await screen.findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Helena Almeida" }));
    expect(
      screen.getByRole("button", { name: "Criar rascunho" }),
    ).toBeEnabled();
    expectOnlyOptions();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => /\/plans(\?|$)/.test(String(url))),
    ).toBe(false);
  });

  it("opens groups and lists clients in a new enrollment", async () => {
    renderAs("groups", "/turmas");
    fireEvent.click(
      await screen.findByRole("button", { name: "Matricular cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Nova matrícula" });
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Cliente" }));
    expect(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expectOnlyOptions();
  });
});
