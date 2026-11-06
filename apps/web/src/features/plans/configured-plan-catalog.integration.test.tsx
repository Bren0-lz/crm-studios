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
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("configured plan catalog", () => {
  const first = {
    id: "aa000000-0000-4000-8000-000000000001",
    name: "Pilates mensal",
    totalValueInCents: 45000,
    serviceId: "88888888-8888-4888-8888-888888888888",
    kind: "recurring",
    totalSessions: 8,
    services: [
      {
        serviceId: "88888888-8888-4888-8888-888888888888",
        totalSessions: 8,
        totalValueInCents: 40000,
      },
      {
        serviceId: "77777777-7777-4777-8777-777777777777",
        totalSessions: 2,
        totalValueInCents: 5000,
      },
    ],
    active: true,
  };
  const second = {
    id: "aa000000-0000-4000-8000-000000000002",
    name: "Pacote básico",
    totalValueInCents: 12050,
    services: [
      {
        serviceId: "77777777-7777-4777-8777-777777777777",
        totalSessions: 10,
        totalValueInCents: 12050,
      },
    ],
    active: true,
  };
  const single = {
    ...second,
    id: "aa000000-0000-4000-8000-000000000005",
    name: "Avaliação avulsa",
    kind: "single",
  };
  function setupCatalog(
    options: { empty?: boolean; failOnce?: boolean; role?: string } = {},
  ) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Usuária catálogo",
        email: "catalog@test.local",
        role: options.role ?? "owner",
      }),
    );
    let catalogReads = 0;
    let savedTemplate = { ...first };
    const writes: Record<string, unknown>[] = [];
    const templates = options.empty
      ? []
      : [
          first,
          second,
          single,
          {
            ...first,
            id: "aa000000-0000-4000-8000-000000000003",
            name: "Plano inativo",
            active: false,
          },
          {
            ...second,
            id: "aa000000-0000-4000-8000-000000000004",
            name: "Plano incompleto",
            services: [],
          },
        ];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (
        url.includes("/plan-templates") &&
        (!init?.method || init.method === "GET")
      ) {
        catalogReads += 1;
        if (options.failOnce && catalogReads === 1)
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: "Falha ao carregar catálogo" }),
          } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => templates,
        } as Response;
      }
      if (init?.method === "POST" || init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push(body);
        savedTemplate = { ...savedTemplate, ...body };
        return {
          ok: true,
          status: init.method === "POST" ? 201 : 200,
          json: async () => ({
            ...savedTemplate,
            id: first.id,
            clinicId: "11111111-1111-4111-8111-111111111111",
            patientName: "Cliente teste",
            serviceName: "Pilates",
            remainingSessions: body.totalSessions ?? 8,
            status: "active",
            createdAt: "2035-01-01T12:00:00Z",
            updatedAt: "2035-01-01T12:00:00Z",
          }),
        } as Response;
      }
      const body = url.includes("/patients/options")
        ? [
            {
              id: "99999999-9999-4999-8999-999999999999",
              fullName: "Cliente teste",
            },
          ]
        : url.includes("/services")
          ? [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Fisioterapia",
                active: true,
              },
              { id: first.serviceId, name: "Pilates", active: true },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    return writes;
  }

  it("requires selection, applies defaults without carrying prior fields and prices single sessions from the plan", async () => {
    const writes = setupCatalog();
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const selector = await screen.findByLabelText("Plano cadastrado");
    await screen.findByRole("option", { name: /Pilates mensal/ });
    expect(selector).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "Cliente teste" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: "Cliente teste" }),
    );
    expect(
      screen.queryByRole("option", { name: /Plano inativo/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: first.id } });
    expect(
      screen.queryByRole("option", { name: /Plano incompleto/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveValue(
      "R$\u00a0400,00",
    );
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByLabelText("Valor do serviço 2")).toHaveValue(
      "R$\u00a050,00",
    );
    expect(screen.getByLabelText("Sessões do serviço 2")).toHaveValue(2);
    expect(screen.getByLabelText("Valor total")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Sessões do serviço 1")).toHaveValue(8);
    expect(screen.getByRole("group", { name: "Pilates" })).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toHaveValue("recurring");
    expect(screen.getByLabelText("Sessões do serviço 1")).toHaveAttribute(
      "readonly",
    );
    fireEvent.change(selector, { target: { value: second.id } });
    expect(
      screen.queryByLabelText("Valor do serviço 2"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveValue(
      "R$\u00a0120,50",
    );
    expect(screen.getByLabelText("Sessões do serviço 1")).toHaveValue(10);
    expect(
      screen.getByRole("group", { name: "Fisioterapia" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toHaveValue("fixed_package");
    // A lista acompanha o Modelo: recorrente não mostra planos avulsos.
    expect(
      screen.queryByRole("option", { name: /Avaliação avulsa/ }),
    ).not.toBeInTheDocument();
    // Avulso: o plano recorrente sai da seleção e só os avulsos aparecem.
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "single" },
    });
    expect(selector).toHaveValue("");
    expect(
      screen.queryByRole("option", { name: /Pacote básico/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Pilates mensal/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: single.id } });
    expect(screen.getByLabelText("Modelo")).toHaveValue("single");
    // Avulso: as sessões mudam e o valor segue o preço por sessão do plano.
    fireEvent.change(screen.getByLabelText("Sessões do serviço 1"), {
      target: { value: "8" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      name: single.name,
      planTemplateId: single.id,
      kind: "single",
      totalValueInCents: 9640,
    });
  });

  it("blocks empty catalogs and links to settings only when the user can open them", async () => {
    setupCatalog({ empty: true });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    await screen.findByText(/Nenhum plano ativo cadastrado/);
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Abrir configurações" }),
    ).toHaveAttribute("href", "/configuracoes");
    cleanup();
    setupCatalog({ empty: true });
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify(
        withPermissions({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Vendedor",
          email: "sales@test.local",
          role: "user",
          modules: ["plans"],
          editModules: ["plans"],
        }),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    await screen.findByText(/Nenhum plano ativo cadastrado/);
    expect(
      screen.queryByRole("link", { name: "Abrir configurações" }),
    ).not.toBeInTheDocument();
  });

  it("retries a catalog read failure without falling back to manual creation", async () => {
    setupCatalog({ failOnce: true });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    await screen.findByText(/Falha ao carregar catálogo/);
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("option", { name: /Pilates mensal/ });
    expect(
      screen.queryByText(/Falha ao carregar catálogo/),
    ).not.toBeInTheDocument();
  });

  it("adds and removes required services, blocks mismatched totals, edits and deactivates the catalog", async () => {
    const writes = setupCatalog();
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    let dialog = screen.getByRole("dialog");
    const fill = (label: string, value: string) =>
      fireEvent.change(within(dialog).getByLabelText(label), {
        target: { value },
      });
    fill("Nome do plano", "Plano completo");
    fill("Tipo de plano", "promotional");
    fill("Valor total", "125,50");
    fill("Serviço 1", first.serviceId);
    fill("Sessões do serviço 1", "8");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar serviço" }),
    );
    fill("Valor do serviço 1", "100,00");
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toBeDisabled();
    // O que falta no serviço novo fica listado e ligado ao botão (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toHaveAccessibleDescription("Falta: Serviço 2, Valor do serviço 2.");
    fill("Serviço 2", "77777777-7777-4777-8777-777777777777");
    fill("Sessões do serviço 2", "2");
    fill("Valor do serviço 2", "25,50");
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      name: "Plano completo",
      totalValueInCents: 12550,
      kind: "custom",
      planType: "promotional",
      services: [
        {
          serviceId: first.serviceId,
          totalSessions: 8,
          totalValueInCents: 10000,
        },
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 2,
          totalValueInCents: 2550,
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Editar plano Plano completo" }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover serviço 2" }),
    );
    fill("Valor total", "100,00");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({
      services: [
        {
          serviceId: first.serviceId,
          totalSessions: 8,
          totalValueInCents: 10000,
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Desativar plano Plano completo" }),
    );
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toEqual({ active: false });
    await screen.findByRole("button", { name: "Ativar plano Plano completo" });
  });

  it("keeps the single-session reference separate from the plan value while changing service rows", async () => {
    setupCatalog();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith("/services"))
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: first.serviceId,
              name: "Pilates",
              active: true,
              priceInCents: 10000,
            },
            {
              id: "77777777-7777-4777-8777-777777777777",
              name: "Fisioterapia",
              active: true,
              priceInCents: 5000,
            },
          ],
        } as Response;
      return originalFetch(input, init);
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Editar plano Pilates mensal",
      }),
    );
    const dialog = screen.getByRole("dialog");
    const reference = within(dialog).getByRole("region", {
      name: "Preço de tabela dos serviços",
    });
    expect(
      within(reference).getByText("Total avulso").parentElement,
    ).toHaveTextContent(/900,00/);
    expect(within(reference).getByText(/Só referência/)).toHaveTextContent(
      "Não muda o valor do plano.",
    );
    fireEvent.change(within(dialog).getByLabelText("Sessões do serviço 1"), {
      target: { value: "4" },
    });
    expect(
      within(reference).getByText("Total avulso").parentElement,
    ).toHaveTextContent(/500,00/);
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue("450,00");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover serviço 2" }),
    );
    expect(
      within(reference).getByText("Total avulso").parentElement,
    ).toHaveTextContent(/400,00/);
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue("450,00");
    expect(
      within(dialog).getByRole("button", { name: "Remover serviço 1" }),
    ).toBeDisabled();
  });

  it("shows the catalog read-only without settings operation permissions", async () => {
    setupCatalog({ role: "reception" });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    await screen.findByText(first.name);
    expect(
      screen.queryByRole("button", { name: "Cadastrar plano" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Editar plano ${first.name}` }),
    ).not.toBeInTheDocument();
  });
});
