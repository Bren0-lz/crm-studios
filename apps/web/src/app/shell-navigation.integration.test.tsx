import {
  legacyPermissions,
  type AppModule,
  type UserSummary,
} from "@crm/contracts";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useContext, useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { AuthorizationProvider } from "../authorization";
import { NavigationGuardContext } from "../shared/lib/NavigationGuardContext";
import { legacyAccess } from "../test-support/legacy-fixtures";
import { Shell } from "./Shell";

function NavigationState({ block }: { block: boolean }) {
  const register = useContext(NavigationGuardContext);
  const location = useLocation();
  useEffect(() => register(() => block), [register, block]);
  return <output aria-label="Rota atual">{location.pathname}</output>;
}

function renderShell(modules = legacyAccess("admin").modules, block = false) {
  const user: UserSummary = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "user",
    modules,
    editModules: [],
    permissions: legacyPermissions("user", modules, []),
  };
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem("crm.auth.user", JSON.stringify(user));
  vi.spyOn(api, "me").mockResolvedValue(user);
  const onLogout = vi.fn();
  const view = render(
    <MemoryRouter>
      <AuthorizationProvider>
        <Shell user={user} onLogout={onLogout}>
          <NavigationState block={block} />
        </Shell>
      </AuthorizationProvider>
    </MemoryRouter>,
  );
  return { ...view, onLogout };
}

beforeEach(() => {
  vi.spyOn(api, "clinicBranding").mockResolvedValue({
    name: "Studios Aryana",
    logoDataUrl: "",
    timezone: "America/Sao_Paulo",
  });
  vi.spyOn(api, "patientOptions").mockResolvedValue([
    { id: "client-1", fullName: "Helena Almeida", tags: [] },
  ]);
});

describe("shell navigation", () => {
  it("groups all modules, preserves destinations and marks only the current page", async () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    const expected = {
      Rotina: [
        "Visão geral",
        "Agenda",
        "Turmas",
        "Clientes",
        "Planos e sessões",
        "Prontuários",
      ],
      Relacionamento: ["CRM comercial", "Contatos sugeridos", "Comunicações"],
      Gestão: [
        "Contratos",
        "Financeiro",
        "Relatórios",
        "Histórico",
        "Configurações",
      ],
    };
    for (const [name, labels] of Object.entries(expected)) {
      expect(
        within(within(nav).getByRole("group", { name }))
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(labels);
    }
    const agenda = within(nav).getByRole("link", {
      name: "Agenda",
    });
    expect(agenda).toHaveAttribute("href", "/agenda");
    fireEvent.click(agenda);
    expect(screen.getByLabelText("Rota atual")).toHaveTextContent("/agenda");
    expect(agenda).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Visão geral" }),
    ).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(api.me).toHaveBeenCalled());
  });

  it.each<AppModule[]>([[], ["agenda"], ["finance"]])(
    "hides unauthorized links and empty groups for %j",
    async (...modules) => {
      renderShell(modules);
      const nav = screen.getByRole("navigation");
      expect(
        within(nav).getByRole("group", { name: "Rotina" }),
      ).toBeInTheDocument();
      expect(
        within(nav).queryByRole("group", { name: "Relacionamento" }),
      ).not.toBeInTheDocument();
      expect(
        within(nav).queryByRole("group", { name: "Gestão" }) !== null,
      ).toBe(modules.includes("finance"));
      expect(within(nav).getAllByRole("link")).toHaveLength(modules.length + 1);
      expect(screen.queryByRole("button", { name: "SOS" }) !== null).toBe(
        modules.includes("agenda"),
      );
      await waitFor(() => expect(api.me).toHaveBeenCalled());
    },
  );

  it("preserves navigation guards and closes the mobile menu when a link is selected", async () => {
    renderShell(["agenda"], true);
    const toggle = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "Agenda" }));
    expect(screen.getByLabelText("Rota atual")).toHaveTextContent(/^\/$/);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(api.me).toHaveBeenCalled());
  });

  it("opens SOS from the header in a viewport portal, retrieves contacts and restores focus", async () => {
    vi.spyOn(api, "emergencyContact").mockResolvedValue({
      name: "Maria Almeida",
      phone: "11988887777",
    });
    const { container } = renderShell(["agenda"]);
    const sos = within(screen.getByRole("banner")).getByRole("button", {
      name: "SOS",
    });
    fireEvent.click(sos);
    const dialog = screen.getByRole("dialog", { name: "SOS" });
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(
      within(dialog).getByRole("link", { name: "SAMU · 192" }),
    ).toHaveAttribute("href", "tel:192");
    expect(
      within(dialog).getByRole("link", { name: "Polícia · 190" }),
    ).toHaveAttribute("href", "tel:190");
    expect(
      within(dialog).getByRole("link", { name: "Bombeiros · 193" }),
    ).toHaveAttribute("href", "tel:193");
    await waitFor(() => expect(api.patientOptions).toHaveBeenCalled());
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Cliente" }));
    fireEvent.click(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    );
    expect(
      await within(dialog).findByText("Maria Almeida"),
    ).toBeInTheDocument();
    expect(api.emergencyContact).toHaveBeenCalledWith("client-1");
    expect(
      within(dialog).getByRole("link", { name: "Ligar para 11988887777" }),
    ).toHaveAttribute("href", "tel:11988887777");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sos).toHaveFocus();
  });

  it("keeps SOS service links available if the contact request fails", async () => {
    vi.spyOn(api, "emergencyContact").mockRejectedValue(
      new Error("Não foi possível consultar o contato."),
    );
    renderShell(["patients"]);
    fireEvent.click(screen.getByRole("button", { name: "SOS" }));
    const dialog = screen.getByRole("dialog", { name: "SOS" });
    await waitFor(() => expect(api.patientOptions).toHaveBeenCalled());
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Cliente" }));
    fireEvent.click(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível consultar o contato.",
    );
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
  });

  it("opens with the search collapsed, distinguishes loading on focus and closes the list before the dialog", async () => {
    let resolvePatients!: (
      items: Awaited<ReturnType<typeof api.patientOptions>>,
    ) => void;
    vi.mocked(api.patientOptions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePatients = resolve;
        }),
    );
    renderShell(["agenda"]);
    const sos = screen.getByRole("button", { name: "SOS" });
    fireEvent.click(sos);
    const dialog = screen.getByRole("dialog", { name: "SOS" });
    const input = within(dialog).getByRole("combobox", { name: "Cliente" });
    expect(
      within(dialog).getByRole("button", { name: "Fechar" }),
    ).toHaveFocus();
    expect(input).not.toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(within(dialog).getByText("Emergência")).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Buscando clientes",
    );
    expect(
      within(dialog).queryByText("Nenhum cliente encontrado"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
    await act(async () => resolvePatients([]));
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Nenhum cliente encontrado",
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(dialog).toBeInTheDocument();
    fireEvent.click(dialog.parentElement!);
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sos).toHaveFocus();
  });

  it("retries the initial client list and supports keyboard selection", async () => {
    vi.mocked(api.patientOptions).mockRejectedValueOnce(
      new Error("Falha ao carregar clientes."),
    );
    vi.spyOn(api, "emergencyContact").mockResolvedValue({
      name: "",
      phone: "",
    });
    renderShell(["agenda"]);
    fireEvent.click(screen.getByRole("button", { name: "SOS" }));
    const dialog = screen.getByRole("dialog", { name: "SOS" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Falha ao carregar clientes.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Tentar novamente" }),
    );
    await waitFor(() => expect(api.patientOptions).toHaveBeenCalledTimes(2));
    const input = within(dialog).getByRole("combobox", { name: "Cliente" });
    fireEvent.focus(input);
    await within(dialog).findByRole("option", { name: "Helena Almeida" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await within(dialog).findByText("Contato de emergência não cadastrado."),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
  });

  it("shows contact loading, retries errors and keeps the raw telephone link", async () => {
    let rejectContact!: (cause: Error) => void;
    vi.spyOn(api, "emergencyContact")
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectContact = reject;
          }),
      )
      .mockResolvedValue({ name: "", phone: "11988887777" });
    renderShell(["agenda"]);
    fireEvent.click(screen.getByRole("button", { name: "SOS" }));
    const dialog = screen.getByRole("dialog", { name: "SOS" });
    fireEvent.focus(within(dialog).getByRole("combobox", { name: "Cliente" }));
    fireEvent.click(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    );
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Consultando contato",
    );
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
    await act(async () => rejectContact(new Error("Falha na consulta.")));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Falha na consulta.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await within(dialog).findByText("(11) 98888-7777"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Ligar para 11988887777" }),
    ).toHaveAttribute("href", "tel:11988887777");
  });

  it("ignores stale contacts when switching, clearing and reopening the dialog", async () => {
    const patients = [
      { id: "client-1", fullName: "Helena Almeida", tags: [] },
      { id: "client-2", fullName: "Ana Souza", tags: [] },
    ];
    vi.mocked(api.patientOptions).mockResolvedValue(patients);
    const pending: Array<(result: { name: string; phone: string }) => void> =
      [];
    vi.spyOn(api, "emergencyContact").mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    renderShell(["agenda"]);
    const sos = screen.getByRole("button", { name: "SOS" });
    fireEvent.click(sos);
    let dialog = screen.getByRole("dialog", { name: "SOS" });
    let input = within(dialog).getByRole("combobox", { name: "Cliente" });
    fireEvent.focus(input);
    fireEvent.click(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    );
    fireEvent.focus(input);
    fireEvent.click(within(dialog).getByRole("option", { name: "Ana Souza" }));
    await act(async () =>
      pending[1]!({ name: "Contato correto", phone: "11988887777" }),
    );
    await act(async () =>
      pending[0]!({ name: "Contato antigo", phone: "11911112222" }),
    );
    expect(within(dialog).getByText("Contato correto")).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Contato antigo"),
    ).not.toBeInTheDocument();
    // Selecting the same client again must also finish loading.
    fireEvent.focus(input);
    fireEvent.click(within(dialog).getByRole("option", { name: "Ana Souza" }));
    await act(async () =>
      pending[2]!({ name: "Contato atualizado", phone: "11988887777" }),
    );
    expect(within(dialog).getByText("Contato atualizado")).toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.click(
      within(dialog).getByRole("option", { name: "Helena Almeida" }),
    );
    fireEvent.change(input, { target: { value: "" } });
    await act(async () =>
      pending[3]!({ name: "Contato após limpar", phone: "11911112222" }),
    );
    expect(
      within(dialog).queryByText("Contato após limpar"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("option", { name: "Helena Almeida" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    fireEvent.click(sos);
    dialog = screen.getByRole("dialog", { name: "SOS" });
    input = within(dialog).getByRole("combobox", { name: "Cliente" });
    expect(input).toHaveValue("");
    await act(async () =>
      pending[4]!({ name: "Contato após fechar", phone: "11911112222" }),
    );
    expect(
      within(dialog).queryByText("Contato após fechar"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("link")).toHaveLength(3);
  });

  it("discards an initial list request after closing and reopening", async () => {
    let resolveOld!: (
      items: Awaited<ReturnType<typeof api.patientOptions>>,
    ) => void;
    vi.mocked(api.patientOptions).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    renderShell(["agenda"]);
    const sos = screen.getByRole("button", { name: "SOS" });
    fireEvent.click(sos);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(sos);
    fireEvent.focus(screen.getByRole("combobox", { name: "Cliente" }));
    await screen.findByRole("option", { name: "Helena Almeida" });
    await act(async () =>
      resolveOld([{ id: "old", fullName: "Cliente antigo", tags: [] }]),
    );
    expect(
      screen.queryByRole("option", { name: "Cliente antigo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
  });

  it("preserves session-revocation confirmation and the profile logout action", async () => {
    const revoke = vi.spyOn(api, "revokeSessions").mockResolvedValue(undefined);
    const { onLogout } = renderShell([]);
    fireEvent.click(
      screen.getByRole("button", { name: "Sair de todos os dispositivos" }),
    );
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancelar",
      }),
    );
    expect(onLogout).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Sair de todos os dispositivos" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Encerrar acessos",
      }),
    );
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(revoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Sair"));
    expect(onLogout).toHaveBeenCalledTimes(2);
  });
});
