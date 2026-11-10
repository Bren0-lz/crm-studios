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
  waitFor,
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
      within(row("Elisa Prado")).getByText("Vê 1 módulo · 8 permissões"),
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
        within(dialog).getByLabelText(new RegExp(`^${module}: Acessar `)),
      ).not.toBeChecked();
      expect(
        within(dialog).getByLabelText(`Marcar todas de ${module}`),
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
      within(dialog).getByLabelText("Marcar todas de Relatórios"),
    );
    expect(
      within(dialog).getByLabelText("Relatórios: Acessar os relatórios"),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByLabelText("Relatórios: Acessar os relatórios"),
    );
    expect(
      within(dialog).getByLabelText("Marcar todas de Relatórios"),
    ).not.toBeChecked();
    fireEvent.click(within(dialog).getByLabelText("Turmas: Acessar as turmas"));

    // Admin: acesso total, sem checkboxes nem cópia; voltar a usuário comum mantém o que estava marcado.
    fireEvent.change(type, { target: { value: "admin" } });
    expect(within(dialog).getByText(/Acesso total/)).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Clientes: Acessar os clientes"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Copiar permissões de…"),
    ).not.toBeInTheDocument();
    fireEvent.change(type, { target: { value: "user" } });
    expect(
      within(dialog).getByLabelText("Turmas: Acessar as turmas"),
    ).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText("Turmas: Acessar as turmas"));
    fireEvent.click(within(dialog).getByLabelText("Marcar todas de Agenda"));
    fireEvent.click(within(dialog).getByLabelText("Marcar todas de Clientes"));
    fireEvent.click(
      within(dialog).getByLabelText(
        "Planos e sessões: Acessar planos e sessões",
      ),
    );
    fireEvent.click(
      within(dialog).getByLabelText("Prontuários: Acessar os prontuários"),
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

  it("accepts a simple initial password, without uppercase or numbers", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (url, init) =>
        init?.method === "POST" && url.endsWith("/admin/users")
          ? {
              ...customUser,
              id: "55555555-5555-4555-8555-555555555555",
              fullName: "Breno Luiz",
            }
          : undefined,
      [adminUser, customUser],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo usuário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Breno Luiz" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "breno@movimenta.local" },
    });
    fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
      target: { value: "senhafraca" },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nome completo").closest("form")!,
    );
    expect(
      await screen.findByText("Usuário Breno Luiz criado."),
    ).toBeInTheDocument();
    expect(lastCall("POST").body).toMatchObject({ password: "senhafraca" });
  });

  it("saves the user's WhatsApp on create and only sends it on edit when it changes", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    const withWhatsapp = { ...customUser, whatsapp: "11988887777" };
    mockAdmin(
      (url, init) =>
        init?.method === "POST" && url.endsWith("/admin/users")
          ? {
              ...customUser,
              id: "66666666-6666-4666-8666-666666666666",
              fullName: "Breno Luiz",
            }
          : init?.method === "PATCH"
            ? withWhatsapp
            : undefined,
      [adminUser, withWhatsapp],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo usuário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Breno Luiz" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "breno@movimenta.local" },
    });
    fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
      target: { value: "senha" },
    });
    const whatsapp = within(dialog).getByLabelText("WhatsApp");
    fireEvent.change(whatsapp, { target: { value: "2199887" } });
    fireEvent.submit(whatsapp.closest("form")!);
    expect(
      await within(dialog).findByText(/Informe o WhatsApp com DDD/),
    ).toHaveClass("form-error");
    fireEvent.change(whatsapp, { target: { value: "21998877665" } });
    expect(whatsapp).toHaveValue("(21) 99887-7665");
    fireEvent.submit(whatsapp.closest("form")!);
    expect(
      await screen.findByText("Usuário Breno Luiz criado."),
    ).toBeInTheDocument();
    expect(lastCall("POST").body).toMatchObject({ whatsapp: "21998877665" });

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Maria Souza" }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar Maria Souza" });
    expect(within(edit).getByLabelText("WhatsApp")).toHaveValue(
      "(11) 98888-7777",
    );
    fireEvent.submit(within(edit).getByLabelText("WhatsApp").closest("form")!);
    expect(
      await screen.findByText("Alterações de Maria Souza salvas."),
    ).toBeInTheDocument();
    expect(lastCall("PATCH").body).not.toHaveProperty("whatsapp");
  });

  it("marks agenda professionals without WhatsApp in the user list", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    const professionalLink = (id: string, name: string) => ({
      professionalId: id,
      professionalName: name,
    });
    mockAdmin(undefined, [
      adminUser,
      { ...customUser, ...professionalLink("p1", "Maria Souza") },
      {
        ...carlaUser,
        whatsapp: "11988887777",
        ...professionalLink("p2", "Carla Reis"),
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/configuracoes?secao=usuarios"]}>
        <App />
      </MemoryRouter>,
    );
    const maria = (await screen.findByText("Maria Souza")).closest("article")!;
    expect(within(maria).getByText("Sem WhatsApp")).toHaveClass("status-pill");
    // Com WhatsApp, ou sem profissional da agenda (admin), não há selo.
    const carla = screen.getByText("Carla Reis").closest("article")!;
    expect(within(carla).queryByText("Sem WhatsApp")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sem WhatsApp")).toHaveLength(1);
  });

  it("grants the sales dashboard access, also to an admin, sending it only when it changes", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    mockAdmin(
      (_url, init) =>
        init?.method === "PATCH"
          ? { ...adminUser, dashboardAccess: true }
          : undefined,
      [adminUser],
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
    const edit = screen.getByRole("dialog", { name: "Editar Aryana Dutra" });
    // Admin tem acesso total ao CRM, mas o painel de vendas começa desmarcado.
    const access = within(edit).getByRole("checkbox", {
      name: "Acessa o painel de vendas",
    });
    expect(access).not.toBeChecked();
    fireEvent.submit(access.closest("form")!);
    expect(
      await screen.findByText("Alterações de Aryana Dutra salvas."),
    ).toBeInTheDocument();
    expect(lastCall("PATCH").body).not.toHaveProperty("dashboardAccess");

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Aryana Dutra" }),
    );
    const again = screen.getByRole("dialog", { name: "Editar Aryana Dutra" });
    fireEvent.click(
      within(again).getByRole("checkbox", {
        name: "Acessa o painel de vendas",
      }),
    );
    fireEvent.submit(
      within(again)
        .getByRole("checkbox", { name: "Acessa o painel de vendas" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(lastCall("PATCH").body).toMatchObject({ dashboardAccess: true }),
    );
  });

  it("marks on the user who receives a salary and how much, sending it only when it changes", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(ownerSession));
    const salaried = { ...customUser, salaryInCents: 180000 };
    mockAdmin(
      (url, init) =>
        init?.method === "POST" && url.endsWith("/admin/users")
          ? {
              ...salaried,
              id: "66666666-6666-4666-8666-666666666666",
              fullName: "Breno Luiz",
            }
          : init?.method === "PATCH"
            ? { ...customUser }
            : undefined,
      [adminUser, salaried],
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo usuário" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Breno Luiz" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "breno@movimenta.local" },
    });
    fireEvent.change(within(dialog).getByLabelText("Senha inicial"), {
      target: { value: "senha" },
    });
    const receives = within(dialog).getByRole("checkbox", {
      name: "Recebe salário",
    });
    expect(receives).not.toBeChecked();
    expect(
      within(dialog).queryByLabelText("Salário mensal (R$)"),
    ).not.toBeInTheDocument();
    fireEvent.click(receives);
    // Marcado sem valor: o salário falta.
    expect(
      within(dialog).getByRole("button", { name: "Criar usuário" }),
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Salário mensal (R$)"), {
      target: { value: "1800,00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar usuário" }),
    );
    expect(
      await screen.findByText("Usuário Breno Luiz criado."),
    ).toBeInTheDocument();
    expect(lastCall("POST").body).toMatchObject({ salaryInCents: 180000 });

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Maria Souza" }),
    );
    const edit = screen.getByRole("dialog", { name: "Editar Maria Souza" });
    expect(
      within(edit).getByRole("checkbox", { name: "Recebe salário" }),
    ).toBeChecked();
    expect(within(edit).getByLabelText("Salário mensal (R$)")).toHaveValue(
      "1.800,00",
    );
    // Desmarcar tira da folha: envia `null`.
    fireEvent.click(
      within(edit).getByRole("checkbox", { name: "Recebe salário" }),
    );
    fireEvent.click(
      within(edit).getByRole("button", { name: "Salvar alterações" }),
    );
    expect(
      await screen.findByText("Alterações de Maria Souza salvas."),
    ).toBeInTheDocument();
    expect(lastCall("PATCH").body).toMatchObject({ salaryInCents: null });
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
      within(dialog).getByLabelText("Agenda: Acessar a agenda"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Marcar todas de Agenda"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Clientes: Acessar os clientes"),
    ).toBeChecked();
    expect(
      within(dialog).getByLabelText("Marcar todas de Prontuários"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Marcar todas de Prontuários"),
    ).toHaveProperty("indeterminate", true);
    expect(
      within(dialog).getByLabelText(
        "Prontuários: Cadastrar aparelhos, exercícios e treinos",
      ),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Financeiro: Acessar o financeiro"),
    ).not.toBeChecked();
    // Continua editável depois de copiar.
    fireEvent.click(
      within(dialog).getByLabelText("Clientes: Acessar os clientes"),
    );
    fireEvent.click(within(dialog).getByLabelText("Marcar todas de Agenda"));

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
      within(dialog).getByLabelText("Financeiro: Acessar o financeiro"),
    ).toBeChecked();
    const copy = within(dialog).getByLabelText("Copiar permissões de…");
    expect(
      within(copy).queryByRole("option", { name: "Maria Souza" }),
    ).not.toBeInTheDocument();
    fireEvent.change(copy, { target: { value: carlaUser.id } });
    expect(
      within(dialog).getByLabelText("Financeiro: Acessar o financeiro"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Marcar todas de Prontuários"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Marcar todas de Prontuários"),
    ).toHaveProperty("indeterminate", true);
    fireEvent.click(within(dialog).getByLabelText("Marcar todas de Clientes"));
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
      within(dialog).queryByLabelText("Agenda: Acessar a agenda"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Tipo"), {
      target: { value: "user" },
    });
    expect(
      within(dialog).getByLabelText("Agenda: Acessar a agenda"),
    ).not.toBeChecked();
    expect(
      within(dialog).getByLabelText("Configurações: Acessar as configurações"),
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
      within(dialog).getByLabelText("Marcar todas de Financeiro"),
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
    const resetDialog = screen.getByRole("dialog", { name: "Senha de acesso" });
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
      professional: professional(takenId, "Bruno Lima (agenda)"),
      commissionPercentage: 35,
      commissionEffectiveFrom: "2026-01-01",
    };
    const conflict = (code: string, message: string) =>
      ({
        ok: false,
        status: 409,
        json: async () => ({ code, message }),
      }) as Response;

    const emptyRecalculation = {
      from: saoPauloToday(),
      until: saoPauloToday(),
      items: [],
      differenceInCents: 0,
      adjustmentInCents: 0,
      digest: "b".repeat(64),
    };

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
        // Sem comissão lançada no período: a prévia do recálculo vem vazia.
        if (url.endsWith("/recalculation/preview"))
          return {
            ok: true,
            status: 200,
            json: async () => emptyRecalculation,
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

    // A prévia do recálculo é consulta por POST: não conta como gravação.
    const writes = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, init]) =>
            init?.method &&
            init.method !== "GET" &&
            !String(input).endsWith("/recalculation/preview"),
        )
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

    async function openNew() {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(ownerSession));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      await openSettingsSection("Usuários");
      await screen.findByRole("button", { name: "Editar Maria Souza" });
      fireEvent.click(screen.getByRole("button", { name: "Novo usuário" }));
      const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
      for (const [label, value] of [
        ["Nome completo", "Ana Lima"],
        ["E-mail de acesso", "ana@movimenta.local"],
        ["Senha inicial", "SenhaForte123"],
      ])
        fireEvent.change(within(dialog).getByLabelText(label!), {
          target: { value },
        });
      return dialog;
    }
    const save = (dialog: HTMLElement, name = "Salvar alterações") =>
      fireEvent.click(within(dialog).getByRole("button", { name }));
    async function chooseExisting(dialog: HTMLElement) {
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      fireEvent.change(
        within(dialog).getByLabelText("Cadastro do profissional"),
        { target: { value: "existing" } },
      );
      const select = within(dialog).getByLabelText("Profissional da agenda");
      await within(select).findByRole("option", { name: "Maria Pilates" });
      return select;
    }

    it("creates a user and a professional with independent agenda name and commission in one POST", async () => {
      mockCommission((_url, init) =>
        init?.method === "POST"
          ? { ...customUser, fullName: "Ana Lima" }
          : undefined,
      );
      const dialog = await openNew();
      expect(
        within(dialog).getByLabelText("Realiza atendimentos"),
      ).not.toBeChecked();
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      expect(within(dialog).getByLabelText("Nome na agenda")).toHaveValue(
        "Ana Lima",
      );
      expect(within(dialog).getByLabelText("Especialidade")).toHaveValue(
        "Fisioterapia",
      );
      expect(
        within(dialog).getByRole("button", { name: "Criar usuário" }),
      ).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("Registro profissional"), {
        target: { value: "CREF 4321" },
      });
      fireEvent.change(within(dialog).getByLabelText("Nome na agenda"), {
        target: { value: "Dra. Ana" },
      });
      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Ana Lima Souza" },
      });
      expect(within(dialog).getByLabelText("Nome na agenda")).toHaveValue(
        "Dra. Ana",
      );
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      save(dialog, "Criar usuário");
      await screen.findByText("Usuário Ana Lima criado.");
      expect(writes()).toHaveLength(1);
      expect(writes()[0]).toMatchObject({
        method: "POST",
        body: {
          fullName: "Ana Lima Souza",
          permissions: [],
          professional: {
            mode: "create",
            data: {
              fullName: "Dra. Ana",
              crefito: "CREF 4321",
              specialty: "Fisioterapia",
              color: "#547A6B",
            },
          },
          commission: { percentage: 25, effectiveFrom: saoPauloToday() },
        },
      });
    });

    it("offers only the general commission, on the value the client paid", async () => {
      mockCommission(() => undefined);
      const dialog = await openNew();
      expect(within(dialog).getByText("Comissão")).toBeInTheDocument();
      expect(
        within(dialog).getByText(/sobre o valor que o cliente pagou/),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByText("Comissão por serviço"),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Adicionar serviço" }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByLabelText("Tipo de comissão"),
      ).not.toBeInTheDocument();
    });

    it("creates a user without a professional or commission and without extra writes", async () => {
      mockCommission((_url, init) =>
        init?.method === "POST"
          ? { ...customUser, fullName: "Ana Lima" }
          : undefined,
      );
      const dialog = await openNew();
      expect(
        within(dialog).queryByLabelText("Registro profissional"),
      ).not.toBeInTheDocument();
      save(dialog, "Criar usuário");
      await screen.findByText("Usuário Ana Lima criado.");
      expect(writes().map((item) => item.method)).toEqual(["POST"]);
      expect(writes()[0]!.body).not.toHaveProperty("professional");
      expect(writes()[0]!.body).not.toHaveProperty("commission");
    });

    it("links an available professional, fills their fields and excludes another user's professional", async () => {
      mockCommission((_url, init) =>
        init?.method === "POST"
          ? { ...customUser, fullName: "Ana Lima" }
          : undefined,
      );
      const dialog = await openNew();
      const select = await chooseExisting(dialog);
      expect(
        within(select).queryByRole("option", { name: "Bruno Lima (agenda)" }),
      ).not.toBeInTheDocument();
      fireEvent.change(select, { target: { value: pilatesId } });
      expect(within(dialog).getByLabelText("Nome na agenda")).toHaveValue(
        "Maria Pilates",
      );
      expect(
        within(dialog).getByLabelText("Registro profissional"),
      ).toHaveValue("CREF 1234");
      save(dialog, "Criar usuário");
      await screen.findByText("Usuário Ana Lima criado.");
      expect(writes()).toHaveLength(1);
      expect(writes()[0]!.body).toMatchObject({
        professional: {
          mode: "save",
          id: pilatesId,
          data: { fullName: "Maria Pilates" },
        },
      });
    });

    it("shows the retroactive recalculation before saving and sends the confirmed preview", async () => {
      const preview = {
        from: "2026-03-01",
        until: saoPauloToday(),
        items: [
          {
            commissionId: "c1",
            professionalId: takenId,
            professionalName: "Bruno Lima (agenda)",
            competence: "2026-03",
            sourceDate: "2026-03-10",
            status: "paid",
            mode: "adjustment",
            previousAmountInCents: 1000,
            amountInCents: 4000,
            differenceInCents: 3000,
            ruleSnapshot: { percentage: 40, effectiveFrom: "2026-03-01" },
          },
        ],
        differenceInCents: 3000,
        adjustmentInCents: 3000,
        digest: "c".repeat(64),
      };
      mockCommission((url, init) =>
        url.endsWith("/recalculation/preview")
          ? preview
          : init?.method === "PATCH"
            ? otherUser
            : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "40" },
      });
      fireEvent.change(within(dialog).getByLabelText("Vale a partir de"), {
        target: { value: "2026-03-01" },
      });
      fireEvent.submit(
        within(dialog).getByLabelText("Comissão (%)").closest("form")!,
      );
      expect(
        await within(dialog).findByText(/Esta mudança recalcula 1 comissão/),
      ).toBeInTheDocument();
      expect(writes()).toEqual([]);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar e recalcular" }),
      );
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes()).toHaveLength(1);
      expect(writes()[0]!.body).toMatchObject({
        commission: { percentage: 40, effectiveFrom: "2026-03-01" },
        recalculationDigest: "c".repeat(64),
      });
    });

    it("saves only changed commission and access data in one PATCH", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH" ? otherUser : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "40" },
      });
      fireEvent.change(within(dialog).getByLabelText("Cargo"), {
        target: { value: "Instrutor" },
      });
      fireEvent.submit(
        within(dialog).getByLabelText("Comissão (%)").closest("form")!,
      );
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes().map((item) => item.method)).toEqual(["PATCH"]);
      expect(writes()[0]!.body).toMatchObject({
        jobTitle: "Instrutor",
        commission: { percentage: 40, effectiveFrom: saoPauloToday() },
      });
      expect(writes()[0]!.body).not.toHaveProperty("professional");
    });

    it("preserves unchanged professional and commission when editing access fields", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH" ? otherUser : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      expect(within(dialog).getByLabelText("Nome na agenda")).toHaveValue(
        "Bruno Lima (agenda)",
      );
      fireEvent.change(within(dialog).getByLabelText("Cargo"), {
        target: { value: "Instrutor" },
      });
      save(dialog);
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes()).toHaveLength(1);
      expect(writes()[0]!.body).not.toHaveProperty("professional");
      expect(writes()[0]!.body).not.toHaveProperty("commission");
    });

    it("preserves all entered data and retries the whole PATCH after a commission conflict", async () => {
      let attempt = 0;
      mockCommission((_url, init) =>
        init?.method === "PATCH"
          ? ++attempt === 1
            ? conflict(
                "COMMISSION_RULE_DUPLICATE",
                "Escolha outra data de início.",
              )
            : otherUser
          : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
        target: { value: "Nome digitado" },
      });
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "20" },
      });
      save(dialog);
      expect(
        await screen.findByText("Escolha outra data de início."),
      ).toHaveClass("form-error");
      expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
        "Nome digitado",
      );
      expect(within(dialog).getByLabelText("Comissão (%)")).toHaveValue(20);
      expect(
        screen.getByRole("button", { name: "Editar Bruno Lima" }),
      ).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText("Vale a partir de"), {
        target: { value: "2099-02-01" },
      });
      save(dialog);
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes().map((item) => item.method)).toEqual(["PATCH", "PATCH"]);
      expect(writes()[1]!.body).toMatchObject({
        fullName: "Nome digitado",
        commission: { percentage: 20, effectiveFrom: "2099-02-01" },
      });
    });

    it("keeps new-user mode after a professional conflict and retries only with POST", async () => {
      let attempt = 0;
      mockCommission((_url, init) =>
        init?.method === "POST"
          ? ++attempt === 1
            ? conflict(
                "PROFESSIONAL_ALREADY_LINKED",
                "Este profissional já está ligado a outro usuário.",
              )
            : { ...customUser, fullName: "Ana Lima" }
          : undefined,
      );
      const dialog = await openNew();
      const select = await chooseExisting(dialog);
      fireEvent.change(select, { target: { value: pilatesId } });
      save(dialog, "Criar usuário");
      await screen.findByText(
        "Este profissional já está ligado a outro usuário.",
      );
      expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBe(dialog);
      expect(within(dialog).getByLabelText("E-mail de acesso")).toHaveValue(
        "ana@movimenta.local",
      );
      save(dialog, "Criar usuário");
      await screen.findByText("Usuário Ana Lima criado.");
      expect(writes().map((item) => item.method)).toEqual(["POST", "POST"]);
    });

    it("deactivates while keeping the link and edits inactive professionals for reactivation", async () => {
      let inactive = false;
      mockCommission((url, init) => {
        if (init?.method === "PATCH") {
          inactive = true;
          return {
            ...otherUser,
            professional: { ...otherUser.professional, active: false },
          };
        }
        if (url.endsWith("/admin/users"))
          return [
            customUser,
            {
              ...otherUser,
              professional: { ...otherUser.professional, active: !inactive },
            },
          ];
        return undefined;
      });
      let dialog = await openEditor("Bruno Lima");
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      save(dialog);
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes()[0]!.body.professional).toEqual({ mode: "deactivate" });
      await screen.findByText(
        "Agenda: Bruno Lima (agenda) (inativo) · Comissão 35%",
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Editar Bruno Lima" }),
      );
      dialog = screen.getByRole("dialog", { name: "Editar Bruno Lima" });
      expect(
        within(dialog).getByLabelText("Realiza atendimentos"),
      ).not.toBeChecked();
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      expect(within(dialog).getByLabelText("Nome na agenda")).toHaveValue(
        "Bruno Lima (agenda)",
      );
      save(dialog);
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes()[1]!.body).toMatchObject({
        professional: { mode: "save", id: takenId },
      });
    });

    it("corrects the current commission period and warns about future effective dates", async () => {
      let saved = false;
      mockCommission((url, init) => {
        const user = {
          ...otherUser,
          commissionPercentage: saved ? 25 : 20,
          commissionEffectiveFrom: saoPauloToday(),
        };
        if (init?.method === "PATCH") {
          saved = true;
          return user;
        }
        if (url.endsWith("/admin/users")) return [customUser, user];
        return undefined;
      });
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      expect(
        within(dialog).getByText("Vai corrigir o percentual desta vigência."),
      ).toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText("Vale a partir de"), {
        target: { value: "2099-01-01" },
      });
      expect(
        within(dialog).getByText(
          new RegExp(
            "Data futura: o percentual atual.*" +
              futureLabel("2099-01-01").replaceAll(".", "\\."),
          ),
        ),
      ).toBeInTheDocument();
      save(dialog);
      await screen.findByText("Alterações de Bruno Lima salvas.");
      expect(writes()[0]!.body).toMatchObject({
        commission: { percentage: 25, effectiveFrom: "2099-01-01" },
      });
    });

    it("validates commission before writing and explains a used-period conflict", async () => {
      mockCommission((_url, init) =>
        init?.method === "PATCH"
          ? conflict(
              "COMMISSION_RULE_DUPLICATE",
              "Esta comissão já foi usada em lançamentos; escolha outra data de início.",
            )
          : undefined,
      );
      const dialog = await openEditor("Bruno Lima");
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "" },
      });
      expect(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      ).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "101" },
      });
      fireEvent.submit(
        within(dialog).getByLabelText("Comissão (%)").closest("form")!,
      );
      expect(
        await screen.findByText(
          "Informe um percentual de comissão entre 0 e 100.",
        ),
      ).toHaveClass("form-error");
      expect(writes()).toHaveLength(0);
      fireEvent.change(within(dialog).getByLabelText("Comissão (%)"), {
        target: { value: "25" },
      });
      save(dialog);
      expect(
        await screen.findByText(/Esta comissão já foi usada em lançamentos/),
      ).toHaveClass("form-error");
    });

    it("shows loading until the professional options arrive", async () => {
      let release!: (items: ReturnType<typeof professional>[]) => void;
      const pending = new Promise<ReturnType<typeof professional>[]>(
        (resolve) => {
          release = resolve;
        },
      );
      mockCommission((url) =>
        url.endsWith("/professionals") ? pending : undefined,
      );
      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      fireEvent.change(
        within(dialog).getByLabelText("Cadastro do profissional"),
        { target: { value: "existing" } },
      );
      expect(dialog.querySelector(".loading-block")).not.toBeNull();
      release([professional(pilatesId, "Maria Pilates")]);
      await within(dialog).findByRole("option", { name: "Maria Pilates" });
      expect(dialog.querySelector(".loading-block")).toBeNull();
    });

    it("shows list errors with retry without blocking commission or a new professional", async () => {
      mockCommission(() => undefined, { professionalsFail: true });
      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByLabelText("Realiza atendimentos"));
      fireEvent.change(
        within(dialog).getByLabelText("Cadastro do profissional"),
        { target: { value: "existing" } },
      );
      await within(dialog).findByText(/Falha ao listar profissionais/);
      expect(
        within(dialog).getByRole("button", { name: "Tentar novamente" }),
      ).toBeEnabled();
      expect(within(dialog).getByLabelText("Comissão (%)")).toBeEnabled();
      fireEvent.change(
        within(dialog).getByLabelText("Cadastro do profissional"),
        { target: { value: "create" } },
      );
      expect(
        within(dialog).getByLabelText("Registro profissional"),
      ).toBeEnabled();
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
