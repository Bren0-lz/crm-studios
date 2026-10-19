import {
  effectiveEditModules,
  effectiveModules,
  legacyPermissions,
  permissionCatalog,
  saoPauloToday,
  togglePermissions,
  type AppModule,
} from "@crm/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  legacyAccess,
  legacyProfiles,
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { moreActionNames } from "../../test-support/patient-actions";

describe("users and permissions", () => {
  const ownerSession = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const customUser = {
    id: "33333333-3333-4333-8333-333333333333",
    clinicId: "11111111-1111-4111-8111-111111111111",
    fullName: "Maria Souza",
    email: "maria@movimenta.local",
    role: "user",
    jobTitle: "Instrutora de Pilates",
    modules: [...legacyAccess("reception").modules, "finance"],
    editModules: legacyAccess("reception").editModules,
    customModules: true,
    active: true,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };

  const adminUser = {
    ...customUser,
    id: "55555555-5555-4555-8555-555555555555",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    jobTitle: "Sócia",
    ...legacyAccess("admin"),
    customModules: false,
  };
  const carlaUser = {
    ...customUser,
    id: "99999999-9999-4999-8999-999999999999",
    fullName: "Carla Reis",
    email: "carla@movimenta.local",
    jobTitle: "Fisioterapeuta",
    modules: ["agenda", "patients", "clinical"],
    editModules: ["clinical"],
  };
  const lastAdminConflict = {
    ok: false,
    status: 409,
    json: async () => ({
      code: "LAST_ADMIN",
      message:
        "A clínica precisa de pelo menos um admin ativo. Torne outro usuário admin antes.",
    }),
  } as Response;

  function mockAdmin(
    handler?: (url: string, init?: RequestInit) => unknown,
    users: unknown[] = [customUser],
  ) {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const handled = handler?.(url, init);
      if (
        handled &&
        typeof handled === "object" &&
        "ok" in handled &&
        (handled as Response).ok === false
      )
        return handled as Response;
      if (handled !== undefined)
        return {
          ok: true,
          status: 200,
          json: async () =>
            handled && typeof handled === "object" && "modules" in handled
              ? withPermissions(handled as typeof customUser)
              : handled,
        } as Response;
      const body = url.includes("/admin/users")
        ? users.map((item) => withPermissions(item as typeof customUser))
        : url.includes("/admin/permission-matrix")
          ? [
              {
                role: "user",
                modules: ["Agenda", "Prontuários"],
                editModules: ["Prontuários"],
              },
            ]
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/admin/clinic-settings")
              ? null
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
  }

  function lastCall(method: string) {
    const call = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === method)
      .at(-1);
    return {
      url: String(call?.[0]),
      body: JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>,
    };
  }

  it("lists users with type, job title and an access summary, without profile defaults", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    const noAccess = {
      ...carlaUser,
      id: "12121212-1212-4121-8121-121212121212",
      fullName: "Davi Rocha",
      jobTitle: undefined,
      modules: [],
      editModules: [],
      customModules: false,
    };
    const readOnly = {
      ...carlaUser,
      id: "13131313-1313-4131-8131-131313131313",
      fullName: "Elisa Prado",
      jobTitle: undefined,
      modules: ["reports"],
      editModules: [],
    };
    mockAdmin(undefined, [adminUser, customUser, noAccess, readOnly]);
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Usuários");
    const row = (name: string) =>
      within(section).getByText(name).closest("article")!;
    expect(await within(section).findByText("Maria Souza")).toBeInTheDocument();
    expect(
      within(row("Maria Souza")).getByText(
        "Usuário comum · Instrutora de Pilates",
      ),
    ).toBeInTheDocument();
    expect(
      within(row("Maria Souza")).getByText(
        `Vê 10 módulos · ${legacyPermissions("user", customUser.modules as AppModule[], customUser.editModules as AppModule[]).length} permissões`,
      ),
    ).toBeInTheDocument();
    expect(
      within(row("Aryana Dutra")).getByText("Admin · Sócia"),
    ).toBeInTheDocument();
    expect(
      within(row("Aryana Dutra")).getByText("Acesso total"),
    ).toBeInTheDocument();
    expect(
      within(row("Davi Rocha")).getByText("Nenhum módulo (só Visão geral)"),
    ).toBeInTheDocument();
    expect(
      within(row("Elisa Prado")).getByText("Vê 1 módulo · 6 permissões"),
    ).toBeInTheDocument();
    // Sem padrão por perfil: nem selo de "personalizadas" nem a matriz de padrões.
    expect(
      within(section).queryByText("Permissões personalizadas"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Padrão de cada perfil" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes("/admin/permission-matrix"),
        ),
    ).toBe(false);
  });

  it("creates a user with job title and adjusted modules, keeping edit inside view", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin((url, init) =>
      init?.method === "POST" && url.endsWith("/admin/users")
        ? {
            ...customUser,
            id: "44444444-4444-4444-8444-444444444444",
            fullName: "Ana Lima",
          }
        : undefined,
    );
    const prompt = vi.spyOn(window, "prompt");
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    await screen.findByRole("button", { name: "Editar Maria Souza" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo usuário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    // Usuário comum novo começa sem nenhum módulo (T055: acabaram os padrões por perfil).
    const type = within(dialog).getByLabelText("Tipo");
    expect(type).toHaveValue("user");
    expect(
      within(type)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Admin", "Usuário comum"]);
    expect(within(dialog).queryByLabelText("Perfil")).not.toBeInTheDocument();
    for (const module of [
      "Agenda",
      "Turmas",
      "Clientes",
      "Planos e sessões",
      "CRM comercial",
      "Contatos sugeridos",
      "Comunicações",
      "Contratos",
      "Prontuários",
      "Financeiro",
      "Relatórios",
      "Configurações",
    ]) {
      expect(
        within(dialog).getByLabelText(`${module}: Visualizar módulo`),
      ).not.toBeChecked();
      expect(
        within(dialog).getByLabelText(`Selecionar bloco ${module}`),
      ).not.toBeChecked();
    }
    expect(
      within(dialog).queryByRole("button", {
        name: "Restaurar padrão do perfil",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Padrão do perfil/),
    ).not.toBeInTheDocument();

    // Marcar Editar marca Ver; desmarcar Ver desmarca Editar.
    fireEvent.click(
      within(dialog).getByLabelText("Selecionar bloco Relatórios"),
    );
    expect(
      within(dialog).getByLabelText("Relatórios: Visualizar módulo"),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByLabelText("Relatórios: Visualizar módulo"),
    );
    expect(
      within(dialog).getByLabelText("Selecionar bloco Relatórios"),
    ).not.toBeChecked();
    fireEvent.click(within(dialog).getByLabelText("Turmas: Visualizar módulo"));

    // Admin: acesso total, sem checkboxes nem cópia; voltar a usuário comum mantém o que estava marcado.
    fireEvent.change(type, { target: { value: "admin" } });
    expect(within(dialog).getByText(/Acesso total/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Clientes: Visualizar módulo"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Copiar permissões de…"),
    ).not.toBeInTheDocument();
    fireEvent.change(type, { target: { value: "user" } });
    expect(
      within(dialog).getByLabelText("Turmas: Visualizar módulo"),
    ).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText("Turmas: Visualizar módulo"));
    fireEvent.click(within(dialog).getByLabelText("Selecionar bloco Agenda"));
    fireEvent.click(within(dialog).getByLabelText("Selecionar bloco Clientes"));
    fireEvent.click(
      within(dialog).getByLabelText("Planos e sessões: Visualizar módulo"),
    );
    fireEvent.click(
      within(dialog).getByLabelText("Prontuários: Visualizar módulo"),
    );

    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Ana Lima" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "ana@movimenta.local" },
    });
    fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
      target: { value: "Aa1" },
    });
    expect(within(dialog).getByLabelText("Senha inicial")).not.toHaveAttribute(
      "minlength",
    );
    fireEvent.change(within(dialog).getByLabelText("Cargo"), {
      target: { value: " Fisioterapeuta pélvica " },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    expect(
      await screen.findByText("Usuário Ana Lima criado."),
    ).toBeInTheDocument();
    const { url, body } = lastCall("POST");
    expect(url).toContain("/admin/users");
    expect(body).toEqual({
      fullName: "Ana Lima",
      email: "ana@movimenta.local",
      password: "Aa1",
      role: "user",
      jobTitle: "Fisioterapeuta pélvica",
      permissions: togglePermissions(
        [],
        [
          ...permissionCatalog
            .filter((item) => ["agenda", "patients"].includes(item.module))
            .map((item) => item.key),
          "plans.view",
          "clinical.view",
        ],
        true,
      ),
    });
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it("copies permissions from another common user when creating, still editable before saving", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (url, init) =>
        init?.method === "POST" && url.endsWith("/admin/users")
          ? {
              ...carlaUser,
              id: "44444444-4444-4444-8444-444444444444",
              fullName: "Ana Lima",
            }
          : undefined,
      [adminUser, customUser, carlaUser],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    await screen.findByRole("button", { name: "Editar Maria Souza" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo usuário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    const copy = within(dialog).getByLabelText("Copiar permissões de…");
    // Só usuários comuns: o admin não entra na lista (ele não tem módulos marcados).
    expect(
      within(copy)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Escolha um usuário", "Maria Souza", "Carla Reis"]);
    fireEvent.change(copy, { target: { value: carlaUser.id } });
    expect(
      within(dialog).getByText(/Permissões copiadas de Carla Reis/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText("Agenda: Visualizar módulo"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Selecionar bloco Agenda"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Clientes: Visualizar módulo"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Selecionar bloco Prontuários"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Selecionar bloco Prontuários"),
    ).toHaveProperty("indeterminate", true);
    expect(
      within(dialog).getByLabelText(
        "Prontuários: Gerenciar aparelhos, exercícios e treinos",
      ),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Financeiro: Visualizar módulo"),
    ).not.toBeChecked();
    // Continua editável depois de copiar.
    fireEvent.click(
      within(dialog).getByLabelText("Clientes: Visualizar módulo"),
    );
    fireEvent.click(within(dialog).getByLabelText("Selecionar bloco Agenda"));

    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Ana Lima" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "ana@movimenta.local" },
    });
    fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
      target: { value: "SenhaForte123" },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    expect(
      await screen.findByText("Usuário Ana Lima criado."),
    ).toBeInTheDocument();
    expect(lastCall("POST").body).toEqual({
      fullName: "Ana Lima",
      email: "ana@movimenta.local",
      password: "SenhaForte123",
      role: "user",
      permissions: togglePermissions(
        togglePermissions(
          legacyPermissions(
            "user",
            carlaUser.modules as AppModule[],
            carlaUser.editModules as AppModule[],
          ),
          ["patients.view"],
          false,
        ),
        permissionCatalog
          .filter((item) => item.module === "agenda")
          .map((item) => item.key),
        true,
      ),
    });
    // A pessoa copiada não muda.
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
  });

  it("copies permissions when editing, without listing the user being edited", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (_url, init) => (init?.method === "PATCH" ? customUser : undefined),
      [adminUser, customUser, carlaUser],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Maria Souza" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar Maria Souza" });
    expect(within(dialog).getByLabelText("Cargo")).toHaveValue(
      "Instrutora de Pilates",
    );
    expect(
      within(dialog).getByLabelText("Financeiro: Visualizar módulo"),
    ).toBeChecked();
    const copy = within(dialog).getByLabelText("Copiar permissões de…");
    expect(
      within(copy).queryByRole("option", { name: "Maria Souza" }),
    ).not.toBeInTheDocument();
    fireEvent.change(copy, { target: { value: carlaUser.id } });
    expect(
      within(dialog).getByLabelText("Financeiro: Visualizar módulo"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Selecionar bloco Prontuários"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Selecionar bloco Prontuários"),
    ).toHaveProperty("indeterminate", true);
    fireEvent.click(within(dialog).getByLabelText("Selecionar bloco Clientes"));
    fireEvent.change(within(dialog).getByLabelText("Cargo"), {
      target: { value: "" },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    expect(
      await screen.findByText("Alterações de Maria Souza salvas."),
    ).toBeInTheDocument();
    const { url, body } = lastCall("PATCH");
    expect(url).toContain(`/admin/users/${customUser.id}`);
    expect(body).toEqual({
      fullName: "Maria Souza",
      role: "user",
      active: true,
      jobTitle: "",
      permissions: togglePermissions(
        legacyPermissions(
          "user",
          carlaUser.modules as AppModule[],
          carlaUser.editModules as AppModule[],
        ),
        permissionCatalog
          .filter((item) => item.module === "patients")
          .map((item) => item.key),
        true,
      ),
    });
  });

  it("shows full access for an admin and starts unchecked when demoting to common user", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(undefined, [adminUser, customUser]);
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Aryana Dutra" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar Aryana Dutra" });
    expect(within(dialog).getByLabelText("Tipo")).toHaveValue("admin");
    expect(within(dialog).getByText(/Acesso total/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Agenda: Visualizar módulo"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Tipo"), {
      target: { value: "user" },
    });
    expect(
      within(dialog).getByLabelText("Agenda: Visualizar módulo"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Configurações: Visualizar módulo"),
    ).not.toBeChecked();
  });

  it("explains in the form that the last admin cannot be demoted", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (_url, init) =>
        init?.method === "PATCH" ? lastAdminConflict : undefined,
      [adminUser, customUser],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Aryana Dutra" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar Aryana Dutra" });
    fireEvent.change(within(dialog).getByLabelText("Tipo"), {
      target: { value: "user" },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    expect(
      await within(dialog).findByText(/precisa de pelo menos um admin ativo/),
    ).toHaveClass("form-error");
    expect(lastCall("PATCH").body).toMatchObject({
      role: "user",
      permissions: [],
    });
    expect(
      screen.getByRole("dialog", { name: "Editar Aryana Dutra" }),
    ).toBeInTheDocument();
  });

  it("explains in the modal that the last admin cannot be deactivated", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (_url, init) =>
        init?.method === "PATCH" ? lastAdminConflict : undefined,
      [adminUser],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(await screen.findByRole("button", { name: "Desativar" }));
    const dialog = screen.getByRole("dialog", { name: "Desativar usuário" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Desativar" }));
    expect(
      await within(dialog).findByText(/precisa de pelo menos um admin ativo/),
    ).toHaveClass("form-error");
    expect(lastCall("PATCH").body).toEqual({
      fullName: "Aryana Dutra",
      role: "admin",
      active: false,
    });
  });

  it("sends custom lists when editing permissions of an existing user", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin((_url, init) =>
      init?.method === "PATCH" ? customUser : undefined,
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Maria Souza" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar Maria Souza" });
    fireEvent.click(
      within(dialog).getByLabelText("Selecionar bloco Financeiro"),
    );
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    await screen.findByText("Alterações de Maria Souza salvas.");
    expect(lastCall("PATCH").body).toEqual({
      fullName: "Maria Souza",
      role: "user",
      active: true,
      jobTitle: "Instrutora de Pilates",
      permissions: togglePermissions(
        legacyPermissions(
          "user",
          customUser.modules as AppModule[],
          customUser.editModules as AppModule[],
        ),
        permissionCatalog
          .filter((item) => item.module === "finance")
          .map((item) => item.key),
        true,
      ),
    });
  });

  it("resets a password and deactivates a user in modals instead of browser prompts", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin((url, init) => {
      if (url.endsWith("/reset-password")) return { updated: true };
      if (init?.method === "PATCH") return { ...customUser, active: false };
      return undefined;
    });
    const prompt = vi.spyOn(window, "prompt");
    const confirm = vi.spyOn(window, "confirm");
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Redefinir senha" }),
    );
    const resetDialog = screen.getByRole("dialog", { name: "Redefinir senha" });
    fireEvent.change(within(resetDialog).getByLabelText("Nova senha"), {
      target: { value: "Bb2" },
    });
    expect(
      within(resetDialog).getByLabelText("Nova senha"),
    ).not.toHaveAttribute("minlength");
    fireEvent.submit(
      within(resetDialog).getByLabelText("Nova senha").closest("form")!,
    );
    expect(
      await screen.findByText("Senha de Maria Souza redefinida."),
    ).toBeInTheDocument();
    const reset = lastCall("POST");
    expect(reset.url).toContain(`/admin/users/${customUser.id}/reset-password`);
    expect(reset.body).toEqual({ password: "Bb2" });

    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    const activeDialog = screen.getByRole("dialog", {
      name: "Desativar usuário",
    });
    fireEvent.click(
      within(activeDialog).getByRole("button", { name: "Desativar" }),
    );
    expect(
      await screen.findByText("Maria Souza foi desativado(a)."),
    ).toBeInTheDocument();
    expect(lastCall("PATCH").body).toEqual({
      fullName: "Maria Souza",
      role: "user",
      active: false,
    });
    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    prompt.mockRestore();
    confirm.mockRestore();
  });

  describe("commission per user", () => {
    const pilatesId = "66666666-6666-4666-8666-666666666666";
    const takenId = "77777777-7777-4777-8777-777777777777";
    const professional = (id: string, fullName: string) => ({
      id,
      clinicId: customUser.clinicId,
      fullName,
      crefito: "CREF 1234",
      specialty: "Pilates",
      color: "#336699",
      active: true,
    });
    const otherUser = {
      ...customUser,
      id: "88888888-8888-4888-8888-888888888888",
      fullName: "Bruno Lima",
      email: "bruno@movimenta.local",
      customModules: false,
      professionalId: takenId,
      professionalName: "Bruno Lima (agenda)",
      commissionPercentage: 35,
      commissionEffectiveFrom: "2026-01-01",
    };
    const conflict = (code: string, message: string) =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ code, message }),
      }) as Response;

    function mockCommission(
      handler: (url: string, init?: RequestInit) => unknown,
      options: { professionalsFail?: boolean } = {},
    ) {
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const handled = handler(url, init);
        if (
          handled &&
          typeof handled === "object" &&
          "ok" in handled &&
          (handled as Response).ok === false
        )
          return handled as Response;
        if (handled !== undefined)
          return {
            ok: true,
            status: 200,
            json: async () => handled,
          } as Response;
        if (url.endsWith("/professionals") && options.professionalsFail)
          return {
            ok: false,
            status: 500,
            json: async () => ({
              code: "BOOM",
              message: "Falha ao listar profissionais.",
            }),
          } as Response;
        const body = url.endsWith("/professionals")
          ? [
              professional(pilatesId, "Maria Pilates"),
              professional(takenId, "Bruno Lima (agenda)"),
            ]
          : url.includes("/admin/users")
            ? [customUser, otherUser]
            : url.includes("/admin/permission-matrix")
              ? []
              : url.includes("/relationship/settings")
                ? relationshipSettingsFixture()
                : url.includes("/admin/clinic-settings")
                  ? null
                  : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
    }

    async function openEditor(name = "Maria Souza") {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      await openSettingsSection("Usuários");
      fireEvent.click(
        await screen.findByRole("button", { name: `Editar ${name}` }),
      );
      return screen.getByRole("dialog", { name: `Editar ${name}` });
    }

    const writes = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([, init]) => init?.method && init.method !== "GET")
        .map(([input, init]) => ({
          method: init!.method!,
          url: String(input),
          body: JSON.parse(String(init!.body)) as Record<string, unknown>,
        }));
    const futureLabel = (iso: string) =>
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
      }).format(new Date(`${iso}T12:00:00`));

    it("shows the linked professional and current percentage in the user list", async () => {
      mockCommission(() => undefined);
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      const section = await openSettingsSection("Usuários");
      expect(
        await within(section).findByText(
          "Agenda: Bruno Lima (agenda) · Comissão 35%",
        ),
      ).toBeInTheDocument();
      // A comissão não depende mais do profissional ligado: os dois aparecem sempre.
      expect(
        within(section).getByText(
          "Sem profissional da agenda · Sem comissão vigente",
        ),
      ).toBeInTheDocument();
    });

    it("creates a user with commission in the POST body and links the professional in the same click", async () => {
      const created = {
        ...customUser,
        id: "44444444-4444-4444-8444-444444444444",
        fullName: "Ana Lima",
        commissionPercentage: 25,
        commissionEffectiveFrom: saoPauloToday(),
      };
      mockCommission((url, init) => {
        if (init?.method === "POST" && url.endsWith("/admin/users"))
          return created;
        if (init?.method === "PUT" && url.endsWith("/professional"))
          return {
            ...created,
            professionalId: pilatesId,
            professionalName: "Maria Pilates",
          };
        return undefined;
      });
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      await openSettingsSection("Usuários");
      await screen.findByRole("button", { name: "Editar Maria Souza" });
      fireEvent.click(
        await screen.findByRole("button", { name: "Novo usuário" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
      expect(within(dialog).getByLabelText("Comissão (%)")).toHaveValue(null);
      expect(within(dialog).getByLabelText("Vale a partir de")).toHaveValue(
        saoPauloToday(),
      );
      expect(
        within(dialog).getByText(/para contar os atendimentos desta pessoa/),
      ).toBeInTheDocument();
      const select = await within(dialog).findByLabelText(
        /Profissional da agenda/,
      );
      // Livres: o profissional já ligado a outro usuário não aparece.
      expect(
        within(select).getByRole("option", { name: "Nenhum" }),
      ).toBeInTheDocument();
      expect(
        within(select).queryByRole("option", { name: "Bruno Lima (agenda)" }),
      ).not.toBeInTheDocument();
      // Sem passos separados.
      expect(
        within(dialog).queryByRole("button", { name: "Salvar comissão" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Salvar profissional" }),
      ).not.toBeInTheDocument();

      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Ana Lima" },
      });
      fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
        target: { value: "ana@movimenta.local" },
      });
      fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
        target: { value: "SenhaForte123" },
      });
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      fireEvent.change(select, { target: { value: pilatesId } });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Criar usuário" }),
      );
      expect(
        await screen.findByText("Usuário Ana Lima criado."),
      ).toBeInTheDocument();
      const sent = writes();
      expect(sent.map((item) => item.method)).toEqual(["POST", "PUT"]);
      expect(sent[0]!.body).toEqual({
        fullName: "Ana Lima",
        email: "ana@movimenta.local",
        password: "SenhaForte123",
        role: "user",
        permissions: [],
        commission: { percentage: 25, effectiveFrom: saoPauloToday() },
      });
      expect(sent[1]!.url).toContain(`/admin/users/${created.id}/professional`);
      expect(sent[1]!.body).toEqual({ professionalId: pilatesId });
    });

    it("creates a user without commission or professional with only the POST", async () => {
      mockCommission((url, init) =>
        init?.method === "POST" && url.endsWith("/admin/users")
          ? {
              ...customUser,
              id: "44444444-4444-4444-8444-444444444444",
              fullName: "Ana Lima",
            }
          : undefined,
      );
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      await openSettingsSection("Usuários");
      await screen.findByRole("button", { name: "Editar Maria Souza" });
      fireEvent.click(
        await screen.findByRole("button", { name: "Novo usuário" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
      await within(dialog).findByLabelText(/Profissional da agenda/);
      // O que falta fica listado e ligado ao botão desativado (QM14).
      const createUser = within(dialog).getByRole("button", {
        name: "Criar usuário",
      });
      expect(createUser).toBeDisabled();
      expect(createUser).toHaveAccessibleDescription(
        "Falta: Nome completo (pelo menos 3 caracteres), E-mail de acesso, Senha inicial.",
      );
      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Ana Lima" },
      });
      fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
        target: { value: "ana@movimenta.local" },
      });
      expect(createUser).toHaveAccessibleDescription("Falta: Senha inicial.");
      fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
        target: { value: "SenhaForte123" },
      });
      expect(createUser).toBeEnabled();
      expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Criar usuário" }),
      );
      expect(
        await screen.findByText("Usuário Ana Lima criado."),
      ).toBeInTheDocument();
      expect(writes().map((item) => item.method)).toEqual(["POST"]);
      expect(writes()[0]!.body).not.toHaveProperty("commission");
    });

    it("edits only the commission: PATCH and then PUT with the new rule", async () => {
      const withRule = {
        ...otherUser,
        commissionPercentage: 40,
        commissionEffectiveFrom: saoPauloToday(),
      };
      mockCommission((_url, init) => {
        if (init?.method === "PATCH") return otherUser;
        if (init?.method === "PUT") return withRule;
        return undefined;
      });
      const dialog = await openEditor("Bruno Lima");
      expect(within(dialog).getByLabelText("Comissão (%)")).toHaveValue(35);
      expect(
        within(dialog).getByText(/Vigente hoje: 35% desde/),
      ).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "40" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Bruno Lima salvas."),
      ).toBeInTheDocument();
      const sent = writes();
      expect(sent.map((item) => item.method)).toEqual(["PATCH", "PUT"]);
      expect(sent[0]!.url).toContain(`/admin/users/${otherUser.id}`);
      expect(sent[0]!.body).not.toHaveProperty("commission");
      expect(sent[1]!.url).toContain(`/admin/users/${otherUser.id}/commission`);
      expect(sent[1]!.body).toEqual({
        percentage: 40,
        effectiveFrom: saoPauloToday(),
      });
    });

    it("edits without touching commission or professional with only the PATCH", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH" ? otherUser : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      expect(
        await within(dialog).findByLabelText(/Profissional da agenda/),
      ).toHaveValue(takenId);
      fireEvent.change(within(dialog).getByLabelText("Cargo"), {
        target: { value: "Instrutor" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Bruno Lima salvas."),
      ).toBeInTheDocument();
      expect(writes().map((item) => item.method)).toEqual(["PATCH"]);
    });

    it("keeps what was saved when the commission fails after the PATCH, and retries only what is left", async () => {
      let attempt = 0;
      const renamed = { ...otherUser, fullName: "Bruno Lima Souza" };
      mockCommission((_url, init) => {
        if (init?.method === "PATCH") return renamed;
        if (init?.method === "PUT") {
          attempt += 1;
          return attempt === 1
            ? conflict(
                "COMMISSION_RULE_DUPLICATE",
                "Já existe uma regra com essa data.",
              )
            : { ...renamed, commissionPercentage: 20 };
        }
        return undefined;
      });
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Bruno Lima Souza" },
      });
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "20" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      const message = await screen.findByText(
        /Dados do usuário salvos, mas a comissão não foi salva: Já existe uma regra com essa data\./,
      );
      expect(message).toHaveClass("form-error");
      // O formulário continua aberto com o que foi digitado, e a lista já mostra o que foi salvo.
      const open = screen.getByRole("dialog", {
        name: "Editar Bruno Lima Souza",
      });
      expect(within(open).getByLabelText("Comissão (%)")).toHaveValue(20);
      const section = screen
        .getByRole("heading", { name: "Usuários" })
        .closest("section")!;
      expect(within(section).getByText("Bruno Lima Souza")).toBeInTheDocument();

      fireEvent.change(within(open).getByLabelText("Vale a partir de"), {
        target: { value: "2099-02-01" },
      });
      fireEvent.click(
        within(open).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Bruno Lima Souza salvas."),
      ).toBeInTheDocument();
      const sent = writes();
      expect(sent.map((item) => item.method)).toEqual([
        "PATCH",
        "PUT",
        "PATCH",
        "PUT",
      ]);
      expect(sent[3]!.body).toEqual({
        percentage: 20,
        effectiveFrom: "2099-02-01",
      });
    });

    it("keeps the created user when linking the professional fails, retrying with PATCH instead of a new POST", async () => {
      const created = {
        ...customUser,
        id: "44444444-4444-4444-8444-444444444444",
        fullName: "Ana Lima",
        email: "ana@movimenta.local",
      };
      let attempt = 0;
      mockCommission((url, init) => {
        if (init?.method === "POST" && url.endsWith("/admin/users"))
          return created;
        if (init?.method === "PATCH") return created;
        if (init?.method === "PUT" && url.endsWith("/professional")) {
          attempt += 1;
          return attempt === 1
            ? conflict(
                "PROFESSIONAL_ALREADY_LINKED",
                "Este profissional já está ligado a outro usuário.",
              )
            : { ...created, professionalId: pilatesId };
        }
        return undefined;
      });
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      await openSettingsSection("Usuários");
      await screen.findByRole("button", { name: "Editar Maria Souza" });
      fireEvent.click(
        await screen.findByRole("button", { name: "Novo usuário" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Ana Lima" },
      });
      fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
        target: { value: "ana@movimenta.local" },
      });
      fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
        target: { value: "SenhaForte123" },
      });
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "10" },
      });
      fireEvent.change(
        await within(dialog).findByLabelText(/Profissional da agenda/),
        { target: { value: pilatesId } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Criar usuário" }),
      );
      expect(
        await screen.findByText(
          /Usuário Ana Lima criado, mas a ligação com o profissional da agenda não foi salva/,
        ),
      ).toHaveClass("form-error");
      const open = screen.getByRole("dialog", { name: "Editar Ana Lima" });
      fireEvent.click(
        within(open).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Usuário Ana Lima criado."),
      ).toBeInTheDocument();
      // A comissão foi no POST: não é reenviada (evita vigência repetida).
      expect(
        writes().map(
          (item) => `${item.method} ${item.url.split("/admin/users").at(-1)}`,
        ),
      ).toEqual([
        "POST ",
        `PUT /${created.id}/professional`,
        `PATCH /${created.id}`,
        `PUT /${created.id}/professional`,
      ]);
    });

    it("corrects the percentage on the same start date of the current period", async () => {
      const createdToday = {
        ...otherUser,
        commissionPercentage: 20,
        commissionEffectiveFrom: saoPauloToday(),
      };
      const corrected = { ...createdToday, commissionPercentage: 25 };
      let corrections = 0;
      mockCommission((url, init) => {
        if (init?.method === "PATCH") return createdToday;
        if (init?.method === "PUT") {
          corrections += 1;
          return corrected;
        }
        if (url.endsWith("/admin/users"))
          return [customUser, corrections ? corrected : createdToday];
        return undefined;
      });
      const dialog = await openEditor("Bruno Lima");
      expect(
        within(dialog).queryByText("Vai corrigir o percentual desta vigência."),
      ).not.toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      expect(
        within(dialog).getByText("Vai corrigir o percentual desta vigência."),
      ).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Bruno Lima salvas."),
      ).toBeInTheDocument();
      expect(lastCall("PUT").body).toEqual({
        percentage: 25,
        effectiveFrom: saoPauloToday(),
      });
      const section = screen
        .getByRole("heading", { name: "Usuários" })
        .closest("section")!;
      expect(
        await within(section).findByText(
          "Agenda: Bruno Lima (agenda) · Comissão 25%",
        ),
      ).toBeInTheDocument();
    });

    it("shows in the form why a used commission period cannot be corrected", async () => {
      const createdToday = {
        ...otherUser,
        commissionPercentage: 20,
        commissionEffectiveFrom: saoPauloToday(),
      };
      const message =
        "Esta comissão já foi usada em lançamentos; escolha outra data de início.";
      mockCommission((url, init) => {
        if (init?.method === "PATCH") return createdToday;
        if (init?.method === "PUT")
          return conflict("COMMISSION_RULE_DUPLICATE", message);
        if (url.endsWith("/admin/users")) return [customUser, createdToday];
        return undefined;
      });
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      const error = await screen.findByText(
        new RegExp(message.replace(/[.;]/g, "\\$&")),
      );
      expect(error).toHaveClass("form-error");
      expect(
        screen.getByRole("dialog", { name: "Editar Bruno Lima" }),
      ).toBeInTheDocument();
    });

    it("warns that the current percentage keeps applying when the start date is in the future", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH" || init?.method === "PUT"
          ? otherUser
          : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      expect(within(dialog).queryByText(/Data futura/)).not.toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "40" },
      });
      fireEvent.change(within(dialog).getByLabelText("Vale a partir de"), {
        target: { value: "2099-01-01" },
      });
      expect(
        within(dialog).getByText(
          `Data futura: o percentual atual (35%) continua valendo até ${futureLabel("2099-01-01")}.`,
        ),
      ).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Bruno Lima salvas."),
      ).toBeInTheDocument();
      expect(lastCall("PUT").body).toEqual({
        percentage: 40,
        effectiveFrom: "2099-01-01",
      });
    });

    it("links and unlinks the professional with the same save button", async () => {
      const linked = {
        ...customUser,
        professionalId: pilatesId,
        professionalName: "Maria Pilates",
      };
      mockCommission((url, init) => {
        if (init?.method === "PATCH")
          return url.includes(otherUser.id) ? otherUser : customUser;
        if (init?.method === "PUT" && url.endsWith("/professional"))
          return linked;
        return undefined;
      });
      let dialog = await openEditor();
      const select = await within(dialog).findByLabelText(
        /Profissional da agenda/,
      );
      expect(select).toHaveValue("");
      expect(
        within(select).getByRole("option", { name: "Maria Pilates" }),
      ).toBeInTheDocument();
      expect(
        within(select).queryByRole("option", { name: "Bruno Lima (agenda)" }),
      ).not.toBeInTheDocument();
      fireEvent.change(select, { target: { value: pilatesId } });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(
        await screen.findByText("Alterações de Maria Souza salvas."),
      ).toBeInTheDocument();
      expect(writes().map((item) => item.method)).toEqual(["PATCH", "PUT"]);
      expect(lastCall("PUT").url).toContain(
        `/admin/users/${customUser.id}/professional`,
      );
      expect(lastCall("PUT").body).toEqual({ professionalId: pilatesId });

      // Desligar: "Nenhum" envia null.
      fireEvent.click(
        screen.getByRole("button", { name: "Editar Bruno Lima" }),
      );
      dialog = screen.getByRole("dialog", { name: "Editar Bruno Lima" });
      fireEvent.change(
        await within(dialog).findByLabelText(/Profissional da agenda/),
        { target: { value: "" } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      await vi.waitFor(() =>
        expect(lastCall("PUT").body).toEqual({ professionalId: null }),
      );
      expect(lastCall("PUT").url).toContain(
        `/admin/users/${otherUser.id}/professional`,
      );
    });

    it("lets Enter in the commission fields submit the whole form", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH" || init?.method === "PUT"
          ? otherUser
          : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      const percentage = within(dialog).getByLabelText("Comissão (%)");
      fireEvent.change(within(dialog).getByLabelText("Cargo"), {
        target: { value: "Instrutor" },
      });
      fireEvent.change(percentage, { target: { value: "45" } });
      // Enter não é mais consumido por uma seção à parte: segue o envio padrão do formulário.
      expect(fireEvent.keyDown(percentage, { key: "Enter" })).toBe(true);
      expect(
        fireEvent.keyDown(within(dialog).getByLabelText("Vale a partir de"), {
          key: "Enter",
        }),
      ).toBe(true);
      expect(percentage.closest("form")).toBe(
        within(dialog).getByLabelText("Nome completo").closest("form"),
      );
      expect(
        within(dialog).queryByRole("button", { name: "Salvar comissão" }),
      ).not.toBeInTheDocument();
      fireEvent.submit(percentage.closest("form")!);
      expect(
        await screen.findByText("Alterações de Bruno Lima salvas."),
      ).toBeInTheDocument();
      const sent = writes();
      expect(sent.map((item) => item.method)).toEqual(["PATCH", "PUT"]);
      expect(sent[0]!.body).toMatchObject({ jobTitle: "Instrutor" });
      expect(sent[1]!.body).toEqual({
        percentage: 45,
        effectiveFrom: saoPauloToday(),
      });
    });

    it("validates the commission before saving anything", async () => {
      mockCommission(() => undefined);
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "" },
      });
      // Comissão em branco é falta: Salvar desativado dizendo o que fazer (QM14).
      const saveUser = within(dialog).getByRole("button", {
        name: "Salvar alterações",
      });
      expect(saveUser).toBeDisabled();
      expect(saveUser).toHaveAccessibleDescription(
        "Falta: Comissão (%) — para não pagar comissão, informe 0%.",
      );
      // 120 já é barrado pelo navegador (max=100); o envio direto também é validado.
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "120" },
      });
      fireEvent.submit(
        within(dialog).getByLabelText("Nome completo").closest("form")!,
      );
      expect(
        await within(dialog).findByText(
          "Informe um percentual de comissão entre 0 e 100.",
        ),
      ).toHaveClass("form-error");
      expect(writes()).toHaveLength(0);
    });

    it("shows loading and error states for the professionals list without blocking the commission", async () => {
      mockCommission(() => undefined, { professionalsFail: true });
      const dialog = await openEditor();
      expect(dialog.querySelector(".loading-block")).not.toBeNull();
      expect(
        await within(dialog).findByText(/Falha ao listar profissionais\./),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Comissão (%)")).toBeEnabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
      fireEvent.click(screen.getByRole("button", { name: "Novo usuário" }));
      const created = screen.getByRole("dialog", { name: "Novo usuário" });
      expect(
        within(created).getByLabelText("Comissão (%)"),
      ).toBeInTheDocument();
      expect(
        within(created).queryByText(/Depois de criar o usuário/),
      ).not.toBeInTheDocument();
    });
  });

  it("filters the menu and routes by the user's modules and hides create actions without edit", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Recepção",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["agenda", "patients", "finance"],
        editModules: ["agenda"],
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/dashboard")
        ? {
            appointmentsToday: 0,
            completedToday: 0,
            patientsActive: 1,
            noShowsThisMonth: 0,
            nextAppointments: [],
          }
        : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    expect(
      within(nav).getByRole("link", { name: "Visão geral" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Clientes" }),
    ).toBeInTheDocument();
    // Recepção com Financeiro liberado vê o Financeiro; sem CRM/Turmas/Configurações, eles somem.
    expect(
      within(nav).getByRole("link", { name: "Financeiro" }),
    ).toBeInTheDocument();
    expect(within(nav).queryByText("CRM comercial")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Turmas")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Configurações")).not.toBeInTheDocument();
    // Só consulta em Clientes: sem criar/importar, com explicação.
    expect(
      screen.queryByRole("button", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(moreActionNames()).not.toContain("Importar");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Seu acesso a Clientes é só de consulta",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar cliente" });
    expect(
      within(dialog).queryByRole("button", { name: "Salvar alterações" }),
    ).not.toBeInTheDocument();
    cleanup();

    // Rota de módulo não liberado volta para a visão geral.
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: /^Olá/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "CRM comercial" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/leads")),
    ).toBe(false);
  });

  it("completes an old stored session without modules using /me", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const fresh = {
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Joana Recepção",
      email: "recepcao@movimenta.local",
      ...legacyAccess("reception"),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).endsWith("/me") ? withPermissions(fresh) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Novo cliente" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation")).getByRole("link", {
        name: "CRM comercial",
      }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("crm.auth.user")!)).toEqual(
      withPermissions(fresh),
    );
  });

  it("asks for a new login when an old stored session cannot be completed", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({
            code: "UNAUTHORIZED",
            message: "Sessão expirada.",
          }),
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Acesse sua clínica" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("crm.auth.user")).toBeNull();
  });

  it("refreshes a session stored before T055 with role owner and lists, reaching the administration", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    // Sessão gravada antes do deploy: perfil antigo, mas já com listas de módulos.
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
        modules: effectiveModules("admin"),
        editModules: effectiveEditModules("admin"),
      }),
    );
    const fresh = {
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      ...legacyAccess("admin"),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/me")
        ? withPermissions(fresh)
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : url.includes("/admin/clinic-settings")
            ? null
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("tab", { name: "Usuários" }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).endsWith("/me")),
    ).toBe(true);
    expect(JSON.parse(localStorage.getItem("crm.auth.user")!)).toMatchObject({
      role: "admin",
    });
    expect(screen.getByTitle("Sair")).toHaveTextContent("Admin");
  });

  it("refreshes a session stored before T055 with role reception and lists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
        ...legacyProfiles.reception,
      }),
    );
    const fresh = {
      id: "33333333-3333-4333-8333-333333333333",
      fullName: "Joana Recepção",
      email: "recepcao@movimenta.local",
      ...legacyAccess("reception"),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).endsWith("/me") ? withPermissions(fresh) : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Novo cliente" }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).endsWith("/me")),
    ).toBe(true);
    expect(JSON.parse(localStorage.getItem("crm.auth.user")!)).toEqual(
      withPermissions(fresh),
    );
    expect(screen.getByTitle("Sair")).toHaveTextContent("Usuário comum");
  });
});
