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

  it("requires selection, applies defaults without carrying prior fields and sells at a negotiated price", async () => {
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
    fireEvent.focus(screen.getByRole("combobox", { name: "Cliente" }));
    fireEvent.click(screen.getByRole("option", { name: "Cliente teste" }));
    expect(
      screen.queryByRole("option", { name: /Plano inativo/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: first.id } });
    expect(
      screen.queryByRole("option", { name: /Plano incompleto/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveValue("400,00");
    expect(screen.getByLabelText("Valor do serviço 2")).toHaveValue("50,00");
    expect(screen.getByLabelText("Sessões do serviço 2")).toHaveValue(2);
    expect(screen.getByLabelText("Valor total")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Sessões do serviço 1")).toHaveValue(8);
    expect(screen.getByRole("group", { name: "Pilates" })).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toHaveValue("recurring");
    fireEvent.change(screen.getByLabelText("Valor do serviço 1"), {
      target: { value: "390" },
    });
    fireEvent.change(selector, { target: { value: second.id } });
    expect(
      screen.queryByLabelText("Valor do serviço 2"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveValue("120,50");
    expect(screen.getByLabelText("Sessões do serviço 1")).toHaveValue(10);
    expect(
      screen.getByRole("group", { name: "Fisioterapia" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toHaveValue("fixed_package");
    fireEvent.change(screen.getByLabelText("Valor do serviço 1"), {
      target: { value: "99.99" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      name: second.name,
      planTemplateId: second.id,
      totalValueInCents: 9999,
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
    fill("Valor total", "125.50");
    fill("Serviço 1", first.serviceId);
    fill("Sessões do serviço 1", "8");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar serviço" }),
    );
    fill("Valor do serviço 1", "100");
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toBeDisabled();
    fill("Serviço 2", "77777777-7777-4777-8777-777777777777");
    fill("Sessões do serviço 2", "2");
    fill("Valor do serviço 2", "25.50");
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toBeEnabled();
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
    fill("Valor total", "100");
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
