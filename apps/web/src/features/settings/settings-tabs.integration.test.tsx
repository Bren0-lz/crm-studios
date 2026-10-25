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
import {
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("settings tabs", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };

  const clinic = {
    id: "c1",
    name: "Studios Aryana",
    legalName: "",
    taxId: "",
    phone: "",
    email: "",
    address: "",
    timezone: "America/Sao_Paulo",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
  const user = {
    id: "33333333-3333-4333-8333-333333333333",
    clinicId: "11111111-1111-4111-8111-111111111111",
    fullName: "Maria Souza",
    email: "maria@movimenta.local",
    role: "user",
    modules: [],
    editModules: [],
    customModules: false,
    active: true,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
  const fetched = (path: string) =>
    vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes(path));

  function mockSettings(
    holidays: () => Promise<Response> | Response = () =>
      ({ ok: true, status: 200, json: async () => [] }) as unknown as Response,
  ) {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/holidays")) return holidays();
      const body = url.includes("/admin/users")
        ? [user]
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : url.includes("/admin/clinic-settings")
            ? clinic
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
  }

  it("opens Clínica first, loads other tabs on demand and preserves visited panels", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    mockSettings();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText("Razão social")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Clínica",
      "Usuários",
      "Filiais",
      "Abas do menu",
      "Planos",
      "Feriados",
      "Etiquetas",
      "Cadastros",
      "Serviços e salas",
      "Contatos sugeridos",
    ]);
    expect(screen.getByRole("tab", { name: "Clínica" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(fetched("/admin/users")).toBe(false);
    expect(fetched("/holidays")).toBe(false);
    expect(fetched("/relationship/settings")).toBe(false);
    expect(fetched("/admin/audit-events")).toBe(false);
    const holidays = await openSettingsSection("Feriados");
    await within(holidays).findByText("Nenhum feriado cadastrado");
    const users = await openSettingsSection("Usuários");
    expect(await within(users).findByText("Maria Souza")).toBeInTheDocument();
    expect(holidays).not.toBeVisible();
    await openSettingsSection("Feriados");
    expect(holidays).toBeVisible();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) => String(input).includes("/holidays")),
    ).toHaveLength(1);
  });

  it("supports roving keyboard focus with manual tab activation", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    mockSettings();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const clinicTab = await screen.findByRole("tab", { name: "Clínica" });
    clinicTab.focus();
    fireEvent.keyDown(clinicTab, { key: "ArrowRight" });
    const users = screen.getByRole("tab", { name: "Usuários" });
    expect(users).toHaveFocus();
    expect(clinicTab).toHaveAttribute("aria-selected", "true");
    expect(users).toHaveAttribute("tabindex", "-1");
    fireEvent.click(users);
    expect(users).toHaveAttribute("aria-selected", "true");
    expect(users).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(users, { key: "End" });
    expect(
      screen.getByRole("tab", { name: "Contatos sugeridos" }),
    ).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Contatos sugeridos" }), {
      key: "Home",
    });
    expect(clinicTab).toHaveFocus();
  });

  it("shows loading, an error and retries only the affected section", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    let fail: (response: Response) => void = () => {};
    let first = true;
    mockSettings(() => {
      if (first) {
        first = false;
        return new Promise<Response>((resolve) => {
          fail = resolve;
        });
      }
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Feriados");
    await vi.waitFor(() => expect(fetched("/holidays")).toBe(true));
    expect(section.querySelector(".loading-block")).not.toBeNull();
    fail({
      ok: false,
      status: 500,
      json: async () => ({
        code: "BOOM",
        message: "Falha ao listar feriados.",
      }),
    } as Response);
    expect(
      await within(section).findByText(/Falha ao listar feriados\./),
    ).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole("button", { name: "Tentar novamente" }),
    );
    await within(section).findByText("Nenhum feriado cadastrado");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([input]) =>
          String(input).includes("/admin/clinic-settings"),
        ),
    ).toHaveLength(1);
  });

  it("places new user in the users tab and locks tabs while its modal is open", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    mockSettings();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("tab", { name: "Clínica" });
    expect(
      screen.queryByRole("button", { name: "Novo usuário" }),
    ).not.toBeInTheDocument();
    await openSettingsSection("Usuários");
    await screen.findByText("Maria Souza");
    fireEvent.click(screen.getByRole("button", { name: "Novo usuário" }));
    expect(
      screen.getByRole("dialog", { name: "Novo usuário" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Clínica" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Clínica" })).toBeEnabled(),
    );
  });

  it("opens services, rooms and professionals in their own tab, also from the old ?secao= link", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/admin/registry")
        ? {
            services: [
              {
                id: "s1",
                name: "Pilates em grupo",
                durationMinutes: 60,
                priceInCents: 0,
                color: "#547A6B",
                active: true,
              },
            ],
            rooms: [],
            professionals: [],
          }
        : url.includes("/admin/clinic-settings")
          ? clinic
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes?secao=servicos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("tab", { name: "Serviços e salas" }),
    ).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Serviços e salas" });
    expect(
      within(panel).getByRole("heading", {
        name: "Serviços, salas e profissionais",
      }),
    ).toBeInTheDocument();
    expect(
      within(panel)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Serviços", "Salas", "Profissionais"]);
    expect(
      within(panel).getByRole("tab", { name: "Serviços" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await within(panel).findByText("Pilates em grupo"),
    ).toBeInTheDocument();
    const catalogs = await openSettingsSection("Cadastros");
    expect(
      within(catalogs).queryByText("Serviços, salas e profissionais"),
    ).not.toBeInTheDocument();
    expect(
      within(catalogs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Comercial", "Produtos", "Fornecedores", "Clínico"]);
    expect(
      within(catalogs).getByRole("tab", { name: "Comercial" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await within(catalogs).findByRole("region", { name: "Origens" }),
    ).toBeInTheDocument();
    expect(
      within(catalogs).queryByRole("region", { name: "Interesses" }),
    ).not.toBeInTheDocument();
  });

  it("masks the clinic CPF/CNPJ and refuses invalid check digits before saving", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    mockSettings();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const taxId = await screen.findByLabelText(/^CNPJ.CPF/);
    fireEvent.change(taxId, { target: { value: "12345678000190" } });
    expect(taxId).toHaveValue("12.345.678/0001-90");
    fireEvent.blur(taxId);
    expect(
      await screen.findByText("Informe um CPF ou CNPJ válido."),
    ).toBeInTheDocument();
    expect(taxId).toHaveAttribute("aria-invalid", "true");
    fireEvent.submit(taxId.closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Informe um CPF ou CNPJ válido.",
      ),
    );
    const putCalls = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/admin/clinic-settings") &&
            init?.method === "PUT",
        );
    expect(putCalls()).toHaveLength(0);
    fireEvent.change(taxId, { target: { value: "11222333000181" } });
    fireEvent.blur(taxId);
    expect(taxId).toHaveValue("11.222.333/0001-81");
    expect(taxId).not.toHaveAttribute("aria-invalid");
    fireEvent.submit(taxId.closest("form")!);
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(JSON.parse(String(putCalls()[0]![1]!.body))).toMatchObject({
      taxId: "11.222.333/0001-81",
    });
  });

  it("opens the first available tab for reception and keeps relationship read-only", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: owner.id,
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    mockSettings();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("tab", { name: "Planos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Planos",
      "Etiquetas",
      "Cadastros",
      "Serviços e salas",
      "Contatos sugeridos",
    ]);
    expect(fetched("/relationship/settings")).toBe(false);
    await openSettingsSection("Prazos e mensagens");
    expect(
      await screen.findByLabelText("Saldo baixo: sessões restantes"),
    ).toHaveAttribute("readonly");
  });

  it.each(["Feriados", "Etiquetas"])(
    "protects the inline %s draft on tab changes and unload",
    async (name) => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      mockSettings();
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      const panel = await openSettingsSection(name);
      const label =
        name === "Feriados" ? "Nome do feriado" : "Nome da etiqueta";
      const field = await within(panel).findByLabelText(label);
      fireEvent.change(field, { target: { value: "Rascunho" } });
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      let dialog = screen.getByRole("dialog", {
        name: "Salvar as alterações?",
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Continuar editando" }),
      );
      expect(field).toHaveValue("Rascunho");
      expect(panel).toBeVisible();
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      dialog = screen.getByRole("dialog");
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Descartar alterações" }),
      );
      expect(panel).not.toBeVisible();
      expect(screen.getByRole("tab", { name: "Usuários" })).toHaveFocus();
      await openSettingsSection(name);
      expect(field).toHaveValue("");
      const cleanUnload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanUnload);
      expect(cleanUnload.defaultPrevented).toBe(false);
    },
  );

  it.each(["Feriados", "Etiquetas"])(
    "saves a valid inline %s draft before switching tabs",
    async (name) => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      mockSettings();
      const original = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (init?.method === "POST")
          return {
            ok: true,
            status: 201,
            json: async () => ({
              ...JSON.parse(String(init.body)),
              id: "created",
              patientCount: 0,
            }),
          } as Response;
        return original(input, init);
      });
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      const panel = await openSettingsSection(name);
      const label =
        name === "Feriados" ? "Nome do feriado" : "Nome da etiqueta";
      fireEvent.change(await within(panel).findByLabelText(label), {
        target: { value: "Cadastro novo" },
      });
      if (name === "Feriados")
        fireEvent.change(within(panel).getByLabelText("Data"), {
          target: { value: "2026-12-25" },
        });
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Salvar alterações",
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole("tab", { name: "Usuários" })).toHaveAttribute(
          "aria-selected",
          "true",
        ),
      );
      await openSettingsSection(name);
      expect(
        await within(panel).findByText("Cadastro novo"),
      ).toBeInTheDocument();
      expect(within(panel).getByLabelText(label)).toHaveValue("");
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
    },
  );

  it("keeps a clinic draft after a failed save, blocks duplicate writes and isolates user refreshes", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    mockSettings();
    const original = vi.mocked(fetch).getMockImplementation()!;
    let complete: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (
        String(input).includes("/admin/clinic-settings") &&
        init?.method === "PUT"
      )
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      return original(input, init);
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const field = await screen.findByLabelText("Nome");
    fireEvent.change(field, { target: { value: "Studio novo" } });
    const form = field.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(
      await screen.findByRole("button", { name: "Salvando…" }),
    ).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Usuários" })).toBeDisabled();
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(1);
    complete({
      ok: false,
      status: 400,
      json: async () => ({ message: "Falha ao salvar a clínica." }),
    } as Response);
    await screen.findByText("Falha ao salvar a clínica.");
    expect(field).toHaveValue("Studio novo");
    expect(
      screen.getByRole("button", { name: "Salvar configurações" }),
    ).toBeEnabled();
    fireEvent.submit(form);
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([, init]) => init?.method === "PUT"),
      ).toHaveLength(2),
    );
    complete({
      ok: true,
      status: 200,
      json: async () => ({ ...clinic, name: "Studio novo" }),
    } as Response);
    await screen.findByText("Dados da clínica salvos.");
    await openSettingsSection("Usuários");
    fireEvent.click(
      await screen.findByRole("button", { name: "Redefinir senha" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nova senha"), {
      target: { value: "NovaSenha123" },
    });
    fireEvent.submit(
      within(dialog).getByLabelText("Nova senha").closest("form")!,
    );
    await screen.findByText("Senha de Maria Souza redefinida.");
    await openSettingsSection("Dados da clínica");
    expect(field).toHaveValue("Studio novo");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/admin/clinic-settings") && !init?.method,
        ),
    ).toHaveLength(1);
  });

  describe("unsaved changes warning (T068)", () => {
    function mockClinicSave(putResponses: Array<"ok" | "fail">) {
      // O servidor guarda o que foi salvo: a recarga depois de salvar devolve o valor novo.
      let current = clinic;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/admin/clinic-settings") && init?.method === "PUT") {
          const outcome = putResponses.shift() ?? "ok";
          if (outcome === "fail") {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                code: "VALIDATION_ERROR",
                message: "Nome inválido.",
              }),
            } as Response;
          }
          current = { ...clinic, ...JSON.parse(String(init.body)) };
          const saved = current;
          return { ok: true, status: 200, json: async () => saved } as Response;
        }
        if (url.includes("/admin/clinic-settings")) {
          const loaded = current;
          return {
            ok: true,
            status: 200,
            json: async () => loaded,
          } as Response;
        }
        if (url.includes("/relationship/settings") && init?.method === "PUT") {
          return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(String(init.body)),
          } as Response;
        }
        const body = url.includes("/admin/users")
          ? [user]
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/admin/clinic-settings")
              ? clinic
              : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
    }
    const puts = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([input, options]) =>
            String(input).includes("/admin/clinic-settings") &&
            options?.method === "PUT",
        );

    async function editClinicName(value: string) {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      const toggle = await screen.findByRole("tab", { name: "Clínica" });
      const name = await screen.findByLabelText("Nome");
      fireEvent.change(name, { target: { value } });
      return toggle;
    }

    it("closes directly when nothing changed", async () => {
      mockClinicSave([]);
      const toggle = await editClinicName("Studios Aryana");
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      expect(toggle).toHaveAttribute("aria-selected", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps editing when the user chooses to continue", async () => {
      mockClinicSave([]);
      const toggle = await editClinicName("Studio Novo");
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      const dialog = screen.getByRole("dialog", {
        name: "Salvar as alterações?",
      });
      expect(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Descartar alterações" }),
      ).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Continuar editando" }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Nome")).toHaveValue("Studio Novo");
      expect(puts()).toHaveLength(0);
    });

    it("discards back to the saved values and closes", async () => {
      mockClinicSave([]);
      const toggle = await editClinicName("Studio Novo");
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Descartar alterações",
        }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute("aria-selected", "false");
      expect(puts()).toHaveLength(0);
      fireEvent.click(toggle);
      expect(await screen.findByLabelText("Nome")).toHaveValue(
        "Studios Aryana",
      );
      // Sem alteração depois de descartar: fecha direto.
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      expect(toggle).toHaveAttribute("aria-selected", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("saves with the form request, shows the error in the modal and closes only on success", async () => {
      mockClinicSave(["fail", "ok"]);
      const toggle = await editClinicName("Studio Novo");
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Nome inválido.",
      );
      expect(toggle).toHaveAttribute("aria-selected", "true");
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Salvar alterações" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(toggle).toHaveAttribute("aria-selected", "false");
      expect(puts()).toHaveLength(2);
      expect(JSON.parse(String(puts()[1]![1]!.body))).toMatchObject({
        name: "Studio Novo",
      });
      fireEvent.click(toggle);
      expect(await screen.findByLabelText("Nome")).toHaveValue("Studio Novo");
    });

    it("holds the app menu navigation until the user decides", async () => {
      mockClinicSave([]);
      await editClinicName("Studio Novo");
      fireEvent.click(screen.getByRole("link", { name: "Clientes" }));
      const dialog = screen.getByRole("dialog", {
        name: "Salvar as alterações?",
      });
      expect(
        screen.getByRole("heading", { name: "Configurações" }),
      ).toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Continuar editando" }),
      );
      expect(screen.getByLabelText("Nome")).toHaveValue("Studio Novo");
      fireEvent.click(screen.getByRole("link", { name: "Clientes" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Descartar alterações",
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", { name: "Configurações" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("warns before closing Prazos e mensagens with unsaved edits", async () => {
      mockClinicSave([]);
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      render(
        <MemoryRouter initialEntries={["/configuracoes"]}>
          <App />
        </MemoryRouter>,
      );
      const toggle = await screen.findByRole("tab", {
        name: "Contatos sugeridos",
      });
      fireEvent.click(toggle);
      const field = await screen.findByLabelText(
        "Saldo baixo: sessões restantes",
      );
      const original = (field as HTMLInputElement).value;
      fireEvent.change(field, { target: { value: "7" } });
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      const dialog = screen.getByRole("dialog", {
        name: "Salvar as alterações?",
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Continuar editando" }),
      );
      expect(toggle).toHaveAttribute("aria-selected", "true");
      fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Salvar alterações",
        }),
      );
      await waitFor(() =>
        expect(toggle).toHaveAttribute("aria-selected", "false"),
      );
      const put = vi
        .mocked(fetch)
        .mock.calls.find(
          ([input, options]) =>
            String(input).includes("/relationship/settings") &&
            options?.method === "PUT",
        );
      expect(JSON.parse(String(put![1]!.body))).toMatchObject({
        lowBalanceSessions: 7,
      });
      expect(original).not.toBe("7");
    });
  });
});
