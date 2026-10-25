import {
  setDocumentText,
  installDocumentBrowserMocks,
} from "./test-support/document-editor";
import { api } from "./api";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  togglePermissions,
  permissionCatalog,
  legacyPermissions,
  effectiveEditModules,
  effectiveModules,
  saoPauloToday,
  type AppModule,
  type DashboardViewSummary,
  type UserRole,
} from "@crm/contracts";
import { useState } from "react";
import App, { Modal } from "./App";
import { AppointmentDateTimePicker } from "./AppointmentDateTimePicker";
import {
  clickMoreAction,
  findMoreAction,
  moreActionNames,
} from "./test-support/patient-actions";
import { isLeadBoardUrl, leadBoardResponse } from "./test-support/lead-board";

vi.stubGlobal("fetch", vi.fn());

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
    // O que falta fica listado e ligado ao botão (QM14).
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toHaveAccessibleDescription("Falta: Cliente, Plano cadastrado.");
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "Cliente teste" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: "Cliente teste" }),
    );
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toHaveAccessibleDescription("Falta: Plano cadastrado.");
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
    // Avulso: as sessões mudam e o valor segue o preço por sessão do plano.
    fireEvent.change(screen.getByLabelText("Modelo"), {
      target: { value: "single" },
    });
    fireEvent.change(screen.getByLabelText("Sessões do serviço 1"), {
      target: { value: "8" },
    });
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveValue(
      "R$\u00a096,40",
    );
    expect(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    ).toBeEnabled();
    expect(screen.queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      name: second.name,
      planTemplateId: second.id,
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
    // O que falta no serviço novo fica listado e ligado ao botão (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    ).toHaveAccessibleDescription("Falta: Serviço 2, Valor do serviço 2.");
    fill("Serviço 2", "77777777-7777-4777-8777-777777777777");
    fill("Sessões do serviço 2", "2");
    fill("Valor do serviço 2", "25.50");
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

/**
 * Módulos dos perfis antigos, usados como atalho nos testes: a migração 0042 gravou exatamente
 * esses módulos nos usuários de recepção, fisioterapia e financeiro (que viraram "user").
 */
const legacyProfiles: Record<
  string,
  { modules: AppModule[]; editModules: AppModule[] }
> = {
  reception: {
    modules: [
      "agenda",
      "groups",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "settings",
    ],
    editModules: [
      "agenda",
      "groups",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
    ],
  },
  physiotherapist: {
    modules: ["agenda", "groups", "patients", "plans", "clinical"],
    editModules: ["agenda", "groups", "clinical"],
  },
  finance: {
    modules: [
      "agenda",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "finance",
      "reports",
      "settings",
    ],
    editModules: [
      "agenda",
      "patients",
      "plans",
      "crm",
      "relationship",
      "communications",
      "contracts",
      "finance",
    ],
  },
};
/** Tipo e módulos efetivos de um perfil antigo (`owner` = admin). */
function legacyAccess(role: string): {
  role: UserRole;
  modules: AppModule[];
  editModules: AppModule[];
} {
  if (role === "owner" || role === "admin")
    return {
      role: "admin",
      modules: effectiveModules("admin"),
      editModules: effectiveEditModules("admin"),
    };
  const profile = legacyProfiles[role];
  return {
    role: "user",
    modules: [...(profile?.modules ?? [])],
    editModules: [...(profile?.editModules ?? [])],
  };
}

/** Usuário logado gravado no localStorage, com os módulos do perfil (como login e /me devolvem). */
function storedUser(user: {
  id: string;
  fullName: string;
  email: string;
  role: string;
}) {
  return JSON.stringify(
    withPermissions({ ...user, ...legacyAccess(user.role) }),
  );
}

function withPermissions<
  T extends {
    role?: string;
    modules?: readonly string[];
    editModules?: readonly string[];
    permissions?: readonly import("@crm/contracts").PermissionKey[];
  },
>(user: T) {
  const access = legacyAccess(user.role ?? "user");
  const modules = (user.modules ?? access.modules) as AppModule[];
  const editModules = (user.editModules ?? access.editModules) as AppModule[];
  return {
    ...user,
    role: access.role,
    modules,
    editModules,
    permissions:
      user.permissions ?? legacyPermissions(access.role, modules, editModules),
  };
}
// Domain fixtures emulate a current /me response; session-specific tests supply their own response.
const originalMe = api.me;
beforeEach(() => {
  vi.spyOn(api, "me").mockImplementation(async () => {
    const implementation =
      vi.mocked(fetch).getMockImplementation()?.toString() ?? "";
    if (implementation.includes("/me") || implementation.includes("401"))
      return originalMe();
    const current = localStorage.getItem("crm.auth.user");
    if (!current) throw new Error("Missing test session");
    return withPermissions(JSON.parse(current));
  });
});

/** Seleciona uma aba de configurações e devolve seu painel. */
async function openSettingsSection(...names: string[]) {
  let section: HTMLElement | null = null;
  for (const name of names) {
    const label =
      name === "Dados da clínica"
        ? "Clínica"
        : name === "Prazos e mensagens"
          ? "Contatos sugeridos"
          : name;
    const tab = await screen.findByRole("tab", { name: label });
    // As abas ficam desativadas enquanto um salvamento termina: clicar antes disso é ignorado.
    await waitFor(() => expect(tab).toBeEnabled());
    if (tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab);
    section = document.getElementById(tab.getAttribute("aria-controls")!);
  }
  return section!;
}

/** Etiqueta configurada (`GET /patient-tags`, T063). */
function patientTag(name: string, color = "#64748b", patientCount = 0) {
  return {
    id: `tag-${name}`,
    clinicId: "11111111-1111-4111-8111-111111111111",
    name,
    color,
    patientCount,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
});

async function fillAppointmentForm(dialog: HTMLElement, patientName?: string) {
  if (patientName) {
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: patientName },
      },
    );
    fireEvent.click(
      await within(dialog).findByRole("option", { name: patientName }),
    );
  }
  for (const label of ["Tipo", "Profissional", "Sala", "Serviço"]) {
    const select = within(dialog).getByLabelText(label) as HTMLSelectElement;
    if (!select.value)
      fireEvent.change(select, { target: { value: select.options[1]!.value } });
  }
  const date = within(dialog).getByRole("button", { name: "Data" });
  if (date.textContent?.includes("Selecionar")) {
    fireEvent.click(date);
    fireEvent.click(
      dialog.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
    );
    // Escolher o dia mantém o calendário aberto; fecha pelo X.
    expect(
      within(dialog).getByRole("region", {
        name: "Calendário de agendamento",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar calendário" }),
    );
  }
  const time = within(dialog).getByLabelText("Horário");
  if (!(time as HTMLInputElement).value)
    fireEvent.change(time, { target: { value: "09:00" } });
}

describe("appointment client search and creation", () => {
  const existing = {
    id: "99999999-9999-4999-8999-999999999999",
    fullName: "Helena Almeida",
    tags: [],
  };
  const created = {
    ...existing,
    id: "88888888-8888-4888-8888-888888888888",
    fullName: "Nova Cliente",
    phone: "11999998888",
  };
  function response(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }
  async function open() {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Recepção",
        email: "r@test.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST")
        return url.endsWith("/patients")
          ? response(created, 201)
          : response({ code: "CONFLICT", message: "Horário ocupado." }, 409);
      return response(
        url.includes("/patients/options?")
          ? url.includes("search=Helena")
            ? [existing]
            : [created]
          : url.includes("/patients")
            ? [existing]
            : url.includes("/professionals")
              ? [
                  {
                    id: "33333333-3333-4333-8333-333333333333",
                    fullName: "Ana",
                    color: "#5c6f68",
                  },
                ]
              : url.includes("/rooms")
                ? [{ id: "55555555-5555-4555-8555-555555555555", name: "Sala" }]
                : url.includes("/services")
                  ? [
                      {
                        id: "77777777-7777-4777-8777-777777777777",
                        name: "Pilates",
                        priceInCents: 10000,
                      },
                    ]
                  : [],
      );
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Dia disponível");
    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    return screen.getByRole("dialog", { name: "Novo atendimento" });
  }

  it("starts every field of a new appointment empty", async () => {
    const appointment = await open();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("");
    for (const label of [
      "Tipo",
      "Profissional",
      "Sala",
      "Serviço",
      "Horário",
      "Observação",
    ])
      expect(within(appointment).getByLabelText(label)).toHaveValue("");
    expect(
      within(appointment).getByRole("button", { name: "Data" }),
    ).toHaveTextContent("Selecionar data");
    expect(
      within(appointment).getByLabelText("Repetir este atendimento"),
    ).not.toBeChecked();
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
  });

  it("keeps appointment values, traps focus, and selects the saved client", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment);
    fireEvent.change(within(appointment).getByLabelText("Observação"), {
      target: { value: "Manter observação" },
    });
    fireEvent.click(
      within(appointment).getByLabelText("Repetir este atendimento"),
    );
    fireEvent.change(
      within(appointment).getByLabelText("Número de ocorrências"),
      { target: { value: "6" } },
    );
    const startsAt = within(appointment).getByLabelText(
      "Horário",
    ) as HTMLInputElement;
    const originalDate = within(appointment).getByRole("button", {
      name: "Data",
    }).textContent;
    const originalTime = startsAt.value;
    fireEvent.change(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
      { target: { value: "Helena" } },
    );
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    const client = screen.getByRole("dialog", { name: "Novo cliente" });
    expect(appointment).toBeInTheDocument();
    expect(appointment.parentElement).toHaveAttribute("inert");
    expect(client.closest("form")).toBeNull();
    await within(client).findByText(/Nenhuma etiqueta configurada/);
    const save = within(client).getByRole("button", { name: "Salvar cliente" });
    // Sem nome e telefone o botão fica desativado (QM14) e não recebe foco.
    expect(save).toBeDisabled();
    fireEvent.change(within(client).getByLabelText("Nome completo"), {
      target: { value: created.fullName },
    });
    fireEvent.change(within(client).getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    fireEvent.change(
      within(
        within(client).getByRole("group", { name: /^Contato$/ }),
      ).getByLabelText("Telefone"),
      { target: { value: created.phone } },
    );
    save.focus();
    expect(save).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(client.contains(document.activeElement)).toBe(true);
    expect(save).not.toHaveFocus();
    fireEvent.submit(client.querySelector("form")!);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo cliente" }),
      ).not.toBeInTheDocument(),
    );
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    expect(picker).toHaveValue(created.fullName);
    await waitFor(() => expect(picker).toHaveFocus());
    expect(within(appointment).getByLabelText("Observação")).toHaveValue(
      "Manter observação",
    );
    expect(startsAt).toHaveValue(originalTime);
    expect(
      within(appointment).getByRole("button", { name: "Data" }),
    ).toHaveTextContent(originalDate!);
    expect(
      within(appointment).getByLabelText("Número de ocorrências"),
    ).toHaveValue(6);
    fireEvent.click(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    );
    await screen.findByText("Horário ocupado.");
    const call = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) =>
          String(url).includes("/appointments") && init?.method === "POST",
      );
    expect(JSON.parse(call![1]!.body as string)).toMatchObject({
      patientId: created.id,
      notes: "Manter observação",
      occurrences: 6,
    });
  });

  it("closes only the client modal on Escape and keeps the search text", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment, existing.fullName);
    fireEvent.change(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
      { target: { value: "Helena" } },
    );
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(appointment).toBeInTheDocument();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("Helena");
    expect(document.body).toHaveClass("modal-open");
  });

  it("keeps both forms and the entered data when client creation fails", async () => {
    const appointment = await open();
    await fillAppointmentForm(appointment, existing.fullName);
    fireEvent.change(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
      { target: { value: "Helena" } },
    );
    fireEvent.click(
      within(appointment).getByRole("button", { name: "Adicionar cliente" }),
    );
    const client = screen.getByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(client).getByLabelText("Nome completo"), {
      target: { value: created.fullName },
    });
    fireEvent.change(within(client).getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    vi.mocked(fetch).mockResolvedValue(
      response({ code: "DUPLICATE", message: "CPF já cadastrado." }, 409),
    );
    fireEvent.submit(client.querySelector("form")!);
    await within(client).findByText("CPF já cadastrado.");
    expect(appointment).toBeInTheDocument();
    expect(within(client).getByLabelText("Nome completo")).toHaveValue(
      created.fullName,
    );
    fireEvent.click(within(client).getByRole("button", { name: "Cancelar" }));
    const discard = screen.getByRole("dialog", {
      name: "Descartar alterações?",
    });
    fireEvent.click(within(discard).getByRole("button", { name: "Descartar" }));
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(
      within(appointment).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("Helena");
  });

  it("searches CPF and selects a result by keyboard, clearing selection when edited", async () => {
    const appointment = await open();
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    fireEvent.change(picker, { target: { value: "123.456.789-01" } });
    fireEvent.change(picker, { target: { value: "123.456.789-01 " } });
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
    await screen.findByRole("option", { name: created.fullName });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("search=123.456.789-01"),
        ),
    ).toBe(true);
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.keyDown(picker, { key: "Enter" });
    expect(picker).toHaveValue(created.fullName);
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeEnabled();
    fireEvent.change(picker, { target: { value: "Outro" } });
    expect(
      within(appointment).getByRole("button", {
        name: "Confirmar atendimento",
      }),
    ).toBeDisabled();
  });

  it("ignores stale searches and distinguishes empty results from errors", async () => {
    const appointment = await open();
    const picker = within(appointment).getByRole("combobox", {
      name: "Cliente",
    });
    let resolveOld: (result: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).includes("search=Antigo")
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(
            String(input).includes("search=Erro")
              ? response({ code: "FAILED", message: "Falha na consulta" }, 500)
              : response([]),
          ),
    );
    fireEvent.change(picker, { target: { value: "Antigo" } });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("search=Antigo")),
      ).toBe(true),
    );
    fireEvent.change(picker, { target: { value: "Novo" } });
    await screen.findByText("Nenhum cliente encontrado");
    resolveOld(response([existing]));
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: existing.fullName }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.change(picker, { target: { value: "Erro" } });
    await screen.findByText("Falha na consulta");
    expect(
      screen.queryByText("Nenhum cliente encontrado"),
    ).not.toBeInTheDocument();
  });
});

describe("modal scroll lock", () => {
  function StackedModals() {
    const [first, setFirst] = useState(false);
    const [second, setSecond] = useState(false);
    return (
      <>
        <button onClick={() => setFirst(true)}>Abrir primeiro</button>
        {first && (
          <Modal
            title="Primeiro"
            subtitle="Modal de baixo"
            onClose={() => setFirst(false)}
          >
            <button onClick={() => setSecond(true)}>Abrir segundo</button>
            <button onClick={() => setFirst(false)}>Fechar primeiro</button>
          </Modal>
        )}
        {second && (
          <Modal
            title="Segundo"
            subtitle="Modal de cima"
            onClose={() => setSecond(false)}
          >
            <button onClick={() => setSecond(false)}>Fechar segundo</button>
          </Modal>
        )}
      </>
    );
  }

  it("locks body scroll while a modal is open and restores it on close", () => {
    render(<StackedModals />);
    expect(document.body).not.toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    expect(document.body).toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Fechar primeiro" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("modal-open");
  });

  it("keeps the lock with stacked modals until the last one closes", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Fechar segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body).toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Fechar primeiro" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("modal-open");
  });

  it("releases the lock when an open modal is unmounted", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    expect(document.body).toHaveClass("modal-open");
    cleanup();
    expect(document.body).not.toHaveClass("modal-open");
  });
});

describe("modal closing", () => {
  it("keeps the floating calendar in the modal focus boundary and consumes its first Escape", async () => {
    const onClose = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    function CalendarModal() {
      const [value, setValue] = useState("2026-10-07T09:00");
      return (
        <Modal title="Agendamento" subtitle="Escolha a data" onClose={onClose}>
          <form>
            <AppointmentDateTimePicker
              value={value}
              onChange={setValue}
              professionalId=""
              roomId=""
            />
            <button type="button">Salvar atendimento</button>
          </form>
        </Modal>
      );
    }
    render(<CalendarModal />);
    const dialog = screen.getByRole("dialog", { name: "Agendamento" });
    const date = within(dialog).getByRole("button", { name: "Data" });
    fireEvent.click(date);
    await within(dialog).findByText("Nenhum compromisso registrado.");
    const panel = within(dialog).getByRole("region", {
      name: "Calendário de agendamento",
    });
    expect(dialog).toContainElement(panel);
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(date).toHaveFocus();
    expect(within(dialog).queryByRole("region")).not.toBeInTheDocument();
    fireEvent.keyDown(date, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function StackedModals({ busy = false }: { busy?: boolean }) {
    const [first, setFirst] = useState(false);
    const [second, setSecond] = useState(false);
    return (
      <>
        <button onClick={() => setFirst(true)}>Abrir primeiro</button>
        {first && (
          <Modal
            title="Primeiro"
            subtitle="Modal de baixo"
            onClose={() => setFirst(false)}
          >
            <button onClick={() => setSecond(true)}>Abrir segundo</button>
          </Modal>
        )}
        {second && (
          <Modal
            title="Segundo"
            subtitle="Modal de cima"
            busy={busy}
            onClose={() => setSecond(false)}
          >
            <p>Conteúdo do segundo</p>
          </Modal>
        )}
      </>
    );
  }

  it("does not close a modal when the backdrop is clicked", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(
      screen.getByRole("dialog", { name: "Primeiro" }),
    ).toBeInTheDocument();
  });

  it("closes only the top modal with Esc", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Segundo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Primeiro" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables the close button and ignores Esc while the modal is busy", () => {
    render(<StackedModals busy />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    const top = screen.getByRole("dialog", { name: "Segundo" });
    expect(within(top).getByRole("button", { name: "Fechar" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    // O de cima está salvando: Esc não fecha ele nem o de baixo.
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
  });

  it("keeps the wide group modal open on backdrop click and closes it with Esc", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/groups/workspace?")
        ? {
            groups: [],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    await screen.findByRole("dialog", { name: "Nova turma" });
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    const dialog = screen.getByRole("dialog", { name: "Nova turma" });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Dados da turma" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Horários semanais" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Resumo da turma" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Serviço")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Nova turma" }),
    ).not.toBeInTheDocument();
  });
});

describe("application shell", () => {
  it("edits group capacity and weekly hours in a centered modal", async () => {
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
    const group = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Pilates Turma A",
      sequence: 1,
      serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      capacity: 4,
      activeEnrollments: 2,
      waitlistCount: 0,
      weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
      active: true,
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PUT"
          ? { ...group, capacity: 5 }
          : url.includes("/groups/workspace?")
            ? {
                groups: [group],
                enrollments: [],
                sessions: [],
                attendance: [],
                replacementCredits: [],
              }
            : url.includes("/rooms")
              ? [{ id: group.roomId, name: group.roomName, capacity: 8 }]
              : url.includes("/services")
                ? [{ id: group.serviceId, name: group.serviceName }]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Serviço"), {
      target: { value: group.serviceId },
    });
    expect(screen.getByText("Pilates Turma B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getByText("Turma de terça da noite")).toBeInTheDocument();
    expect(screen.getByText("Terça · 18:00–19:00")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir turma" }));
    const dialog = screen.getByRole("dialog", { name: "Pilates Turma A" });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Participantes" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Máximo de pessoas"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar horário" }));
    fireEvent.change(screen.getAllByLabelText("Dia")[1]!, {
      target: { value: "4" },
    });
    fireEvent.change(screen.getAllByLabelText("Término")[1]!, {
      target: { value: "10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call?.[0]).toContain(`/groups/${group.id}`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        capacity: 5,
        weeklySlots: [
          { weekday: 2, startTime: "18:00", endTime: "19:00" },
          { weekday: 4, startTime: "09:00", endTime: "10:30" },
        ],
      });
    });
  });

  it("shows appointments in the monthly agenda and opens a selected day", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const groupStartsAt = new Date(startsAt);
    groupStartsAt.setHours(18, 0, 0, 0);
    const groupSession = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      groupId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      groupName: "Pilates Turma A",
      professionalName: "Dra. Ana Martins",
      roomName: "Estúdio 1",
      startsAt: groupStartsAt.toISOString(),
      endsAt: new Date(groupStartsAt.getTime() + 60 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?")
              ? [appointment]
              : String(input).includes("/group-sessions?")
                ? [groupSession]
                : [],
        }) as Response,
    );

    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", {
      name: /1 atendimentos, 1 aulas de turma, 0 bloqueios/,
    });
    expect(screen.getByText("Pilates Turma A")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ turmas?$/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Detalhes de Helena Almeida/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Detalhes do atendimento" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day);
    const dayDialog = screen.getByRole("dialog");
    expect(dayDialog).toHaveTextContent("2 eventos neste dia.");
    expect(dayDialog).toHaveTextContent(
      "Pilates Turma ADra. Ana Martins · Estúdio 1",
    );
    expect(dayDialog.textContent!.indexOf("Helena Almeida")).toBeLessThan(
      dayDialog.textContent!.indexOf("Pilates Turma A"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(day.closest(".month-day")!);
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir dia na agenda" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Pilates Turma A" }),
    ).toHaveTextContent("Dra. Ana Martins · Estúdio 1");
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(await screen.findByText("10:00–10:50")).toBeInTheDocument();
    expect(screen.getByText("18:00–19:00")).toBeInTheDocument();
  });

  it("lists appointments and group classes in chronological order", async () => {
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
    const at = (hours: number) => {
      const value = new Date();
      value.setHours(hours, 0, 0, 0);
      return value;
    };
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: at(10).toISOString(),
      endsAt: at(11).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const session = (id: string, groupName: string, hours: number) => ({
      id,
      groupId: id,
      groupName,
      professionalName: "Dr. Paulo Nunes",
      roomName: "Estúdio 1",
      startsAt: at(hours).toISOString(),
      endsAt: at(hours + 1).toISOString(),
      status: "scheduled",
    });
    const sessions = [
      session("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Pilates Turma B", 18),
      session(
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "Dançaterapia Turma A",
        8,
      ),
    ];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/appointments?")
              ? [appointment]
              : String(input).includes("/group-sessions?")
                ? sessions
                : [],
        }) as Response,
    );
    const order = (container: Element) => {
      const text = container.textContent ?? "";
      return ["Dançaterapia Turma A", "Helena Almeida", "Pilates Turma B"].map(
        (name) => text.indexOf(name),
      );
    };
    const isAscending = (positions: number[]) =>
      positions.every(
        (value, index) =>
          value >= 0 && (index === 0 || value > positions[index - 1]!),
      );

    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".day-agenda")!))).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await screen.findByText("Helena Almeida");
    expect(isAscending(order(container.querySelector(".week-agenda")!))).toBe(
      true,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const today = await screen.findByRole("button", {
      name: /1 atendimentos, 2 aulas de turma/,
    });
    const cell = today.closest(".month-day")!;
    expect(cell).toHaveTextContent("Dançaterapia Turma A");
    expect(cell.textContent!.indexOf("Dançaterapia Turma A")).toBeLessThan(
      cell.textContent!.indexOf("Helena Almeida"),
    );
    expect(cell).toHaveTextContent("+1 evento");
  });

  it("shows patient and booking details before cancelling an appointment", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      notes: "Primeira consulta",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PATCH"
          ? { ...appointment, status: "cancelled" }
          : url.includes("/appointments?") ||
              url.includes("/appointments/options?")
            ? [appointment]
            : url.includes("/patients")
              ? [
                  {
                    id: appointment.patientId,
                    fullName: appointment.patientName,
                    recordNumber: "PAC-00001",
                    phone: "11987654321",
                    email: "helena@example.com",
                    cpf: "12345678901",
                    status: "active",
                    tags: ["Retorno"],
                  },
                ]
              : url.includes("/services")
                ? [
                    {
                      id: appointment.serviceId,
                      durationMinutes: 50,
                      priceInCents: 12000,
                    },
                  ]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(screen.getByText("helena@example.com")).toBeInTheDocument();
    expect(screen.getByText("Primeira consulta")).toBeInTheDocument();
    expect(screen.getByText(/50 min/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar atendimento" }),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "PATCH"),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
      target: { value: "Cliente desmarcou" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PATCH");
      expect(call?.[0]).toContain(`/appointments/${appointment.id}/status`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        status: "cancelled",
        absenceReason: "Cliente desmarcou",
      });
    });
    expect(
      await screen.findByRole("link", { name: "Avisar cliente por WhatsApp" }),
    ).toBeInTheDocument();
  });

  it("navigates the management report tabs", async () => {
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
    const month = new Date().toLocaleDateString("sv-SE").slice(0, 7);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (!String(input).includes("/reports/sales?")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          current: {
            from: `${month}-01`,
            to: `${month}-15`,
            netSalesInCents: 120000,
            grossSalesInCents: 130000,
            cancelledSalesInCents: 10000,
            receivedInCents: 90000,
            attendedPatients: 14,
          },
          previousComparable: { from: "2026-08-01", to: "2026-08-15" },
          changePercent: 20,
          sales: [
            {
              id: "sale-1",
              occurredAt: `${month}-10T12:00:00Z`,
              itemName: "Plano de fisioterapia",
              patientName: "Helena Almeida",
              kind: "sale",
              amountInCents: 120000,
            },
          ],
          patientsWithoutReturn: [
            {
              patientId: "patient-1",
              patientName: "Helena Almeida",
              lastCompletedAt: "2026-08-20T15:00:00Z",
            },
          ],
        }),
      } as Response;
    });

    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Relatórios gerenciais" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Visão geral" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Clientes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Sem retorno" }));
    expect(
      await screen.findByRole("heading", { name: "Clientes sem retorno" }),
    ).toBeInTheDocument();
  });

  it("shows monthly sales and patients without return directly on the manager dashboard", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/reports/sales?")
        ? {
            month: "2026-09",
            current: {
              to: "2026-09-15",
              netSalesInCents: 120000,
              receivedInCents: 90000,
              attendedPatients: 14,
            },
            changePercent: 20,
            patientsWithoutReturn: [
              {
                patientId: "99999999-9999-4999-8999-999999999999",
                patientName: "Helena Almeida",
                lastCompletedAt: "2026-08-20T15:00:00Z",
              },
            ],
          }
        : {
            appointmentsToday: 3,
            nonCancelledAppointmentsToday: 3,
            pendingToday: 2,
            awaitingConfirmationToday: 2,
            completedToday: 1,
            patientsActive: 40,
            noShowsThisMonth: 1,
            nextAppointments: [],
          };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Clientes sem retorno" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Vendas e retorno dos clientes" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/1\.200,00/)).not.toBeInTheDocument();
    expect(screen.getByText("Helena Almeida")).toBeInTheDocument();
    expect(screen.queryByText("Cadastros incompletos")).not.toBeInTheDocument();
    expect(
      screen.getByText("Studios Aryana", { selector: ".clinic-label" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aryana Dutra")).toBeInTheDocument();
    expect(screen.queryByText(/Movimenta/i)).not.toBeInTheDocument();
  });

  it("shows the login when there is no session", () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Acesse sua clínica" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Studios Aryana")).toBeInTheDocument();
    expect(
      screen.getByText("Studios Aryana", { selector: ".brand-name" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".brand-mark")).toBeNull();
    expect(
      screen.getByText("admin@movimenta.local · Admin@123"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^movimenta$/i)).not.toBeInTheDocument();
  });

  it("opens the SOAP editor for an authenticated clinical user", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const patient = {
        id: "99999999-9999-4999-8999-999999999999",
        fullName: "Helena Almeida",
      };
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/clinical-records")
          ? []
          : url.includes("/patients")
            ? [patient]
            : [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  patientId: patient.id,
                  patientName: "Helena Almeida",
                  professionalName: "Dra. Ana Martins",
                  startsAt: new Date().toISOString(),
                  status: "completed",
                },
              ];
      return { ok: true, status: 200, json: async () => body } as Response;
    });

    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Prontuários" }),
    ).toBeInTheDocument();
    const newRecord = await screen.findByRole("button", {
      name: "Nova evolução",
    });
    fireEvent.click(newRecord);
    expect(
      screen.getByRole("heading", { name: "Nova evolução clínica" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/S — Subjetivo/)).toBeInTheDocument();
  });

  it("opens a plan sale with patient and service data", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/patients")
        ? [
            {
              id: "99999999-9999-4999-8999-999999999999",
              fullName: "Helena Almeida",
            },
          ]
        : url.includes("/services")
          ? [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Fisioterapia individual",
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    const action = await screen.findByRole("button", { name: "Novo plano" });
    fireEvent.click(action);
    expect(
      screen.getByRole("heading", { name: "Novo plano" }),
    ).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Cliente" });
    expect(picker).toHaveValue("");
    fireEvent.change(picker, {
      target: { value: "Helena Almeida" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: "Helena Almeida" }),
    );
    expect(picker).toHaveValue("Helena Almeida");
  });

  it("renews a plan with the next period already filled in", async () => {
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
    const plan = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    let renewalBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes(`/plans/${plan.id}/renew`)) {
        renewalBody = JSON.parse(String(init?.body));
        const renewed = {
          ...plan,
          ...renewalBody,
          id: "66666666-6666-4666-8666-666666666666",
          remainingSessions: 8,
          renewedFromPlanId: plan.id,
        };
        return { ok: true, status: 201, json: async () => renewed } as Response;
      }
      const body = url.includes("/plans") ? [plan] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/^Automática em 01 de out/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renovar" }));
    expect(
      screen.getByRole("heading", { name: "Renovar plano" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Fim da validade")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Primeiro vencimento")).toHaveValue(
      "2026-10-05",
    );
    // Plano é fixo: sessões e valor da renovação repetem o plano atual.
    expect(screen.getByLabelText("Valor do serviço 1")).toHaveAttribute(
      "readonly",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Renovar plano e gerar parcelas" }),
    );
    expect(
      await screen.findByText(/^Renovado a partir de 01 de out/),
    ).toBeInTheDocument();
    expect(renewalBody).toMatchObject({
      validFrom: "2026-10-01",
      totalValueInCents: 40000,
      autoRenew: true,
    });
    expect(renewalBody).not.toHaveProperty("patientId");
  });

  it("filters patients by status, tags and record data", async () => {
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
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const otherMonth = String(((new Date().getMonth() + 1) % 12) + 1).padStart(
      2,
      "0",
    );
    const patient = (
      id: string,
      fullName: string,
      extra: Record<string, unknown>,
    ) => ({
      id,
      clinicId: "11111111-1111-4111-8111-111111111111",
      recordNumber: `PAC-${id.slice(-3)}`,
      fullName,
      phone: "11987654321",
      tags: [],
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...extra,
    });
    const patients = [
      patient("a0000000-0000-4000-8000-000000000001", "Ana Lima", {
        tags: ["Pilates"],
        email: "ana@example.com",
        birthDate: `1990-${month}-10`,
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
      patient("a0000000-0000-4000-8000-000000000002", "Bruno Souza", {
        tags: ["Fisioterapia"],
        status: "inactive",
        birthDate: `1985-${otherMonth}-02`,
      }),
      patient("a0000000-0000-4000-8000-000000000003", "Carla Dias", {
        tags: ["Pilates", "Frequente"],
        email: "carla@example.com",
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
    ];
    const tags = [
      patientTag("Fisioterapia", "#2563eb", 1),
      patientTag("Frequente", "#facc15", 1),
      patientTag("Pilates", "#2f855a", 2),
    ];
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/patient-tags") ? tags : patients,
        }) as Response,
    );
    // O endereço antigo redireciona para /clientes.
    render(
      <MemoryRouter initialEntries={["/pacientes"]}>
        <App />
      </MemoryRouter>,
    );
    const names = () =>
      screen
        .queryAllByRole("button", { name: /^Editar / })
        .map((row) => row.getAttribute("aria-label"));
    await screen.findByRole("button", { name: "Editar Ana Lima" });
    expect(names()).toEqual([
      "Editar Ana Lima",
      "Editar Bruno Souza",
      "Editar Carla Dias",
    ]);
    expect(
      within(
        screen
          .getByRole("button", { name: "Editar Bruno Souza" })
          .closest<HTMLElement>(".patient-row")!,
      ).getByText("Inativo"),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Filtros/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Inativos" }),
    ).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
    expect(names()).toEqual(["Editar Bruno Souza"]);
    expect(screen.getByText("de 3 clientes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pilates/ }));
    expect(names()).toEqual(["Editar Ana Lima", "Editar Carla Dias"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "oldest" },
    });
    expect(names()).toEqual(["Editar Carla Dias", "Editar Ana Lima"]);
    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "birthday_month" },
    });
    expect(names()).toEqual(["Editar Ana Lima"]);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent(
      "2",
    );

    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "without_email" },
    });
    expect(
      screen.getByText("Nenhum cliente com esses filtros"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Limpar filtros" })[0]!,
    );
    // Limpar mantém a ordenação escolhida (cadastro mais antigo primeiro).
    expect(names()).toEqual([
      "Editar Bruno Souza",
      "Editar Carla Dias",
      "Editar Ana Lima",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Editar Carla Dias" }));
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
  });

  it("opens a patient record for correction and saves the changed name", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Retorno"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const body =
        options?.method === "PUT"
          ? { ...patient, fullName: "Helena Pereira" }
          : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Helena Pereira" },
    });
    fireEvent.change(screen.getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    fireEvent.change(screen.getByLabelText("WhatsApp"), {
      target: { value: "11 90000-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Helena Pereira")).toBeInTheDocument();
    const updateCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PUT");
    expect(updateCall?.[0]).toContain(`/patients/${patient.id}`);
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      fullName: "Helena Pereira",
      whatsapp: "11900001234",
      tags: ["Retorno"],
    });
  });

  it("shows the patient history with values and a filter by type", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
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
    const timeline = [
      {
        id: "appointment:1",
        kind: "appointment",
        occurredAt: "2026-09-20T13:00:00.000Z",
        title: "Atendimento de Pilates",
        detail: "Com Dra. Ana Martins",
        status: "completed",
      },
      {
        id: "payment_reversal:2",
        kind: "payment_reversal",
        occurredAt: "2026-09-12T13:00:00.000Z",
        title: "Pagamento estornado",
        amountInCents: -18000,
      },
      {
        id: "payment:3",
        kind: "payment",
        occurredAt: "2026-09-10T13:00:00.000Z",
        title: "Pagamento recebido",
        detail: "Pix",
        amountInCents: 18000,
      },
      {
        id: "satisfaction:4",
        kind: "satisfaction",
        occurredAt: "2026-09-05T13:00:00.000Z",
        title: "Avaliação de satisfação",
        score: 9,
      },
    ];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? timeline : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    const history = await screen.findByRole("region", { name: "Histórico" });
    expect(
      await within(history).findByText("Atendimento de Pilates"),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes(`/patients/${patient.id}/timeline`),
        ),
    ).toBe(true);
    expect(
      within(history).getByText("Com Dra. Ana Martins"),
    ).toBeInTheDocument();
    expect(within(history).getByText(/^R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText(/^-\s*R\$\s*180,00$/)).toBeInTheDocument();
    expect(within(history).getByText("Nota 9")).toBeInTheDocument();
    expect(within(history).getByText(/20 de set\./)).toBeInTheDocument();
    fireEvent.click(
      within(history).getByRole("button", { name: "Pagamentos" }),
    );
    expect(within(history).getByText("Pagamento recebido")).toBeInTheDocument();
    expect(
      within(history).getByText("Pagamento estornado"),
    ).toBeInTheDocument();
    expect(
      within(history).queryByText("Atendimento de Pilates"),
    ).not.toBeInTheDocument();
    expect(
      within(history).queryByText("Avaliação de satisfação"),
    ).not.toBeInTheDocument();
    fireEvent.click(within(history).getByRole("button", { name: "Todos" }));
    expect(
      within(history).getByText("Atendimento de Pilates"),
    ).toBeInTheDocument();
  });

  it("does not load the patient history for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
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
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => [patient] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    expect(
      screen.getByRole("heading", { name: "Editar cliente" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Histórico" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/timeline")),
    ).toBe(false);
  });

  it("lets reception reschedule a visible appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    const next = new Date(start);
    next.setHours(11, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana Martins",
      professionalColor: "#5c6f68",
      roomId: "55555555-5555-4555-8555-555555555555",
      roomName: "Sala Movimento",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 50 * 60_000).toISOString(),
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      const body =
        options?.method === "PUT"
          ? { ...appointment, startsAt: next.toISOString() }
          : url.includes("/appointments?") ||
              url.includes("/appointments/options?")
            ? [appointment]
            : url.includes("/professionals")
              ? [
                  {
                    id: appointment.professionalId,
                    fullName: appointment.professionalName,
                    color: appointment.professionalColor,
                  },
                ]
              : url.includes("/rooms")
                ? [{ id: appointment.roomId, name: appointment.roomName }]
                : url.includes("/services")
                  ? [
                      {
                        id: appointment.serviceId,
                        name: appointment.serviceName,
                      },
                    ]
                  : url.includes("/patients")
                    ? [
                        {
                          id: appointment.patientId,
                          fullName: appointment.patientName,
                        },
                      ]
                    : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remarcar atendimento" }),
    );
    expect(
      screen.getByRole("heading", { name: "Reagendar atendimento" }),
    ).toBeInTheDocument();
    const reschedule = screen.getByRole("dialog", {
      name: "Reagendar atendimento",
    });
    fireEvent.click(within(reschedule).getByRole("button", { name: "Data" }));
    expect(
      await within(reschedule).findByText("Nenhum compromisso registrado."),
    ).toBeInTheDocument();
    expect(
      reschedule.querySelector('[data-date][aria-pressed="true"]'),
    ).toHaveAttribute("data-date", start.toLocaleDateString("sv-SE"));
    fireEvent.change(within(reschedule).getByLabelText("Horário"), {
      target: { value: "11:00" },
    });
    expect(within(reschedule).getByLabelText("Horário")).toHaveValue("11:00");
    fireEvent.click(
      within(reschedule).getByRole("button", { name: "Fechar calendário" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar reagendamento" }),
    );
    const updateCall = await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "PUT");
      expect(call).toBeDefined();
      return call;
    });
    expect(updateCall?.[0]).toContain(
      `/appointments/${appointment.id}/schedule`,
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      professionalId: appointment.professionalId,
      roomId: appointment.roomId,
      startsAt: next.toISOString(),
    });
  });

  it("lists suggested contacts, opens WhatsApp and records a contact", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const suggestions = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        reason: "plan_expiring",
        referenceKey: "plan-1:2026-10-05",
        detail: "Plano termina em 3 dias",
        dueDate: "2026-10-05",
        priority: 2,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        reason: "single_no_return",
        referenceKey: "appt-9",
        detail: "Veio uma vez há 70 dias e não voltou",
        priority: 5,
      },
    ];
    const settings = {
      birthdayDaysAhead: 7,
      singleNoReturnDays: 60,
      planExpiringDays: 7,
      lowBalanceSessions: 2,
      expiredWithBalanceDays: 60,
      treatmentPausedDays: 30,
      repeatedNoShowCount: 2,
      repeatedNoShowWindowDays: 30,
      formerClientMinDays: 30,
      formerClientMaxDays: 90,
      messages: {
        birthday: "Parabéns, {{nome}}!",
        single_no_return: "Oi {{nome}}, sentimos sua falta.",
        plan_expiring: "Oi {{nome}}, seu plano está acabando.",
        low_balance: "x",
        expired_with_balance: "x",
        treatment_paused: "x",
        repeated_no_show: "x",
        former_client: "x",
        overdue_payment: "x",
        nps_detractor: "x",
      },
    };
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "a1",
            clinicId: "c1",
            actorUserId: "u1",
            createdAt: "2026-09-29T12:00:00.000Z",
            ...activityBody,
          }),
        } as Response;
      }
      const body = url.includes("/relationship/suggestions")
        ? suggestions
        : url.includes("/relationship/settings")
          ? settings
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: /Contatos sugeridos/ }),
    ).toBeInTheDocument();
    const helenaCard = (await screen.findByText("Helena Almeida")).closest(
      "article",
    )!;
    expect(
      within(helenaCard).getByText("Plano termina em 3 dias"),
    ).toBeInTheDocument();
    expect(within(helenaCard).getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(
      within(helenaCard).queryByRole("link", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(helenaCard);
    const helenaDetails = screen.getByRole("dialog", {
      name: "Pendências de Helena",
    });
    const whatsapp = within(helenaDetails).getByRole("link", {
      name: /WhatsApp/,
    });
    expect(whatsapp).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Oi Helena, seu plano está acabando.")}`,
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveClass("whatsapp-button");
    expect(whatsapp.getAttribute("rel")).toMatch(/\bnoopener\b/);
    fireEvent.click(
      within(helenaDetails).getByRole("button", { name: "Fechar" }),
    );
    const brunoCard = screen.getByText("Bruno Souza").closest("article")!;
    fireEvent.click(
      within(brunoCard).getByText("Veio uma vez há 70 dias e não voltou"),
    );
    const brunoDetails = screen.getByRole("dialog", {
      name: "Pendências de Bruno",
    });
    expect(
      within(brunoDetails).getByRole("link", { name: /WhatsApp/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511955556666?text=${encodeURIComponent("Oi Bruno, sentimos sua falta.")}`,
    );
    fireEvent.click(
      within(brunoDetails).getByRole("button", { name: "Fechar" }),
    );

    const filters = screen.getByRole("group", { name: "Situação" });
    expect(
      within(filters).getByRole("button", { name: /Todas\s*2/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(filters).getByRole("button", { name: /Plano acabando\s*1/ }),
    );
    expect(screen.queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(within(filters).getByRole("button", { name: /Todas/ }));

    fireEvent.click(
      within(helenaCard).getByRole("button", {
        name: "Ver pendências de Helena Almeida",
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Pendências de Helena" }),
      ).getByRole("button", { name: "Registrar contato" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar contato" });
    expect(
      within(dialog).queryByLabelText("Adiar até"),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Resultado"), {
      target: { value: "snoozed" },
    });
    fireEvent.change(within(dialog).getByLabelText("Adiar até"), {
      target: { value: "2099-01-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Observação"), {
      target: { value: "Pediu para ligar depois" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar contato" }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText("Helena Almeida")).not.toBeInTheDocument(),
    );
    expect(activityBody).toEqual({
      patientId: suggestions[0]!.patientId,
      reason: "plan_expiring",
      referenceKey: "plan-1:2026-10-05",
      outcome: "snoozed",
      notes: "Pediu para ligar depois",
      snoozeUntil: "2099-01-10",
    });
    expect(screen.getByText("Bruno Souza")).toBeInTheDocument();
    expect(
      within(filters).getByRole("button", { name: /Todas\s*1/ }),
    ).toBeInTheDocument();
  });

  it("shows upcoming birthdays on the dashboard with congratulations and a sent marker", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const suggestions = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        reason: "birthday",
        referenceKey: "99999999-9999-4999-8999-999999999999:2026",
        detail: "Aniversário hoje",
        dueDate: "2026-10-10",
        priority: 1,
      },
      {
        patientId: "77777777-7777-4777-8777-777777777777",
        patientName: "Carla Dias",
        phone: "11933334444",
        reason: "birthday",
        referenceKey: "77777777-7777-4777-8777-777777777777:2026",
        detail: "Aniversário em 3 dias (13/10)",
        dueDate: "2026-10-13",
        priority: 2,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        reason: "single_no_return",
        referenceKey: "appt-9",
        detail: "Veio uma vez",
        priority: 3,
      },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "a1", ...activityBody }),
        } as Response;
      }
      const body = url.includes("/relationship/suggestions")
        ? suggestions
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : url.includes("/dashboard")
            ? {
                appointmentsToday: 0,
                nonCancelledAppointmentsToday: 0,
                pendingToday: 0,
                awaitingConfirmationToday: 0,
                completedToday: 0,
                patientsActive: 3,
                noShowsThisMonth: 0,
                nextAppointments: [],
              }
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Aniversariantes" })
    ).closest("section")!;
    await waitFor(() =>
      expect(card).toHaveTextContent("Hoje e próximos 7 dias"),
    );
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    expect(within(helena).getByText("Aniversário hoje")).toBeInTheDocument();
    const congratulate = within(helena).getByRole("link", {
      name: /Dar parabéns/,
    });
    expect(congratulate).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`,
    );
    expect(congratulate).toHaveAttribute("target", "_blank");
    expect(congratulate).toHaveClass("whatsapp-button", "button-sm");
    expect(congratulate.getAttribute("rel")).toMatch(/\bnoopener\b/);
    const carla = within(card)
      .getByText("Carla Dias")
      .closest(".attention-item") as HTMLElement;
    expect(
      within(carla).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511933334444?text=${encodeURIComponent("Parabéns, Carla!")}`,
    );
    expect(within(card).queryByText("Bruno Souza")).not.toBeInTheDocument();
    fireEvent.click(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    );
    await vi.waitFor(() =>
      expect(
        within(card).queryByText("Helena Almeida"),
      ).not.toBeInTheDocument(),
    );
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      outcome: "contacted",
    });
    expect(within(card).getByText("Carla Dias")).toBeInTheDocument();
  });

  it("does not load birthdays on the dashboard for physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/dashboard")
              ? {
                  appointmentsToday: 0,
                  nonCancelledAppointmentsToday: 0,
                  pendingToday: 0,
                  awaitingConfirmationToday: 0,
                  completedToday: 0,
                  patientsActive: 3,
                  noShowsThisMonth: 0,
                  nextAppointments: [],
                }
              : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Atendimentos hoje")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Aniversariantes" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });

  it("lists the month's birthdays in the relationship page with a month picker", async () => {
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
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .slice(0, 7);
    const entries = [
      {
        patientId: "99999999-9999-4999-8999-999999999999",
        patientName: "Helena Almeida",
        phone: "11987654321",
        whatsapp: "11911112222",
        birthDate: "1990-02-03",
        date: "2027-02-03",
        day: 3,
        ageTurning: 37,
        referenceKey: "99999999-9999-4999-8999-999999999999:2027",
        congratulated: false,
      },
      {
        patientId: "88888888-8888-4888-8888-888888888888",
        patientName: "Bruno Souza",
        phone: "11955556666",
        birthDate: "2000-02-29",
        date: "2027-02-28",
        day: 28,
        ageTurning: 27,
        referenceKey: "88888888-8888-4888-8888-888888888888:2027",
        congratulated: true,
      },
    ];
    let activityBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/activities") && init?.method === "POST") {
        activityBody = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "a1", ...activityBody }),
        } as Response;
      }
      const body = url.includes("/relationship/birthdays?month=2027-02")
        ? entries
        : url.includes("/relationship/settings")
          ? relationshipSettingsFixture()
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    const tabs = await screen.findByRole("group", { name: "Visão" });
    expect(
      within(tabs).getByRole("button", { name: "Contatos sugeridos" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(tabs).getByRole("button", { name: "Aniversários do mês" }),
    );
    const monthInput = await screen.findByLabelText("Mês");
    expect(monthInput).toHaveValue(currentMonth);
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) =>
            String(url).includes(
              `/relationship/birthdays?month=${currentMonth}`,
            ),
          ),
      ).toBe(true),
    );
    expect(
      await screen.findByText("Nenhum aniversariante neste mês"),
    ).toBeInTheDocument();
    fireEvent.change(monthInput, { target: { value: "2027-02" } });
    const helena = (await screen.findByText("Helena Almeida")).closest(
      "article",
    )!;
    expect(helena).toHaveTextContent("03 de fev.");
    expect(helena).toHaveTextContent("Completa 37 anos");
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveAttribute(
      "href",
      `https://wa.me/5511911112222?text=${encodeURIComponent("Parabéns, Helena!")}`,
    );
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toHaveClass("whatsapp-button", "button-sm");
    expect(
      within(helena)
        .getByRole("link", { name: /Dar parabéns/ })
        .getAttribute("rel"),
    ).toMatch(/\bnoopener\b/);
    const bruno = screen.getByText("Bruno Souza").closest("article")!;
    expect(bruno).toHaveTextContent("28 de fev.");
    expect(within(bruno).getByText("Parabéns enviado")).toBeInTheDocument();
    expect(
      within(bruno).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    );
    expect(
      await within(helena).findByText("Parabéns enviado"),
    ).toBeInTheDocument();
    expect(activityBody).toEqual({
      patientId: "99999999-9999-4999-8999-999999999999",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2027",
      outcome: "contacted",
    });
  });

  it("hides suggested contacts from physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response,
    );
    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: /Contatos sugeridos/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Contatos sugeridos" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });
  it("lets the owner edit relationship deadlines and messages in settings", async () => {
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
    const settings = relationshipSettingsFixture();
    let putBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/settings") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return { ok: true, status: 200, json: async () => putBody } as Response;
      }
      const body = url.includes("/relationship/settings")
        ? settings
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
    const section = await openSettingsSection("Prazos e mensagens");
    expect(await within(section).findByText("{{nome}}")).toBeInTheDocument();
    expect(section).toHaveTextContent("primeiro nome do cliente");
    const planDays = await within(section).findByLabelText(
      "Plano acabando: avisar quantos dias antes do fim",
    );
    expect(planDays).toHaveValue(7);
    fireEvent.change(planDays, { target: { value: "10" } });
    fireEvent.change(within(section).getByLabelText("Mensagem: Aniversário"), {
      target: { value: "Feliz aniversário, {{nome}}!" },
    });
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Salvar prazos e mensagens",
      }),
    );
    await vi.waitFor(() => expect(putBody).toBeDefined());
    expect(putBody).toEqual({
      ...settings,
      planExpiringDays: 10,
      messages: {
        ...settings.messages,
        birthday: "Feliz aniversário, {{nome}}!",
      },
    });
    expect(
      await within(section).findByText("Prazos e mensagens salvos."),
    ).toBeInTheDocument();
  });

  it("shows relationship settings read-only to reception", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const settings = relationshipSettingsFixture();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings") ? settings : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Prazos e mensagens");
    const planDays = await within(section).findByLabelText(
      "Plano acabando: avisar quantos dias antes do fim",
    );
    expect(planDays).toHaveValue(7);
    expect(planDays).toHaveAttribute("readonly");
    expect(
      within(section).getByLabelText("Mensagem: Veio uma vez"),
    ).toHaveValue("Oi {{nome}}, sentimos sua falta.");
    expect(
      within(section).getByLabelText("Mensagem: Veio uma vez"),
    ).toHaveAttribute("readonly");
    expect(
      within(section).queryByRole("button", {
        name: "Salvar prazos e mensagens",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Usuários" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/admin/")),
    ).toBe(false);
  });

  it("does not show relationship settings to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response,
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("heading", { name: "Prazos e mensagens" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/relationship/")),
    ).toBe(false);
  });

  it("shows the professional CREFITO in the clinical list and print summary", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      recordNumber: 12,
    };
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: patient.id,
      professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "finalized",
      version: 2,
      authorName: "Aryana Dutra",
      patientName: "Helena Almeida",
      professionalName: "Dra. Ana Martins",
      professionalCrefito: "CREFITO-3 123456-F",
      appointmentStartsAt: new Date().toISOString(),
      subjective: "Relato",
      objective: "Exame",
      assessment: "Evolução positiva",
      plan: "Manter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [record],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
            attachments: [],
            addenda: [],
          }
        : url.includes("/clinical-records")
          ? [record]
          : url.includes("/patients")
            ? [patient]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Evoluções" }));
    expect(
      await screen.findByText(
        "Dra. Ana Martins · CREFITO-3 123456-F · versão 2",
      ),
    ).toBeInTheDocument();
    const summary = (
      await screen.findByText("Prontuário longitudinal")
    ).closest(".clinical-print-summary")!;
    expect(summary).toHaveTextContent("Dra. Ana Martins · CREFITO-3 123456-F");
  });

  it("offers the contracts page in the menu and redirects the old documents route", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/documentos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: "Contratos" }),
    ).toHaveAttribute("href", "/contratos");
    expect(
      await screen.findByRole("heading", { name: "Contratos", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Nenhum modelo")).toBeInTheDocument();
    expect(screen.getByText("Nenhum documento")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Documentos" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\{\{atendimento_data\}\}/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\{\{servico_nome\}\}/)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).endsWith("/document-templates"),
        ),
    ).toBe(true);
  });

  it("hides the contracts page from physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Fisio",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("link", { name: "Agenda" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Contratos" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/document")),
    ).toBe(false);
  });

  it("issues a document with an optional professional", async () => {
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
    const template = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Contrato padrão",
      kind: "contract",
      version: 1,
      body: "Contrato",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
    };
    const professional = {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      fullName: "Dra. Ana Martins",
      crefito: "CREFITO-3 123456-F",
      active: true,
    };
    const posted: Record<string, unknown>[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/documents/preview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshotBody: "Contrato preparado para Helena Almeida.",
            snapshotContent: {
              version: 1,
              doc: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Contrato preparado para Helena Almeida.",
                      },
                    ],
                  },
                ],
              },
            },
            branding: {
              name: "Studios Aryana",
              logoDataUrl: "",
              timezone: "America/Sao_Paulo",
            },
            missingFields: [],
            templateName: template.name,
            templateVersion: 1,
            patientName: patient.fullName,
          }),
        } as Response;
      }
      if (url.endsWith("/documents") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...JSON.parse(String(init?.body)),
            id: "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0",
            status: "draft",
            patientName: patient.fullName,
            templateName: template.name,
            snapshotBody: "Contrato preparado para Helena Almeida.",
          }),
        } as Response;
      }
      const body = url.includes("/document-templates")
        ? [template]
        : url.includes("/patients")
          ? [patient]
          : url.includes("/professionals")
            ? [professional]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Criar modelo" }));
    fireEvent.click(screen.getByText("Inserir campo automático"));
    expect(
      await within(
        await screen.findByRole("group", { name: "Inserir campo" }),
      ).findByRole("button", { name: "Profissional" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Inserir campo" })).getByRole(
        "button",
        { name: "CREFITO do profissional" },
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Documentos" }));
    installDocumentBrowserMocks();
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    const select = await screen.findByLabelText("Profissional (opcional)");
    expect(
      within(select).getByRole("option", {
        name: "Dra. Ana Martins · CREFITO-3 123456-F",
      }),
    ).toBeInTheDocument();
    const issue = screen.getByRole("button", { name: "Preparar conteúdo" });
    expect(issue).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: patient.fullName },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: patient.fullName }),
    );
    fireEvent.click(issue);
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).not.toHaveProperty("professionalId");
    expect(posted[0]).not.toHaveProperty("appointmentId");
    await waitFor(() =>
      expect(screen.getByText("Fechar", { selector: "button" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByText("Fechar", { selector: "button" }));
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: patient.fullName },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: patient.fullName }),
    );
    fireEvent.change(screen.getByLabelText("Profissional (opcional)"), {
      target: { value: professional.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Conferir PDF" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({
      templateId: template.id,
      patientId: patient.id,
      professionalId: professional.id,
    });
  });

  it("issues a draft document and prints the issued content", async () => {
    installDocumentBrowserMocks();
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const snapshot =
      "CONTRATO\n\nStudios Aryana e Helena Almeida firmam o presente instrumento.";
    const draft = {
      id: "d-1",
      clinicId: "c-1",
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "99999999-9999-4999-8999-999999999999",
      title: "Contrato de prestação de serviços",
      templateName: "Contrato padrão",
      templateVersion: 1,
      patientName: "Helena Almeida",
      snapshotBody: snapshot,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const patched: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/documents/d-1/status") && init?.method === "PATCH") {
        patched.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...draft,
            status: "issued",
            issuedAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/documents") ? [draft] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Contrato de prestação de serviços", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Imprimir" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Emitir" }));
    const confirmIssue = await screen.findByRole("button", {
      name: "Emitir contrato",
    });
    await waitFor(() => expect(confirmIssue).toBeEnabled());
    fireEvent.click(confirmIssue);
    await vi.waitFor(() => expect(patched).toEqual([{ status: "issued" }]));
    fireEvent.click(await screen.findByRole("button", { name: "Imprimir" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Studios Aryana e Helena Almeida firmam/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Imprimir documento" }),
    );
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("creates a new template version in a modal keeping line breaks", async () => {
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
    const template = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Contrato padrão",
      kind: "contract",
      version: 1,
      body: "CONTRATO\n\n{{clinica_nome}} e {{paciente_nome}} firmam.",
      active: true,
      createdAt: new Date().toISOString(),
    };
    const posted: Array<{ url: string; body: unknown }> = [];
    let failNext = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (
        url.includes("/document-templates/") &&
        url.endsWith("/versions") &&
        init?.method === "POST"
      ) {
        if (failNext) {
          failNext = false;
          return {
            ok: false,
            status: 400,
            json: async () => ({ message: "Conteúdo inválido." }),
          } as Response;
        }
        posted.push({ url, body: JSON.parse(String(init.body)) });
        return {
          ok: true,
          status: 201,
          json: async () => ({ ...template, version: 2 }),
        } as Response;
      }
      const body = url.endsWith("/document-templates") ? [template] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Modelos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nova versão" }));
    const dialog = await screen.findByRole("dialog");
    installDocumentBrowserMocks();
    const textarea = within(dialog).getByLabelText("Conteúdo");
    expect(textarea).toHaveTextContent("CONTRATO");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    expect(
      await within(dialog).findByText(
        "Altere o conteúdo para criar uma nova versão.",
      ),
    ).toBeInTheDocument();
    const newBody =
      "CONTRATO v2\n\nCláusula 1: {{paciente_nome}} contrata {{plano_nome}}.";
    setDocumentText(textarea, newBody);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    expect(
      await within(dialog).findByText("Conteúdo inválido."),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar versão" }),
    );
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain(
      `/document-templates/${template.id}/versions`,
    );
    expect(posted[0]!.body).toEqual(
      expect.objectContaining({
        body: newBody,
        content: expect.objectContaining({ version: 1 }),
      }),
    );
    expect(
      await screen.findByText("Nova versão de “Contrato padrão” criada."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a document after confirming in a modal", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const draft = {
      id: "d-1",
      clinicId: "c-1",
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "99999999-9999-4999-8999-999999999999",
      title: "Contrato de prestação de serviços",
      templateName: "Contrato padrão",
      templateVersion: 1,
      patientName: "Helena Almeida",
      snapshotBody: "Contrato",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const patched: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/documents/d-1/status") && init?.method === "PATCH") {
        patched.push(JSON.parse(String(init.body)));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...draft,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          }),
        } as Response;
      }
      const body = url.endsWith("/documents") ? [draft] : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/contratos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Cancelar documento" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(/Contrato de prestação de serviços/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(patched).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancelar documento",
      }),
    );
    await vi.waitFor(() => expect(patched).toEqual([{ status: "cancelled" }]));
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });

  it("records patient satisfaction on a completed appointment and hides the button afterwards", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.includes("/satisfaction") && options?.method === "POST") {
        const payload = JSON.parse(String(options.body)) as Record<
          string,
          unknown
        >;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "s-1",
            clinicId: "c-1",
            patientName: appointment.patientName,
            actorUserId: "u-1",
            createdAt: new Date().toISOString(),
            ...payload,
          }),
        } as Response;
      }
      const body = url.includes("/satisfaction?")
        ? {
            from: "2026-09-01",
            to: "2026-09-30",
            surveys: [
              {
                id: "s-0",
                appointmentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                patientId: appointment.patientId,
                score: 10,
              },
            ],
            summary: {
              total: 1,
              promoters: 1,
              passives: 0,
              detractors: 0,
              nps: 100,
            },
          }
        : url.includes("/appointments?") ||
            url.includes("/appointments/options?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      screen.queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar satisfação" }),
    );
    expect(
      screen.getByRole("heading", { name: "Registrar satisfação" }),
    ).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Salvar avaliação" });
    expect(save).toBeDisabled();
    for (let score = 0; score <= 10; score += 1) {
      expect(
        screen.getByRole("button", { name: `Nota ${score}` }),
      ).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Nota 9" }));
    expect(screen.getByRole("button", { name: "Nota 9" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByLabelText("Comentário (opcional)"), {
      target: { value: "Ótimo atendimento" },
    });
    fireEvent.click(save);
    await vi.waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([, options]) => options?.method === "POST");
      expect(call?.[0]).toContain("/satisfaction");
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        score: 9,
        comment: "Ótimo atendimento",
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Detalhes do atendimento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Satisfação registrada: nota 9"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
  });

  it("hides the satisfaction button when the appointment already has a survey", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/satisfaction?")
        ? {
            from: "2026-09-01",
            to: "2026-09-30",
            surveys: [
              {
                id: "s-0",
                appointmentId: appointment.id,
                patientId: appointment.patientId,
                score: 6,
              },
            ],
            summary: {
              total: 1,
              promoters: 0,
              passives: 0,
              detractors: 1,
              nps: -100,
            },
          }
        : url.includes("/appointments?") ||
            url.includes("/appointments/options?")
          ? [appointment]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      await screen.findByText("Satisfação registrada: nota 6"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(call?.[0])).toMatch(
      /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/,
    );
  });

  it("does not offer satisfaction on appointments that are not completed", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?")
        ? [appointment]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    expect(
      screen.getByRole("button", { name: "Cancelar atendimento" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/satisfaction")),
    ).toBe(false);
  });

  it("shows the NPS card on the reports page for the filtered period", async () => {
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
    const today = new Date().toLocaleDateString("sv-SE");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("/satisfaction?")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        } as Response;
      }
      const body = url.includes("from=2026-01-01")
        ? {
            from: "2026-01-01",
            to: "2026-01-31",
            surveys: [],
            summary: {
              total: 0,
              promoters: 0,
              passives: 0,
              detractors: 0,
              nps: null,
            },
          }
        : {
            from: `${today.slice(0, 8)}01`,
            to: today,
            surveys: [],
            summary: {
              total: 4,
              promoters: 2,
              passives: 1,
              detractors: 1,
              nps: 25,
            },
          };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText(
        "2 de 4 respostas recomendariam o estúdio · 1 insatisfeito",
      ),
    ).toBeInTheDocument();
    const card = screen
      .getByText("Satisfação dos clientes")
      .closest("article") as HTMLElement;
    expect(within(card).getByText("Razoável")).toBeInTheDocument();
    const first = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).includes("/satisfaction?"));
    expect(String(first?.[0])).toContain(
      `from=${today.slice(0, 8)}01&to=${today}`,
    );
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(
      await screen.findByText("Nenhuma pesquisa respondida no período"),
    ).toBeInTheDocument();
    const updated = screen
      .getByText("Satisfação dos clientes")
      .closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes("/satisfaction?from=2026-01-01&to=2026-01-31"),
        ),
    ).toBe(true);
  });

  it("shows the trials card with the conversion of the filtered period", async () => {
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
    const report = (trials: {
      scheduled: number;
      completed: number;
      converted: number;
      conversionRate: number;
    }) => ({
      from: "2026-01-01",
      to: "2026-01-31",
      generatedAt: "2026-01-31T12:00:00.000Z",
      appointments: {
        total: 0,
        completed: 0,
        noShows: 0,
        cancelled: 0,
        attendanceRate: 0,
        byVisitType: { regular: 0, trial: 0, evaluation: 0 },
      },
      trials,
      plans: { active: 0, availableSessions: 0, consumedInPeriod: 0 },
      finance: { openInCents: 0, overdueInCents: 0, paidInPeriodInCents: 0 },
      commercial: {
        leadsCreated: 0,
        won: 0,
        lost: 0,
        conversionRate: 0,
        averageFirstResponseMinutes: 0,
      },
      byProfessional: [],
      byService: [],
      bySource: [],
      profitability: {
        dre: {
          serviceRevenueInCents: 0,
          productRevenueInCents: 0,
          grossRevenueInCents: 0,
          productCostInCents: 0,
          grossProfitInCents: 0,
          operatingExpensesInCents: 0,
          commissionsInCents: 0,
          netResultInCents: 0,
          netMargin: 0,
        },
        byService: [],
        byProduct: [],
        operational: {
          groupOccupancyRate: 0,
          activeGroupSeats: 0,
          totalGroupCapacity: 0,
          waitlistCount: 0,
          lowStockCount: 0,
          productUnitsSold: 0,
          averageReceiptInCents: 0,
        },
      },
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/management?from=2026-01-01")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            report({
              scheduled: 2,
              completed: 0,
              converted: 0,
              conversionRate: 0,
            }),
        } as Response;
      }
      if (url.includes("/reports/management?")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            report({
              scheduled: 6,
              completed: 4,
              converted: 3,
              conversionRate: 75,
            }),
        } as Response;
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText(
        "3 de 4 fecharam plano em até 30 dias · 6 agendadas",
      ),
    ).toBeInTheDocument();
    const card = screen
      .getByText("Aulas experimentais")
      .closest("article") as HTMLElement;
    expect(within(card).getByText("75%")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(
      await screen.findByText("2 agendadas · nenhuma realizada no período"),
    ).toBeInTheDocument();
    const updated = screen
      .getByText("Aulas experimentais")
      .closest("article") as HTMLElement;
    expect(within(updated).getByText("—")).toBeInTheDocument();
  });

  it("shows retention, rankings and age bands for the filtered period", async () => {
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
    const today = new Date().toLocaleDateString("sv-SE");
    const retention = (
      months: Array<{
        month: string;
        activeClients: number;
        newClients: number;
        lostClients: number;
        retentionRate: number | null;
        cancelledPlans: number;
        cancelledValueInCents: number;
      }>,
    ) => ({
      generatedAt: "2026-09-30T12:00:00.000Z",
      from: "2026-08-01",
      to: "2026-09-30",
      startMonth: months[0]?.month ?? "2026-01",
      endMonth: months[months.length - 1]?.month ?? "2026-01",
      months,
      totals: {
        newClients: months.reduce((sum, item) => sum + item.newClients, 0),
        lostClients: months.reduce((sum, item) => sum + item.lostClients, 0),
        cancelledPlans: months.reduce(
          (sum, item) => sum + item.cancelledPlans,
          0,
        ),
        cancelledValueInCents: months.reduce(
          (sum, item) => sum + item.cancelledValueInCents,
          0,
        ),
      },
    });
    const bands = (counts: number[]) =>
      (["0-17", "18-29", "30-44", "45-59", "60+", "unknown"] as const).map(
        (band, index) => ({
          band,
          label: [
            "0 a 17 anos",
            "18 a 29 anos",
            "30 a 44 anos",
            "45 a 59 anos",
            "60 anos ou mais",
            "Sem data de nascimento",
          ][index],
          clients: counts[index],
        }),
      );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.includes("/reports/retention?from=2026-01-01")) {
        return json(
          retention([
            {
              month: "2026-01",
              activeClients: 0,
              newClients: 0,
              lostClients: 0,
              retentionRate: null,
              cancelledPlans: 0,
              cancelledValueInCents: 0,
            },
          ]),
        );
      }
      if (url.includes("/reports/retention?")) {
        return json(
          retention([
            {
              month: "2026-08",
              activeClients: 10,
              newClients: 3,
              lostClients: 1,
              retentionRate: 0.9,
              cancelledPlans: 2,
              cancelledValueInCents: 45000,
            },
            {
              month: "2026-09",
              activeClients: 12,
              newClients: 4,
              lostClients: 2,
              retentionRate: 0.8,
              cancelledPlans: 0,
              cancelledValueInCents: 0,
            },
          ]),
        );
      }
      if (url.includes("/reports/clients?from=2026-01-01")) {
        return json({
          generatedAt: "2026-01-31T12:00:00.000Z",
          from: "2026-01-01",
          to: "2026-01-31",
          topBySessions: [],
          topByRevenue: [],
          activeClients: 0,
          ageDistribution: bands([0, 0, 0, 0, 0, 0]),
        });
      }
      if (url.includes("/reports/clients?")) {
        return json({
          generatedAt: "2026-09-30T12:00:00.000Z",
          from: "2026-08-01",
          to: "2026-09-30",
          topBySessions: [
            {
              patientId: "p-1",
              patientName: "Helena Almeida",
              completedSessions: 12,
            },
            {
              patientId: "p-2",
              patientName: "Bruno Costa",
              completedSessions: 7,
            },
          ],
          topByRevenue: [
            {
              patientId: "p-3",
              patientName: "Carla Souza",
              receivedInCents: 120000,
            },
          ],
          activeClients: 4,
          ageDistribution: bands([0, 1, 2, 0, 0, 1]),
        });
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Clientes" }));
    const retentionPanel = (
      await screen.findByRole("heading", { name: "Retenção mês a mês" })
    ).closest("section") as HTMLElement;
    const august = (
      await within(retentionPanel).findByRole("rowheader", { name: "08/2026" })
    ).closest("tr") as HTMLElement;
    expect(within(august).getByText("90%")).toBeInTheDocument();
    expect(within(august).getByText(/R\$\s450,00/)).toBeInTheDocument();
    expect(
      within(retentionPanel).getByText(
        "7 novos · 3 perdidos · 2 planos cancelados",
        { exact: false },
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    const sessions = (
      await screen.findByRole("heading", { name: "Mais sessões concluídas" })
    ).closest("section") as HTMLElement;
    expect(
      await within(sessions).findByText("1. Helena Almeida"),
    ).toBeInTheDocument();
    expect(within(sessions).getByText("12 sessões")).toBeInTheDocument();
    expect(within(sessions).getByText("2. Bruno Costa")).toBeInTheDocument();
    const revenue = screen
      .getByRole("heading", { name: "Mais recebimentos" })
      .closest("section") as HTMLElement;
    expect(within(revenue).getByText("1. Carla Souza")).toBeInTheDocument();
    expect(within(revenue).getByText(/R\$\s1\.200,00/)).toBeInTheDocument();
    const ages = screen
      .getByRole("heading", { name: "Faixa etária" })
      .closest("section") as HTMLElement;
    const thirties = within(ages).getByText("30 a 44 anos")
      .parentElement as HTMLElement;
    expect(within(thirties).getByText("50%")).toBeInTheDocument();
    expect(within(thirties).getByText("2")).toBeInTheDocument();
    expect(
      within(ages).getByText("Sem data de nascimento"),
    ).toBeInTheDocument();
    expect(
      within(ages).getByText("4 clientes ativos no período", { exact: false }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            `/reports/retention?from=${today.slice(0, 8)}01&to=${today}`,
          ),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            `/reports/clients?from=${today.slice(0, 8)}01&to=${today}`,
          ),
        ),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    fireEvent.click(screen.getByRole("tab", { name: "Retenção" }));
    const january = (
      await screen.findByRole("rowheader", { name: "01/2026" })
    ).closest("tr") as HTMLElement;
    expect(within(january).getByText("—")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    expect(
      await screen.findByText(
        "Nenhum cliente com sessão concluída no período.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum recebimento de cliente no período."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum cliente ativo no período."),
    ).toBeInTheDocument();
    expect(screen.queryByText("1. Helena Almeida")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            "/reports/retention?from=2026-01-01&to=2026-01-31",
          ),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            "/reports/clients?from=2026-01-01&to=2026-01-31",
          ),
        ),
    ).toBe(true);
  });

  it("shows the retention error in its card without hiding the client rankings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "finance",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/retention?")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: "RETENTION_PERIOD_TOO_LONG",
            message: "A retenção aceita no máximo 24 meses.",
          }),
        } as Response;
      }
      if (url.includes("/reports/clients?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            generatedAt: "2026-09-30T12:00:00.000Z",
            from: "2024-01-01",
            to: "2026-09-30",
            topBySessions: [
              {
                patientId: "p-1",
                patientName: "Helena Almeida",
                completedSessions: 30,
              },
            ],
            topByRevenue: [],
            activeClients: 1,
            ageDistribution: [
              { band: "0-17", label: "0 a 17 anos", clients: 0 },
              { band: "18-29", label: "18 a 29 anos", clients: 1 },
              { band: "30-44", label: "30 a 44 anos", clients: 0 },
              { band: "45-59", label: "45 a 59 anos", clients: 0 },
              { band: "60+", label: "60 anos ou mais", clients: 0 },
              { band: "unknown", label: "Sem data de nascimento", clients: 0 },
            ],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "Dados indisponíveis" }),
      } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Clientes" }));
    const retentionPanel = (
      await screen.findByRole("heading", { name: "Retenção mês a mês" })
    ).closest("section") as HTMLElement;
    expect(
      await within(retentionPanel).findByText(
        "A retenção aceita no máximo 24 meses.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("tab", { name: "Ranking e faixa etária" }),
    );
    expect(await screen.findByText("1. Helena Almeida")).toBeInTheDocument();
    expect(screen.getByText("30 sessões")).toBeInTheDocument();
    expect(screen.getByText("Relatórios gerenciais")).toBeInTheDocument();
  });

  it("tells when the trials card could not be loaded", async () => {
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
      async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({ message: "Dados indisponíveis" }),
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/relatorios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Indicadores" }));
    expect(
      await screen.findByText("Não foi possível carregar as experimentais."),
    ).toBeInTheDocument();
  });

  it("previews a patient spreadsheet, imports the same file and reloads the list", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const existing = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: [],
      status: "active",
    };
    const imported = {
      ...existing,
      id: "88888888-8888-4888-8888-888888888888",
      recordNumber: "PAC-00002",
      fullName: "Ana Lima",
      phone: "11999990000",
    };
    let patients = [existing];
    const analysis = {
      rows: [
        {
          line: 2,
          status: "valid",
          fullName: "Ana Lima",
          phone: "11999990000",
          input: {
            fullName: "Ana Lima",
            phone: "11999990000",
            tags: [],
            status: "active",
          },
        },
        {
          line: 3,
          status: "error",
          fullName: "",
          phone: "123",
          errors: ["Informe o nome.", "Telefone inválido."],
        },
        {
          line: 4,
          status: "duplicate",
          fullName: "Helena A.",
          phone: "11987654321",
          duplicateOf: {
            kind: "existing",
            field: "phone",
            patientId: existing.id,
            fullName: "Helena Almeida",
          },
        },
        {
          line: 5,
          status: "duplicate",
          fullName: "Ana Lima",
          phone: "11999990000",
          duplicateOf: { kind: "row", field: "phone", line: 2 },
        },
      ],
      errors: [],
      totals: { valid: 1, error: 1, duplicate: 2 },
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/patients/import/preview")
        ? analysis
        : url.endsWith("/patients/import")
          ? ((patients = [existing, imported]),
            { created: 1, skipped: 2, errors: 1 })
          : patients;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    clickMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    const template = within(dialog).getByRole("link", {
      name: /Baixar modelo/,
    });
    expect(template).toHaveAttribute("download", "modelo-clientes.csv");
    const templateText = decodeURIComponent(
      template.getAttribute("href")!.split(",").slice(1).join(","),
    );
    expect(
      templateText.startsWith(
        "\uFEFFnome;cpf;telefone;whatsapp;email;nascimento;etiquetas;observações",
      ),
    ).toBe(true);
    expect(
      within(dialog).getByRole("button", { name: /Importar \d+ cliente/ }),
    ).toBeDisabled();

    const content =
      "nome;telefone\nAna Lima;11999990000\n;123\nHelena A.;11987654321\nAna Lima;11999990000\n";
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [new File([content], "clientes.csv", { type: "text/csv" })],
      },
    });
    expect(await within(dialog).findByText("1 válido")).toBeInTheDocument();
    expect(within(dialog).getByText("1 com erro")).toBeInTheDocument();
    expect(within(dialog).getByText("2 duplicados")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Informe o nome. Telefone inválido."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Já cadastrado: Helena Almeida (mesmo telefone)",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Repete a linha 2 (mesmo telefone)"),
    ).toBeInTheDocument();
    const previewCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) =>
        String(url).endsWith("/patients/import/preview"),
      );
    const expectedFile = {
      fileName: "clientes.csv",
      contentBase64: btoa(content),
    };
    expect(previewCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(previewCall?.[1]?.body))).toEqual(expectedFile);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Importar 1 cliente" }),
    );
    expect(
      await screen.findByText(
        "1 cliente importado, 2 ignorados por duplicidade e 1 com erro.",
      ),
    ).toBeInTheDocument();
    const importCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/patients/import"));
    expect(importCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(importCall?.[1]?.body))).toEqual(expectedFile);
    expect(
      await screen.findByRole("button", { name: "Editar Ana Lima" }),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes("/patients?search="))
        .length,
    ).toBe(2);
  });

  it("shows general spreadsheet errors and keeps import disabled", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).endsWith("/patients/import/preview")
        ? {
            rows: [],
            errors: ["A planilha precisa de uma coluna de nome."],
            totals: { valid: 0, error: 0, duplicate: 0 },
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await findMoreAction("Importar");
    const dialog = screen.getByRole("dialog", { name: "Importar clientes" });
    fireEvent.change(within(dialog).getByLabelText("Planilha de clientes"), {
      target: {
        files: [
          new File(["telefone\n11999990000\n"], "clientes.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    expect(
      await within(dialog).findByText(
        "A planilha precisa de uma coluna de nome.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Importar 0 clientes" }),
    ).toBeDisabled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).endsWith("/patients/import")),
    ).toBe(false);
  });

  it("does not offer patient import to physiotherapists", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
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
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => [patient] }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    // Desde a T053 a fisioterapeuta só consulta Clientes: sem criar nem importar.
    expect(
      screen.queryByRole("button", { name: /Novo cliente/ }),
    ).not.toBeInTheDocument();
    expect(moreActionNames()).not.toContain("Importar");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients/import")),
    ).toBe(false);
  });

  it("exports the patient base with the screen filters, chosen format and columns", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["pilates"],
      status: "active",
      createdAt: "2026-01-10T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["nome\nHelena"]),
        } as Response;
      }
      if (String(input).includes("/patient-tags")) {
        return {
          ok: true,
          status: 200,
          json: async () => [patientTag("pilates", "#2f855a", 1)],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [patient] } as Response;
    });
    const createObjectURL = vi.fn(() => "blob:clientes");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const downloads: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    try {
      render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Editar Helena Almeida" });
      fireEvent.change(
        screen.getByPlaceholderText("Buscar por nome, CPF ou telefone"),
        { target: { value: "Hel" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.some(([url]) =>
              String(url).includes("/patients?search=Hel"),
            ),
        ).toBe(true),
      );
      await screen.findByRole("button", { name: "Editar Helena Almeida" });
      fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
      fireEvent.click(screen.getByRole("button", { name: "Ativos" }));
      fireEvent.change(screen.getByLabelText("Cadastro"), {
        target: { value: "birthday_month" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^pilates/ }));

      clickMoreAction("Exportar");
      const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
      expect(
        within(dialog).getByText(
          "Busca: “Hel” · Situação: ativos · Aniversariantes do mês",
        ),
      ).toBeInTheDocument();
      // A etiqueta do filtro aparece como selo na cor configurada.
      const exportTag = within(dialog).getByText("pilates");
      expect(exportTag).toHaveClass("tag-colored");
      expect(exportTag.style.getPropertyValue("--tag-color")).toBe("#2f855a");
      expect(within(dialog).getByLabelText("CSV (.csv)")).toBeChecked();
      expect(within(dialog).getByLabelText("Observações")).toBeChecked();
      fireEvent.click(within(dialog).getByLabelText("Excel (.xlsx)"));
      fireEvent.click(within(dialog).getByLabelText("Observações"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));

      await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const exportCall = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => String(url).includes("/patients/export"));
      const query = new URL(String(exportCall?.[0]), "http://localhost")
        .searchParams;
      expect(query.get("format")).toBe("xlsx");
      expect(query.get("columns")).toBe(
        "fullName,recordNumber,cpf,phone,whatsapp,email,birthDate,tags,status,emergencyContactName,emergencyContactPhone,createdAt",
      );
      expect(query.get("search")).toBe("Hel");
      expect(query.get("status")).toBe("active");
      expect(query.get("tags")).toBe("pilates");
      expect(query.get("birthdayMonth")).toBe("true");
      expect(query.has("activePlan")).toBe(false);
      expect(downloads).toEqual([`clientes-${saoPauloToday()}.xlsx`]);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:clientes");
      await vi.waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Exportar clientes" }),
        ).not.toBeInTheDocument(),
      );
    } finally {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("requires a column, applies registration filters and shows API errors", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      email: "helena@exemplo.com",
      tags: [],
      status: "active",
      createdAt: "2026-01-10T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            code: "EXPORT_FAILED",
            message: "Não foi possível gerar o arquivo.",
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => [patient] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Helena Almeida" });
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.change(screen.getByLabelText("Cadastro"), {
      target: { value: "with_email" },
    });
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: "newest" },
    });
    clickMoreAction("Exportar");
    const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
    expect(
      within(dialog).getByText("Cadastro: Com e-mail"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/ordem alfabética/)).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Desmarcar todas" }),
    );
    expect(within(dialog).getByLabelText("Nome")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
    expect(
      await within(dialog).findByText("Selecione pelo menos uma coluna."),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/patients/export")),
    ).toBe(false);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar todas" }),
    );
    expect(within(dialog).getByLabelText("Nome")).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
    expect(
      await within(dialog).findByText("Não foi possível gerar o arquivo."),
    ).toBeInTheDocument();
    const exportUrl = vi
      .mocked(fetch)
      .mock.calls.find(([url]) =>
        String(url).includes("/patients/export"),
      )?.[0];
    const query = new URL(String(exportUrl), "http://localhost").searchParams;
    expect(query.get("format")).toBe("csv");
    expect([...query.keys()].sort()).toEqual(["columns", "format", "record"]);
    expect(query.get("record")).toBe("with_email");
    expect(
      within(dialog).getByRole("button", { name: "Exportar" }),
    ).toBeEnabled();
  });

  it.each(["reception", "finance", "physiotherapist"])(
    "does not offer patient export to %s",
    async (role) => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem(
        "crm.auth.user",
        storedUser({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Joana Silva",
          email: "equipe@movimenta.local",
          role,
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
      vi.mocked(fetch).mockImplementation(
        async () =>
          ({ ok: true, status: 200, json: async () => [patient] }) as Response,
      );
      render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Editar Helena Almeida" });
      expect(moreActionNames()).not.toContain("Exportar");
    },
  );

  it("paginates the patient list 20 at a time and resets to page 1 on search and filters", async () => {
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
    const patients = Array.from({ length: 45 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return {
        id: `99999999-9999-4999-8999-9999999999${number}`,
        recordNumber: `PAC-000${number}`,
        fullName: `Cliente ${number}`,
        phone: "11987654321",
        tags: index < 10 ? ["pilates"] : [],
        status: index % 2 === 0 ? "active" : "inactive",
        createdAt: "2026-01-10T12:00:00.000Z",
      };
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/patients/export")) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["nome"]),
        } as Response;
      }
      if (String(input).includes("/patient-tags")) {
        return {
          ok: true,
          status: 200,
          json: async () => [patientTag("pilates", "#2f855a", 10)],
        } as Response;
      }
      return { ok: true, status: 200, json: async () => patients } as Response;
    });
    const createObjectURL = vi.fn(() => "blob:clientes");
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const rows = () =>
      screen.getAllByRole("button", { name: /^Editar Cliente/ });
    try {
      render(
        <MemoryRouter initialEntries={["/clientes"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByRole("button", { name: "Editar Cliente 01" });
      const pagination = screen.getByRole("navigation", {
        name: "Paginação de clientes",
      });
      expect(rows()).toHaveLength(20);
      expect(
        within(pagination).getByText("Página 1 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(
        within(pagination).getByRole("button", { name: /Anterior/ }),
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Editar Cliente 21" }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        within(pagination).getByRole("button", { name: /Próxima/ }),
      );
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "Editar Cliente 21" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Editar Cliente 01" }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 3 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(5);
      expect(screen.getByRole("button", { name: /Próxima/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // A exportação ignora a página: segue só com os filtros da tela.
      clickMoreAction("Exportar");
      const dialog = screen.getByRole("dialog", { name: "Exportar clientes" });
      expect(
        within(dialog).getByText(
          "Nenhum filtro: todos os clientes serão exportados.",
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Exportar" }));
      await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
      const exportUrl = vi
        .mocked(fetch)
        .mock.calls.find(([url]) =>
          String(url).includes("/patients/export"),
        )?.[0];
      expect(
        [
          ...new URL(String(exportUrl), "http://localhost").searchParams.keys(),
        ].sort(),
      ).toEqual(["columns", "format"]);
      await vi.waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Exportar clientes" }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByText("Página 2 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // Busca volta para a página 1.
      fireEvent.change(
        screen.getByPlaceholderText("Buscar por nome, CPF ou telefone"),
        { target: { value: "Cliente" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
      expect(
        await screen.findByText("Página 1 de 3 · 45 clientes"),
      ).toBeInTheDocument();

      // Filtro de situação volta para a página 1.
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 3 de 3 · 45 clientes"),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
      fireEvent.click(screen.getByRole("button", { name: "Inativos" }));
      expect(
        screen.getByText("Página 1 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      expect(rows()).toHaveLength(20);
      expect(
        screen.getByRole("button", { name: "Editar Cliente 02" }),
      ).toBeInTheDocument();

      // Ordenação também volta para a página 1.
      fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
      expect(
        screen.getByText("Página 2 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Ordenar por"), {
        target: { value: "name_desc" },
      });
      expect(
        screen.getByText("Página 1 de 2 · 22 clientes"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Editar Cliente 44" }),
      ).toBeInTheDocument();

      // Tudo numa página: os controles somem.
      fireEvent.click(screen.getByRole("button", { name: /^pilates/ }));
      expect(rows()).toHaveLength(5);
      expect(
        screen.queryByRole("navigation", { name: "Paginação de clientes" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Próxima/ }),
      ).not.toBeInTheDocument();
    } finally {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("hides the patient pagination when every patient fits on one page", async () => {
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
    const patients = Array.from({ length: 20 }, (_, index) => ({
      id: `99999999-9999-4999-8999-9999999999${String(index + 10)}`,
      recordNumber: `PAC-000${index + 10}`,
      fullName: `Cliente ${index + 10}`,
      phone: "11987654321",
      tags: [],
      status: "active",
    }));
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({ ok: true, status: 200, json: async () => patients }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Editar Cliente 10" });
    expect(
      screen.getAllByRole("button", { name: /^Editar Cliente/ }),
    ).toHaveLength(20);
    expect(
      screen.queryByRole("navigation", { name: "Paginação de clientes" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Página \d/)).not.toBeInTheDocument();
  });

  it("lets the owner list, create and delete holidays in settings", async () => {
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
    const existing = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId: "11111111-1111-4111-8111-111111111111",
      date: "2026-12-25",
      name: "Natal",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    const created = {
      ...existing,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      date: "2026-11-15",
      name: "Proclamação da República",
    };
    let postBody: Record<string, unknown> | undefined;
    let duplicate = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/holidays") && init?.method === "POST") {
        if (duplicate) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "HOLIDAY_DUPLICATE",
              message: "Já existe um feriado cadastrado nesta data.",
            }),
          } as Response;
        }
        postBody = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes("/holidays/") && init?.method === "DELETE") {
        // 204 sem corpo: ler JSON aqui falharia, como no navegador.
        return {
          ok: true,
          status: 204,
          json: async () => {
            throw new SyntaxError("Unexpected end of JSON input");
          },
        } as unknown as Response;
      }
      const body = url.includes("/holidays")
        ? [existing]
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
    const section = await openSettingsSection("Feriados");
    expect(await within(section).findByText("Natal")).toBeInTheDocument();
    expect(within(section).getByText("25/12/2026")).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText("Data"), {
      target: { value: "2026-11-15" },
    });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), {
      target: { value: "Proclamação da República" },
    });
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar feriado" }),
    );
    expect(
      await within(section).findByText("Proclamação da República"),
    ).toBeInTheDocument();
    expect(postBody).toEqual({
      date: "2026-11-15",
      name: "Proclamação da República",
    });
    // Lista em ordem crescente de data e formulário limpo para o próximo cadastro.
    expect(section.textContent!.indexOf("15/11/2026")).toBeLessThan(
      section.textContent!.indexOf("25/12/2026"),
    );
    expect(within(section).getByLabelText("Nome do feriado")).toHaveValue("");

    duplicate = true;
    fireEvent.change(within(section).getByLabelText("Data"), {
      target: { value: "2026-12-25" },
    });
    fireEvent.change(within(section).getByLabelText("Nome do feriado"), {
      target: { value: "Natal de novo" },
    });
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar feriado" }),
    );
    expect(
      await within(section).findByText(
        "Já existe um feriado cadastrado nesta data.",
      ),
    ).toBeInTheDocument();

    // Excluir pede confirmação num modal próprio (antes era window.confirm); Voltar não exclui.
    fireEvent.click(
      within(section).getByRole("button", { name: "Excluir feriado Natal" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Excluir feriado" });
    expect(within(dialog).getByText("Natal · 25/12/2026")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A agenda volta a aceitar atendimentos em 25/12/2026.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, options]) => options?.method === "DELETE"),
    ).toBe(false);
    fireEvent.click(
      within(section).getByRole("button", { name: "Excluir feriado Natal" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir feriado" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(within(section).queryByText("Natal")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const deleteCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "DELETE");
    expect(deleteCall?.[0]).toContain(`/holidays/${existing.id}`);
    expect(
      within(section).getByText("Proclamação da República"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no holidays", async () => {
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
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/settings")
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
    const section = await openSettingsSection("Feriados");
    expect(
      await within(section).findByText("Nenhum feriado cadastrado"),
    ).toBeInTheDocument();
  });

  it("does not show the holidays section to reception", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Prazos e mensagens");
    expect(
      screen.queryByRole("heading", { name: "Feriados" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/holidays")),
    ).toBe(false);
  });

  it("marks holidays in the day, week and month agenda and shows the API error when booking on one", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const holiday = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clinicId: "11111111-1111-4111-8111-111111111111",
      date: today,
      name: "Aniversário da cidade",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    const message =
      "Não é possível agendar em 01/01/2027: é feriado (Aniversário da cidade).";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: "HOLIDAY", message }),
        } as Response;
      }
      const body = url.includes("/holidays")
        ? [holiday]
        : url.includes("/professionals")
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                fullName: "Dra. Ana Martins",
                color: "#5c6f68",
              },
            ]
          : url.includes("/rooms")
            ? [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Sala Movimento",
                },
              ]
            : url.includes("/services")
              ? [
                  {
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Fisioterapia individual",
                    priceInCents: 12000,
                  },
                ]
              : url.includes("/patients")
                ? [
                    {
                      id: "99999999-9999-4999-8999-999999999999",
                      fullName: "Helena Almeida",
                    },
                  ]
                : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );

    // Dia: aviso com o nome, mesmo sem atendimentos.
    expect(
      await screen.findByText("Feriado: Aniversário da cidade"),
    ).toBeInTheDocument();
    const holidayCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/holidays"));
    expect(String(holidayCall?.[0])).toContain(
      `/holidays?from=${today}&to=${today}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() =>
      expect(container.querySelector(".week-agenda")).toHaveTextContent(
        "Feriado: Aniversário da cidade",
      ),
    );
    expect(
      container.querySelectorAll(".week-agenda .week-holiday"),
    ).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: "Mês" }));
    const day = await screen.findByRole("button", {
      name: /feriado: Aniversário da cidade/,
    });
    expect(day.closest(".month-day")).toHaveTextContent(
      "Aniversário da cidade",
    );
    expect(
      container.querySelectorAll(".month-grid .month-holiday"),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    await fillAppointmentForm(
      screen.getByRole("dialog", { name: "Novo atendimento" }),
      "Helena Almeida",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar atendimento" }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Novo atendimento" }),
    ).toBeInTheDocument();
  });

  it("shows trial and evaluation badges in the agenda and hides client actions on lead appointments", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const base = {
      professionalColor: "#5c6f68",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "completed",
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
    };
    const leadAppointment = {
      ...base,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      leadId: "44444444-4444-4444-8444-444444444444",
      leadName: "Bruna Lead",
      patientName: "Bruna Lead",
      visitType: "trial",
      startsAt: startsAt.toISOString(),
    };
    const later = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const clientAppointment = {
      ...base,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      visitType: "evaluation",
      status: "scheduled",
      startsAt: later.toISOString(),
      endsAt: new Date(later.getTime() + 50 * 60_000).toISOString(),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/appointments?")
        ? [leadAppointment, clientAppointment]
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    const leadCard = await screen.findByRole("button", {
      name: "Detalhes de Bruna Lead",
    });
    expect(
      within(leadCard).getByText("Experimental · lead"),
    ).toBeInTheDocument();
    const clientCard = screen.getByRole("button", {
      name: "Detalhes de Helena Almeida",
    });
    expect(within(clientCard).getByText("Avaliação")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await vi.waitFor(() =>
      expect(container.querySelector(".week-agenda")).toHaveTextContent(
        "Experimental · lead",
      ),
    );
    expect(container.querySelector(".week-agenda")).toHaveTextContent(
      "Avaliação",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Bruna Lead" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes do atendimento",
    });
    expect(within(dialog).getByText("Experimental · lead")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Lead" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Bruna Lead", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: "Dados do cliente" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Prontuário")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Histórico/ }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) => String(input).includes("/satisfaction")),
    ).toBe(false);
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
  });

  it("shows the emergency contact highlighted in the appointment details without an SOS button", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Ana Martins",
        email: "fisio@movimenta.local",
        role: "physiotherapist",
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    const patient = {
      id: appointment.patientId,
      fullName: "Helena Almeida",
      recordNumber: "PAC-00001",
      phone: "11987654321",
      emergencyContactName: "Maria Souza (mãe)",
      emergencyContactPhone: "11955556666",
      status: "active",
      tags: [],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body =
        url.includes("/appointments?") || url.includes("/appointments/options?")
          ? [appointment]
          : url.includes("/patients")
            ? [patient]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes do atendimento",
    });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
    const contact = within(dialog).getByText(
      "Maria Souza (mãe) · (11) 95555-6666",
    );
    expect(contact.closest(".emergency-contact")).toHaveTextContent(
      "Contato de emergência",
    );
  });

  it("highlights the emergency contact fields in the client record without an SOS button", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      emergencyContactName: "",
      tags: [],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/timeline") ? [] : [patient];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar cliente" });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Contato de emergência" }),
    ).toHaveClass("emergency-fieldset");
  });

  it("does not show the SOS button when creating a new client", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Paula Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo cliente/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    expect(
      within(dialog).queryByRole("button", { name: "SOS" }),
    ).not.toBeInTheDocument();
  });

  it("sends the chosen visit type when booking a new appointment", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    let posted: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return {
          ok: false,
          status: 409,
          json: async () => ({
            code: "APPOINTMENT_CONFLICT",
            message: "Horário ocupado.",
          }),
        } as Response;
      }
      const body = url.includes("/professionals")
        ? [
            {
              id: "33333333-3333-4333-8333-333333333333",
              fullName: "Dra. Ana Martins",
              color: "#5c6f68",
            },
          ]
        : url.includes("/rooms")
          ? [
              {
                id: "55555555-5555-4555-8555-555555555555",
                name: "Sala Movimento",
              },
            ]
          : url.includes("/services")
            ? [
                {
                  id: "77777777-7777-4777-8777-777777777777",
                  name: "Fisioterapia individual",
                  priceInCents: 12000,
                },
              ]
            : url.includes("/patients")
              ? [
                  {
                    id: "99999999-9999-4999-8999-999999999999",
                    fullName: "Helena Almeida",
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText("Dia disponível");
    fireEvent.click(screen.getByRole("button", { name: /Novo atendimento/ }));
    const type = screen.getByLabelText("Tipo");
    expect(type).toHaveValue("");
    expect(
      within(type)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Selecione", "Atendimento", "Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    await fillAppointmentForm(dialog, "Helena Almeida");
    fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    const chosenDate = dialog.querySelector<HTMLButtonElement>(
      '[data-date][aria-pressed="true"]',
    )!.dataset.date!;
    fireEvent.change(within(dialog).getByLabelText("Horário"), {
      target: { value: "14:30" },
    });
    expect(within(dialog).getByLabelText("Horário")).toHaveValue("14:30");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar calendário" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar atendimento" }),
    );
    expect(await screen.findByText("Horário ocupado.")).toBeInTheDocument();
    expect(posted).toMatchObject({
      patientId: "99999999-9999-4999-8999-999999999999",
      visitType: "evaluation",
      startsAt: new Date(`${chosenDate}T14:30`).toISOString(),
    });
  });

  it("books a trial class for a lead from the CRM card", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Joana Recepção",
        email: "recepcao@movimenta.local",
        role: "reception",
      }),
    );
    const leadBase = {
      clinicId: "11111111-1111-4111-8111-111111111111",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const lead = {
      ...leadBase,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Bruna Lead",
      stage: "contacted",
    };
    const converted = {
      ...leadBase,
      id: "45454545-4545-4545-8545-454545454545",
      fullName: "Carla Convertida",
      stage: "won",
      convertedPatientId: "99999999-9999-4999-8999-999999999999",
    };
    let posted: { url: string; body: Record<string, unknown> } | undefined;
    let conflict = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted = { url, body: JSON.parse(String(init.body)) };
        if (conflict)
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "APPOINTMENT_CONFLICT",
              message: "Profissional já tem atendimento neste horário.",
            }),
          } as Response;
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            leadId: lead.id,
            leadName: lead.fullName,
            patientName: lead.fullName,
            ...posted!.body,
            endsAt: posted!.body.startsAt,
            status: "scheduled",
            serviceName: "Pilates",
            professionalName: "Dra. Ana Martins",
            roomName: "Sala Movimento",
            professionalColor: "#5c6f68",
          }),
        } as Response;
      }
      const body = isLeadBoardUrl(url)
        ? leadBoardResponse(url, [lead, converted])
        : url.includes("/professionals")
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                fullName: "Dra. Ana Martins",
                color: "#5c6f68",
              },
            ]
          : url.includes("/rooms")
            ? [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Sala Movimento",
                },
              ]
            : url.includes("/services")
              ? [
                  {
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Pilates",
                    priceInCents: 9000,
                  },
                ]
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Bruna Lead" })
    ).closest("article") as HTMLElement;
    const convertedCard = screen
      .getByRole("heading", { name: "Carla Convertida" })
      .closest("article") as HTMLElement;
    expect(
      within(convertedCard).queryByRole("button", {
        name: "Agendar experimental",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(card).getByRole("button", { name: "Agendar experimental" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Agendar experimental",
    });
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue("77777777-7777-4777-8777-777777777777");
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(within(dialog).getByLabelText("Sala")).toHaveValue(
      "55555555-5555-4555-8555-555555555555",
    );
    const type = within(dialog).getByLabelText("Tipo");
    expect(type).toHaveValue("trial");
    expect(
      within(type)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Experimental", "Avaliação"]);
    fireEvent.change(type, { target: { value: "evaluation" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    const chosenDate = dialog.querySelector<HTMLButtonElement>(
      '[data-date][tabindex="0"]',
    )!.dataset.date!;
    fireEvent.click(
      dialog.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')!,
    );
    fireEvent.change(within(dialog).getByLabelText("Horário"), {
      target: { value: "09:00" },
    });
    expect(within(dialog).getByLabelText("Horário")).toHaveValue("09:00");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar calendário" }),
    );
    expect(
      within(dialog).queryByRole("region", {
        name: "Calendário de agendamento",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    );
    expect(
      await within(dialog).findByText(
        "Profissional já tem atendimento neste horário.",
      ),
    ).toBeInTheDocument();
    expect(posted?.url).toContain(`/leads/${lead.id}/appointments`);
    expect(posted?.body).toEqual({
      professionalId: "33333333-3333-4333-8333-333333333333",
      roomId: "55555555-5555-4555-8555-555555555555",
      serviceId: "77777777-7777-4777-8777-777777777777",
      startsAt: new Date(`${chosenDate}T09:00`).toISOString(),
      notes: "",
      visitType: "evaluation",
    });
    conflict = false;
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar agendamento" }),
    );
    expect(
      await screen.findByText(/Avaliação agendada para Bruna Lead/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Agendar experimental" }),
    ).not.toBeInTheDocument();
  });

  it("lists, creates, pauses, reactivates and ends fixed expenses in accounts payable", async () => {
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
    const clinicId = "11111111-1111-4111-8111-111111111111";
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    })
      .format(new Date())
      .slice(0, 7);
    const category = {
      id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
      clinicId,
      name: "Aluguel e condomínio",
      kind: "expense",
      active: true,
    };
    const center = {
      id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
      clinicId,
      name: "Administrativo",
      active: true,
    };
    const base = {
      clinicId,
      categoryId: category.id,
      costCenterId: center.id,
      categoryName: category.name,
      costCenterName: center.name,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    let recurring: Record<string, unknown>[] = [
      {
        ...base,
        id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
        description: "Aluguel da sala",
        supplier: "Imobiliária Centro",
        amountInCents: 250000,
        dayOfMonth: 10,
        startMonth: "2026-01",
        active: true,
        lastCompetence: "2026-09",
      },
      {
        ...base,
        id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2",
        description: "Internet",
        amountInCents: 12990,
        dayOfMonth: 5,
        startMonth: "2026-02",
        active: false,
        resumedFromMonth: "2026-05",
        lastCompetence: "2026-07",
      },
      {
        ...base,
        id: "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3",
        description: "Software antigo",
        amountInCents: 9900,
        dayOfMonth: 15,
        startMonth: "2019-01",
        endMonth: "2020-01",
        active: true,
        lastCompetence: "2020-01",
      },
      {
        ...base,
        id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5",
        description: "Seguro do estúdio",
        amountInCents: 8000,
        dayOfMonth: 20,
        startMonth: "2019-01",
        endMonth: currentMonth,
        active: true,
      },
    ];
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [
        category,
        {
          ...category,
          id: "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2",
          name: "Mensalidades",
          kind: "income",
        },
      ],
      costCenters: [center],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    const bodies: {
      method: string;
      url: string;
      body: Record<string, unknown>;
    }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/finance/recurring-payables") && method === "POST") {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ method, url, body });
        const created = {
          ...base,
          ...body,
          id: "e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4",
        };
        recurring = [...recurring, created];
        return { ok: true, status: 201, json: async () => created } as Response;
      }
      if (url.includes("/finance/recurring-payables/") && method === "PUT") {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ method, url, body });
        const id = url.split("/").pop();
        const current = recurring.find((item) => item.id === id)!;
        const updated = {
          ...base,
          id,
          lastCompetence: current.lastCompetence,
          ...body,
        };
        recurring = recurring.map((item) => (item.id === id ? updated : item));
        return { ok: true, status: 200, json: async () => updated } as Response;
      }
      const body = url.includes("/finance/recurring-payables")
        ? recurring
        : url.includes("/finance/workspace")
          ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const workspaceLoads = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          String(url).includes("/finance/workspace"),
        ).length;
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Contas a pagar (0)" }),
    );
    const section = (
      await screen.findByRole("heading", { name: "Despesas fixas" })
    ).closest("section")!;
    expect(
      await within(section).findByText("Aluguel da sala"),
    ).toBeInTheDocument();
    expect(
      within(section).getByText("Imobiliária Centro · Administrativo"),
    ).toBeInTheDocument();
    // Despesa é saída: valor com sinal, em vermelho e alinhado à direita.
    expect(within(section).getByText("- R$ 2.500,00")).toHaveClass(
      "finance-amount",
      "cash-out",
    );
    expect(within(section).getByText("Dia 10")).toBeInTheDocument();
    expect(
      within(section).getByText(/Contas que se repetem todo mês/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText("Desde 01/2026 · Última gerada: 09/2026"),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        "Desde 02/2026 · Reativada em 05/2026 · Última gerada: 07/2026",
      ),
    ).toBeInTheDocument();
    expect(within(section).getAllByText("Ativa")).toHaveLength(2);
    expect(within(section).getByText("Pausada")).toBeInTheDocument();
    expect(within(section).getAllByText("Encerrada")).toHaveLength(1);
    // Encerrada (mês final já passou) não oferece mais pausar nem encerrar.
    expect(
      within(section).queryByRole("button", { name: "Pausar Software antigo" }),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", {
        name: "Encerrar Software antigo",
      }),
    ).not.toBeInTheDocument();
    // No próprio mês final ela ainda gera conta: continua ativa, com as ações.
    const lastMonthRow = within(section)
      .getByText("Seguro do estúdio")
      .closest(".finance-row") as HTMLElement;
    expect(within(lastMonthRow).getByText("Ativa")).toBeInTheDocument();
    expect(
      within(lastMonthRow).getByRole("button", {
        name: "Pausar Seguro do estúdio",
      }),
    ).toBeInTheDocument();
    expect(
      within(lastMonthRow).getByRole("button", {
        name: "Encerrar Seguro do estúdio",
      }),
    ).toBeInTheDocument();

    // Criar: só categorias de despesa no select; depois recarrega o workspace (que gera as contas).
    fireEvent.click(
      within(section).getByRole("button", { name: "Nova despesa fixa" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nova despesa fixa",
    });
    expect(
      within(dialog).queryByRole("option", { name: "Mensalidades" }),
    ).not.toBeInTheDocument();
    // Antes de preencher, o botão diz o que falta (QM14).
    const createRecurring = within(dialog).getByRole("button", {
      name: "Cadastrar despesa fixa",
    });
    expect(createRecurring).toBeDisabled();
    expect(createRecurring).toHaveAccessibleDescription(
      "Falta: Descrição (pelo menos 3 caracteres), Valor mensal.",
    );
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Contador" },
    });
    fireEvent.change(within(dialog).getByLabelText("Fornecedor"), {
      target: { value: "Escritório Silva" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor mensal"), {
      target: { value: "450" },
    });
    fireEvent.change(within(dialog).getByLabelText("Dia do vencimento"), {
      target: { value: "20" },
    });
    fireEvent.change(within(dialog).getByLabelText("Mês inicial"), {
      target: { value: "2026-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Mês final (opcional)"), {
      target: { value: "2027-09" },
    });
    expect(createRecurring).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    const loadsBeforeCreate = workspaceLoads();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cadastrar despesa fixa" }),
    );
    expect(await within(section).findByText("Contador")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Nova despesa fixa" }),
    ).not.toBeInTheDocument();
    expect(bodies[0]).toMatchObject({ method: "POST" });
    expect(bodies[0]!.body).toEqual({
      description: "Contador",
      supplier: "Escritório Silva",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 45000,
      dayOfMonth: 20,
      startMonth: "2026-10",
      endMonth: "2027-09",
      active: true,
    });
    expect(workspaceLoads()).toBeGreaterThan(loadsBeforeCreate);

    // Pausar envia o corpo completo com active:false.
    fireEvent.click(
      within(section).getByRole("button", { name: "Pausar Aluguel da sala" }),
    );
    expect(
      await within(section).findByRole("button", {
        name: "Reativar Aluguel da sala",
      }),
    ).toBeInTheDocument();
    expect(bodies[1]!.url).toContain(
      "/finance/recurring-payables/e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
    );
    expect(bodies[1]!.body).toEqual({
      description: "Aluguel da sala",
      supplier: "Imobiliária Centro",
      categoryId: category.id,
      costCenterId: center.id,
      amountInCents: 250000,
      dayOfMonth: 10,
      startMonth: "2026-01",
      active: false,
    });

    // Reativar envia active:true explicitamente e recarrega o workspace.
    const loadsBeforeResume = workspaceLoads();
    fireEvent.click(
      within(section).getByRole("button", { name: "Reativar Internet" }),
    );
    expect(
      await within(section).findByRole("button", { name: "Pausar Internet" }),
    ).toBeInTheDocument();
    expect(bodies[2]!.body).toMatchObject({
      description: "Internet",
      active: true,
    });
    expect(bodies[2]!.body).not.toHaveProperty("resumedFromMonth");
    expect(workspaceLoads()).toBeGreaterThan(loadsBeforeResume);

    // Encerrar abre um modal com o último mês e mantém a situação atual.
    fireEvent.click(
      within(section).getByRole("button", { name: "Encerrar Internet" }),
    );
    const endDialog = await screen.findByRole("dialog", {
      name: "Encerrar despesa fixa",
    });
    const lastMonth = within(endDialog).getByLabelText("Último mês");
    expect(lastMonth).toHaveAttribute("type", "month");
    expect(lastMonth).toHaveAttribute("min", "2026-02");
    expect(lastMonth).toHaveValue(currentMonth);
    fireEvent.change(lastMonth, { target: { value: "2026-01" } });
    // O `min` do campo barra o envio no navegador; a validação própria cobre campos sem suporte a `month`.
    expect((lastMonth as HTMLInputElement).validity.rangeUnderflow).toBe(true);
    fireEvent.submit(lastMonth.closest("form")!);
    expect(
      await within(endDialog).findByText(
        "O mês final não pode ser anterior ao mês inicial.",
      ),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(3);
    fireEvent.change(lastMonth, { target: { value: "2026-12" } });
    fireEvent.click(
      within(endDialog).getByRole("button", { name: "Encerrar despesa fixa" }),
    );
    await vi.waitFor(() =>
      expect(bodies[3]?.body).toEqual({
        description: "Internet",
        categoryId: category.id,
        costCenterId: center.id,
        amountInCents: 12990,
        dayOfMonth: 5,
        startMonth: "2026-02",
        endMonth: "2026-12",
        active: true,
      }),
    );
    expect(bodies[3]!.url).toContain(
      "/finance/recurring-payables/e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2",
    );
    expect(
      await within(section).findByText(
        "Desde 02/2026 · até 12/2026 · Última gerada: 07/2026",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Encerrar despesa fixa" }),
    ).not.toBeInTheDocument();
  });

  it("shows the API error inside the end fixed expense modal", async () => {
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
    const item = {
      id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
      clinicId: "11111111-1111-4111-8111-111111111111",
      description: "Aluguel da sala",
      categoryId: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
      costCenterId: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
      categoryName: "Aluguel",
      costCenterName: "Administrativo",
      amountInCents: 250000,
      dayOfMonth: 10,
      startMonth: "2026-01",
      endMonth: "2099-12",
      active: false,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PUT") {
        return {
          ok: false,
          status: 404,
          json: async () => ({
            code: "RECURRING_PAYABLE_NOT_FOUND",
            message: "Despesa fixa não encontrada.",
          }),
        } as Response;
      }
      const body = url.includes("/finance/recurring-payables")
        ? [item]
        : url.includes("/finance/workspace")
          ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Contas a pagar (0)" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Encerrar Aluguel da sala" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Encerrar despesa fixa",
    });
    // Sugere o mês final já cadastrado.
    expect(within(dialog).getByLabelText("Último mês")).toHaveValue("2099-12");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Encerrar despesa fixa" }),
    );
    expect(
      await within(dialog).findByText("Despesa fixa não encontrada."),
    ).toBeInTheDocument();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PUT");
    // Pausada continua pausada: `active` vai explícito como false.
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      endMonth: "2099-12",
      active: false,
    });
  });

  it("shows empty and error states for fixed expenses", async () => {
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
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    let failing = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/recurring-payables") && failing) {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            code: "INTERNAL",
            message: "Falha ao carregar despesas fixas.",
          }),
        } as Response;
      }
      const body = url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Contas a pagar (0)" }),
    );
    const section = (
      await screen.findByRole("heading", { name: "Despesas fixas" })
    ).closest("section")!;
    expect(
      await within(section).findByText("Nenhuma despesa fixa"),
    ).toBeInTheDocument();
    unmount();

    failing = true;
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Contas a pagar (0)" }),
    );
    await screen.findByRole("heading", { name: "Despesas fixas" });
    expect(
      await screen.findByText("Falha ao carregar despesas fixas."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma despesa fixa")).not.toBeInTheDocument();
  });

  describe("finance receivables", () => {
    const clinicId = "11111111-1111-4111-8111-111111111111";
    function shiftDate(iso: string, days: number) {
      const date = new Date(`${iso}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    }
    function receivablesWorkspace() {
      const today = saoPauloToday();
      const base = {
        clinicId,
        installmentCount: 3,
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      };
      const receivables = [
        {
          ...base,
          id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
          patientId: "p1",
          patientName: "Ana Souza",
          description: "Pilates 2x · parcela 1/3",
          installmentNumber: 1,
          dueDate: shiftDate(today, 10),
          amountInCents: 25000,
          status: "open",
          overdue: false,
        },
        {
          ...base,
          id: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
          patientId: "p2",
          patientName: "Bruno Lima",
          description: "Dançaterapia · parcela 2/3",
          installmentNumber: 2,
          dueDate: shiftDate(today, -5),
          amountInCents: 18000,
          status: "open",
          overdue: true,
        },
        {
          ...base,
          id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
          patientId: "p3",
          patientName: "Carla Mendes",
          description: "Depilação · parcela 1/1",
          installmentNumber: 1,
          dueDate: shiftDate(today, -2),
          amountInCents: 30000,
          status: "paid",
          paidAt: `${today}T12:00:00.000Z`,
          overdue: false,
          paymentMethod: "pix",
        },
      ];
      return {
        summary: {
          openInCents: 43000,
          overdueInCents: 18000,
          paidThisMonthInCents: 30000,
          receivables,
        },
        categories: [],
        costCenters: [],
        payables: [],
        payableOpenInCents: 0,
        payableOverdueInCents: 0,
        paidExpensesThisMonthInCents: 0,
        cashBalanceThisMonthInCents: 30000,
        commissionRules: [],
        commissions: [],
        commissionOpenInCents: 0,
        paidCommissionsThisMonthInCents: 0,
      };
    }
    function renderFinance(extraReceivables: object[] = []) {
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
      const workspace = receivablesWorkspace();
      workspace.summary.receivables.push(
        ...(extraReceivables as typeof workspace.summary.receivables),
      );
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.includes("/finance/receivables/")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ...workspace.summary.receivables[0],
              status: "paid",
            }),
          } as Response;
        }
        const body = url.includes("/finance/workspace") ? workspace : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/financeiro"]}>
          <App />
        </MemoryRouter>,
      );
    }
    const rowOf = (name: string) =>
      screen.getByText(name).closest(".finance-row") as HTMLElement;

    it("shows each installment on one line with client, due date, value, status and clear actions", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      // A forma de pagamento não fica mais solta no topo da página.
      expect(
        screen.queryByLabelText("Forma usada na baixa"),
      ).not.toBeInTheDocument();
      // Cartões de resumo explicam o número.
      expect(
        screen.getByText("Entradas e saídas disponíveis no caixa neste mês."),
      ).toBeInTheDocument();
      // Abas com contagem num selo e nome acessível estável.
      expect(
        screen.getByRole("button", { name: "Contas a receber (3)" }),
      ).toBeInTheDocument();

      const ana = rowOf("Ana Souza");
      expect(
        within(ana).getByText("Pilates 2x · parcela 1/3"),
      ).toBeInTheDocument();
      expect(within(ana).getByText("+ R$ 250,00")).toHaveClass(
        "finance-amount",
        "cash-in",
      );
      expect(within(ana).getByText("Em aberto")).toHaveClass("status-pill");
      expect(
        within(ana).getByRole("button", { name: "Dar baixa" }),
      ).toHaveClass("primary-button", "button-sm");
      expect(
        within(ana).getByRole("button", { name: "Ajustar" }),
      ).toBeInTheDocument();
      expect(
        within(ana).getByRole("checkbox", {
          name: "Selecionar parcela de Ana Souza",
        }),
      ).toBeInTheDocument();

      const bruno = rowOf("Bruno Lima");
      expect(within(bruno).getByText("Vencida há 5 dias")).toHaveClass(
        "status-pill",
        "overdue",
      );

      const carla = rowOf("Carla Mendes");
      expect(within(carla).getByText("Paga")).toHaveClass(
        "status-pill",
        "paid",
      );
      expect(within(carla).getByRole("button", { name: "Recibo" })).toHaveClass(
        "secondary-button",
        "button-sm",
      );
      expect(
        within(carla).getByRole("button", { name: "Estornar" }),
      ).toHaveClass("danger-button", "button-sm");
      // Parcela paga não entra na seleção para renegociar.
      expect(within(carla).queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("shows receivable values with sign and color like the other finance tabs", async () => {
      renderFinance([
        {
          clinicId,
          installmentCount: 1,
          createdAt: "2026-01-01T12:00:00.000Z",
          updatedAt: "2026-01-01T12:00:00.000Z",
          id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
          patientId: "p4",
          patientName: "Diego Rocha",
          description: "Ajuste de crédito",
          installmentNumber: 1,
          dueDate: saoPauloToday(),
          amountInCents: -4000,
          status: "open",
          overdue: false,
        },
      ]);
      await screen.findByText("Ana Souza");
      expect(within(rowOf("Ana Souza")).getByText("+ R$ 250,00")).toHaveClass(
        "finance-amount",
        "cash-in",
      );
      expect(within(rowOf("Bruno Lima")).getByText("+ R$ 180,00")).toHaveClass(
        "finance-amount",
        "cash-in",
      );
      expect(
        within(rowOf("Carla Mendes")).getByText("+ R$ 300,00"),
      ).toHaveClass("finance-amount", "cash-in");
      // Valor que reduz o saldo aparece com "- R$" em vermelho (mesmo elemento no cartão de celular).
      const diego = within(rowOf("Diego Rocha")).getByText("- R$ 40,00");
      expect(diego).toHaveClass("finance-amount", "cash-out");
      expect(diego).not.toHaveClass("cash-in");
    });

    it("shows a cancelled installment as neutral, struck-through and labelled next to its value", async () => {
      renderFinance([
        {
          clinicId,
          installmentCount: 3,
          createdAt: "2026-01-01T12:00:00.000Z",
          updatedAt: "2026-01-01T12:00:00.000Z",
          id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
          patientId: "p5",
          patientName: "Elisa Prado",
          description: "Pilates 1x · parcela 3/3",
          installmentNumber: 3,
          dueDate: saoPauloToday(),
          amountInCents: 12000,
          status: "cancelled",
          overdue: false,
        },
      ]);
      await screen.findByText("Ana Souza");
      const elisa = rowOf("Elisa Prado");
      expect(within(elisa).queryByText(/\+ R\$/)).not.toBeInTheDocument();
      const value = within(elisa).getByText("R$ 120,00");
      expect(value.tagName).toBe("S");
      const amount = value.closest(".finance-amount") as HTMLElement;
      expect(amount).toHaveClass("cancelled-amount");
      expect(amount).not.toHaveClass("cash-in");
      expect(amount).not.toHaveClass("cash-out");
      // Selo junto ao valor, em texto (não só cor), uma única vez na linha.
      const badge = within(amount).getByText("Cancelada");
      expect(badge).toHaveClass("status-pill", "cancelled");
      expect(within(elisa).getAllByText("Cancelada")).toHaveLength(1);
      expect(amount).toHaveTextContent("R$ 120,00 Cancelada");
      // Cancelada não entra na seleção para renegociar.
      expect(within(elisa).queryByRole("checkbox")).not.toBeInTheDocument();
      // Aberta e paga continuam como antes.
      expect(within(rowOf("Ana Souza")).getByText("+ R$ 250,00")).toHaveClass(
        "finance-amount",
        "cash-in",
      );
      expect(
        within(rowOf("Carla Mendes")).getByText("+ R$ 300,00"),
      ).toHaveClass("finance-amount", "cash-in");
      expect(within(rowOf("Carla Mendes")).getByText("Paga")).toHaveClass(
        "status-pill",
        "paid",
      );
    });

    it("selects installments and shows the action bar only with items selected", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      expect(
        screen.queryByRole("button", { name: "Renegociar" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Selecionar parcela de Ana Souza",
        }),
      );
      expect(screen.getByText("1 parcela selecionada")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Renegociar" }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Selecionar todas" }),
      );
      expect(screen.getByText("2 parcelas selecionadas")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "Selecionar parcela de Bruno Lima",
        }),
      ).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
      expect(screen.queryByText(/selecionadas?$/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Renegociar" }),
      ).not.toBeInTheDocument();
    });

    it("filters installments by status and client, with an empty state that says what to do", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(screen.getByRole("button", { name: /^Vencidas/ }));
      expect(screen.getByRole("button", { name: /^Vencidas/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
      expect(screen.queryByText("Ana Souza")).not.toBeInTheDocument();
      expect(screen.queryByText("Carla Mendes")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Pagas/ }));
      expect(screen.getByText("Carla Mendes")).toBeInTheDocument();
      expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Em aberto/ }));
      expect(screen.getByText("Ana Souza")).toBeInTheDocument();
      expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^Todas/ }));
      fireEvent.change(screen.getByLabelText("Buscar cliente"), {
        target: { value: "bruno" },
      });
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
      expect(screen.queryByText("Ana Souza")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Buscar cliente"), {
        target: { value: "Zuleica" },
      });
      expect(
        screen.getByText("Nenhuma parcela encontrada"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Limpe a busca ou escolha outra situação para ver as parcelas.",
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
      expect(screen.getByText("Ana Souza")).toBeInTheDocument();
      expect(screen.getByText("Carla Mendes")).toBeInTheDocument();
    });

    it("asks for the payment method in a modal when settling an installment", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Dar baixa" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Dar baixa na parcela",
      });
      expect(within(dialog).getByText(/Ana Souza/)).toBeInTheDocument();
      const select = within(dialog).getByLabelText(
        "Forma de pagamento recebida",
      );
      expect(select).toHaveValue("pix");
      fireEvent.change(select, { target: { value: "card" } });
      fireEvent.submit(dialog.querySelector("form")!);
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      const call = vi
        .mocked(fetch)
        .mock.calls.find(
          ([url, options]) =>
            options?.method === "POST" &&
            String(url).includes("/finance/receivables/"),
        );
      expect(String(call?.[0])).toContain(
        "/finance/receivables/a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/pay",
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        paymentMethod: "card",
      });
    });

    it("shows the reload error on the page after a successful settlement", async () => {
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
      const workspace = receivablesWorkspace();
      let settled = false;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === "POST" && url.includes("/finance/receivables/")) {
          settled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ...workspace.summary.receivables[0],
              status: "paid",
            }),
          } as Response;
        }
        if (url.includes("/finance/workspace") && settled) {
          return {
            ok: false,
            status: 500,
            json: async () => ({
              code: "INTERNAL",
              message: "Falha ao recarregar o financeiro.",
            }),
          } as Response;
        }
        const body = url.includes("/finance/workspace") ? workspace : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/financeiro"]}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Dar baixa" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Dar baixa na parcela",
      });
      fireEvent.submit(dialog.querySelector("form")!);
      expect(
        await screen.findByText("Falha ao recarregar o financeiro."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes the settle modal without calling the API on Voltar", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Dar baixa" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Dar baixa na parcela",
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
    });

    it("clears the installment selection after settling, reversing or adjusting", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      const selectBoth = () => {
        fireEvent.click(
          screen.getByRole("checkbox", { name: "Selecionar todas" }),
        );
        expect(screen.getByText("2 parcelas selecionadas")).toBeInTheDocument();
      };
      const workspaceLoads = () =>
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) =>
            String(url).includes("/finance/workspace"),
          ).length;

      // Baixa: a parcela quitada não pode continuar marcada para o "Renegociar".
      selectBoth();
      fireEvent.click(
        within(rowOf("Bruno Lima")).getByRole("button", { name: "Dar baixa" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Dar baixa na parcela",
      });
      fireEvent.submit(dialog.querySelector("form")!);
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await vi.waitFor(() =>
        expect(
          screen.queryByText(/parcelas? selecionadas?$/),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Renegociar" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "Selecionar parcela de Ana Souza",
        }),
      ).not.toBeChecked();

      // Estorno.
      selectBoth();
      let loads = workspaceLoads();
      fireEvent.click(
        within(rowOf("Carla Mendes")).getByRole("button", { name: "Estornar" }),
      );
      await vi.waitFor(() => expect(workspaceLoads()).toBeGreaterThan(loads));
      expect(
        screen.queryByText(/parcelas? selecionadas?$/),
      ).not.toBeInTheDocument();

      // Ajuste de valor (no modal próprio, antes eram dois window.prompt).
      selectBoth();
      loads = workspaceLoads();
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Ajustar" }),
      );
      const adjust = await screen.findByRole("dialog", {
        name: "Ajustar valor da parcela",
      });
      fireEvent.change(within(adjust).getByLabelText("Novo valor (R$)"), {
        target: { value: "200" },
      });
      fireEvent.change(within(adjust).getByLabelText("Justificativa"), {
        target: { value: "Desconto combinado" },
      });
      fireEvent.click(
        within(adjust).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() => expect(workspaceLoads()).toBeGreaterThan(loads));
      expect(
        screen.queryByText(/parcelas? selecionadas?$/),
      ).not.toBeInTheDocument();
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url, options]) =>
              options?.method === "PATCH" &&
              String(url).includes(
                "/finance/receivables/a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/adjust",
              ),
          ),
      ).toBe(true);
    });

    const writes = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([, options]) => options?.method && options.method !== "GET",
        );
    const bodyOf = (path: string) => {
      const call = writes().find(([url]) => String(url).includes(path));
      return call
        ? (JSON.parse(String(call[1]?.body)) as Record<string, unknown>)
        : undefined;
    };

    it("adjusts an installment in a modal with the current value, validation and Voltar", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Ajustar" }),
      );
      let dialog = await screen.findByRole("dialog", {
        name: "Ajustar valor da parcela",
      });
      const value = within(dialog).getByLabelText("Novo valor (R$)");
      // Abre com o valor atual e o foco no primeiro campo.
      expect(value).toHaveValue("250,00");
      expect(value).toHaveFocus();
      expect(
        within(dialog).getByText(/Hoje a parcela vale R\$\s250,00/),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);

      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Ajustar" }),
      );
      dialog = await screen.findByRole("dialog", {
        name: "Ajustar valor da parcela",
      });
      fireEvent.change(within(dialog).getByLabelText("Novo valor (R$)"), {
        target: { value: "" },
      });
      // O que falta fica listado e Confirmar desativado, sem erro após o clique (QM14).
      const adjustConfirm = within(dialog).getByRole("button", {
        name: "Confirmar",
      });
      expect(adjustConfirm).toBeDisabled();
      expect(adjustConfirm).toHaveAccessibleDescription(
        "Falta: Novo valor, Justificativa (pelo menos 5 caracteres).",
      );
      fireEvent.change(within(dialog).getByLabelText("Novo valor (R$)"), {
        target: { value: "199.9" },
      });
      fireEvent.change(within(dialog).getByLabelText("Justificativa"), {
        target: { value: "Desc" },
      });
      expect(adjustConfirm).toBeDisabled();
      expect(adjustConfirm).toHaveAccessibleDescription(
        "Falta: Justificativa (pelo menos 5 caracteres).",
      );
      expect(writes()).toHaveLength(0);
      fireEvent.change(within(dialog).getByLabelText("Justificativa"), {
        target: { value: "  Desconto combinado " },
      });
      expect(adjustConfirm).toBeEnabled();
      expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(
        bodyOf(
          "/finance/receivables/a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1/adjust",
        ),
      ).toEqual({ amountInCents: 19990, reason: "Desconto combinado" });
    });

    it("closes an action modal with Esc and confirms with the submit button of its form", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Ajustar" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Ajustar valor da parcela",
      });
      // Enter num campo envia o formulário do modal: o botão Confirmar é o submit dele.
      const confirm = within(dialog).getByRole("button", { name: "Confirmar" });
      expect(confirm).toHaveAttribute("type", "submit");
      expect(confirm.closest("form")).toBe(
        within(dialog).getByLabelText("Justificativa").closest("form"),
      );
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);
    });

    it("locks the X, Voltar and Esc of an action modal while it saves", async () => {
      renderFinance();
      const base = vi.mocked(fetch).getMockImplementation()!;
      // O ajuste fica pendente: o modal continua "salvando".
      vi.mocked(fetch).mockImplementation((input, init) =>
        init?.method === "PATCH"
          ? new Promise<Response>(() => undefined)
          : base(input, init),
      );
      await screen.findByText("Ana Souza");
      fireEvent.click(
        within(rowOf("Ana Souza")).getByRole("button", { name: "Ajustar" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Ajustar valor da parcela",
      });
      expect(
        within(dialog).getByRole("button", { name: "Fechar" }),
      ).toBeEnabled();
      fireEvent.change(within(dialog).getByLabelText("Novo valor (R$)"), {
        target: { value: "200" },
      });
      fireEvent.change(within(dialog).getByLabelText("Justificativa"), {
        target: { value: "Desconto combinado" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await within(dialog).findByRole("button", { name: "Salvando…" });
      expect(
        within(dialog).getByRole("button", { name: "Fechar" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Voltar" }),
      ).toBeDisabled();
      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.mouseDown(dialog.parentElement!);
      expect(
        screen.getByRole("dialog", { name: "Ajustar valor da parcela" }),
      ).toBeInTheDocument();
    });

    it("renegotiates the selected installments in a single form", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: "Selecionar parcela de Ana Souza",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Renegociar" }));
      let dialog = await screen.findByRole("dialog", {
        name: "Renegociar parcelas",
      });
      expect(
        within(dialog).getByText(/Ana Souza · 1 parcela · R\$\s250,00/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByLabelText("Novo valor total (R$)"),
      ).toHaveValue("250,00");
      expect(
        within(dialog).getByLabelText("Novo valor total (R$)"),
      ).toHaveFocus();
      expect(within(dialog).getByLabelText("Número de parcelas")).toHaveValue(
        1,
      );
      expect(
        within(dialog).getByLabelText("Primeiro vencimento"),
      ).toHaveAttribute("type", "date");
      expect(within(dialog).getByLabelText("Primeiro vencimento")).toHaveValue(
        saoPauloToday(),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);

      fireEvent.click(screen.getByRole("button", { name: "Renegociar" }));
      dialog = await screen.findByRole("dialog", {
        name: "Renegociar parcelas",
      });
      fireEvent.change(within(dialog).getByLabelText("Novo valor total (R$)"), {
        target: { value: "300" },
      });
      fireEvent.change(within(dialog).getByLabelText("Número de parcelas"), {
        target: { value: "40" },
      });
      // Campos que faltam: Confirmar desativado com a lista (QM14).
      const renegotiateConfirm = within(dialog).getByRole("button", {
        name: "Confirmar",
      });
      expect(renegotiateConfirm).toBeDisabled();
      expect(renegotiateConfirm).toHaveAccessibleDescription(
        "Falta: Motivo da renegociação (pelo menos 5 caracteres).",
      );
      fireEvent.change(
        within(dialog).getByLabelText("Motivo da renegociação"),
        { target: { value: "Cliente pediu para parcelar" } },
      );
      expect(renegotiateConfirm).toBeEnabled();
      // Fora do intervalo é regra, não falta: erro uma única vez após o clique.
      fireEvent.click(renegotiateConfirm);
      expect(
        within(dialog).getByText("Informe de 1 a 36 parcelas."),
      ).toHaveClass("form-error");
      expect(within(dialog).getAllByText(/1 a 36 parcelas/)).toHaveLength(1);
      fireEvent.change(within(dialog).getByLabelText("Número de parcelas"), {
        target: { value: "3" },
      });
      fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
        target: { value: "" },
      });
      expect(renegotiateConfirm).toBeDisabled();
      expect(renegotiateConfirm).toHaveAccessibleDescription(
        "Falta: Primeiro vencimento.",
      );
      fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
        target: { value: "2026-11-10" },
      });
      expect(writes()).toHaveLength(0);
      fireEvent.change(
        within(dialog).getByLabelText("Motivo da renegociação"),
        { target: { value: "Cliente pediu para parcelar" } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(writes()).toHaveLength(1);
      expect(bodyOf("/finance/renegotiations")).toEqual({
        receivableIds: ["a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1"],
        totalAmountInCents: 30000,
        installments: 3,
        firstDueDate: "2026-11-10",
        reason: "Cliente pediu para parcelar",
      });
      await vi.waitFor(() =>
        expect(
          screen.queryByText(/parcelas? selecionadas?$/),
        ).not.toBeInTheDocument(),
      );
    });

    it("creates an expense category and a cost center in their own modals", async () => {
      renderFinance();
      await screen.findByText("Ana Souza");
      fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
      let dialog = await screen.findByRole("dialog", {
        name: "Nova categoria de despesa",
      });
      expect(within(dialog).getByLabelText("Nome")).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);

      fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
      dialog = await screen.findByRole("dialog", {
        name: "Nova categoria de despesa",
      });
      fireEvent.change(within(dialog).getByLabelText("Nome"), {
        target: { value: " a " },
      });
      // Nome curto: Salvar desativado com o que falta (QM14).
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toHaveAccessibleDescription("Falta: Nome (pelo menos 2 caracteres).");
      expect(writes()).toHaveLength(0);
      fireEvent.change(within(dialog).getByLabelText("Nome"), {
        target: { value: " Material de limpeza " },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(bodyOf("/finance/categories")).toEqual({
        name: "Material de limpeza",
        kind: "expense",
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Novo centro de custo" }),
      );
      dialog = await screen.findByRole("dialog", {
        name: "Novo centro de custo",
      });
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toHaveAccessibleDescription("Falta: Nome (pelo menos 2 caracteres).");
      fireEvent.change(within(dialog).getByLabelText("Nome"), {
        target: { value: "Estúdio" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(bodyOf("/finance/cost-centers")).toEqual({ name: "Estúdio" });
    });
  });

  describe("finance payables and commissions", () => {
    // Mesmo formato de data do sistema (shortDate do App).
    const shortDate = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    });
    const clinicId = "11111111-1111-4111-8111-111111111111";
    function shiftDate(iso: string, days: number) {
      const date = new Date(`${iso}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    }
    function financeWorkspace(overrides: Record<string, unknown> = {}) {
      const today = saoPauloToday();
      const base = {
        clinicId,
        categoryId: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
        costCenterId: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
        categoryName: "Aluguel",
        costCenterName: "Administrativo",
        createdAt: "2026-01-01T12:00:00.000Z",
        updatedAt: "2026-01-01T12:00:00.000Z",
      };
      return {
        summary: {
          openInCents: 0,
          overdueInCents: 0,
          paidThisMonthInCents: 0,
          receivables: [],
        },
        categories: [],
        costCenters: [],
        payables: [
          {
            ...base,
            id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
            description: "Aluguel da sala",
            supplier: "Imobiliária Centro",
            dueDate: shiftDate(today, -3),
            amountInCents: 250000,
            status: "open",
            overdue: true,
          },
          {
            ...base,
            id: "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2",
            description: "Material de limpeza",
            dueDate: shiftDate(today, 7),
            amountInCents: 8990,
            status: "open",
            overdue: false,
          },
          {
            ...base,
            id: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
            description: "Conta de luz",
            supplier: "Energisa",
            dueDate: shiftDate(today, -10),
            amountInCents: 32000,
            status: "paid",
            paidAt: `${today}T12:00:00.000Z`,
            paymentMethod: "pix",
            overdue: false,
          },
        ],
        payableOpenInCents: 258990,
        payableOverdueInCents: 250000,
        paidExpensesThisMonthInCents: 32000,
        cashBalanceThisMonthInCents: -32000,
        commissionRules: [],
        commissions: [
          {
            id: "g1g1g1g1-0000-4000-8000-000000000001",
            clinicId,
            professionalId: "p1",
            professionalName: "Juliana Prado",
            appointmentId: "ap1",
            competence: "2026-09",
            baseAmountInCents: 30000,
            percentage: 30,
            amountInCents: 9000,
            status: "open",
            createdAt: "2026-09-30T12:00:00.000Z",
          },
          {
            id: "g1g1g1g1-0000-4000-8000-000000000002",
            clinicId,
            professionalId: "p2",
            professionalName: "Rafael Costa",
            appointmentId: "ap2",
            competence: "2026-08",
            baseAmountInCents: 20000,
            percentage: 25,
            amountInCents: 5000,
            status: "paid",
            paidAt: "2026-09-05T12:00:00.000Z",
            createdAt: "2026-08-31T12:00:00.000Z",
          },
        ],
        commissionOpenInCents: 9000,
        paidCommissionsThisMonthInCents: 5000,
        ...overrides,
      };
    }
    function renderFinance(workspace: ReturnType<typeof financeWorkspace>) {
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
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === "POST")
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        const body = url.includes("/finance/workspace") ? workspace : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/financeiro"]}>
          <App />
        </MemoryRouter>,
      );
    }
    const rowOf = (name: string) =>
      screen.getByText(name).closest(".finance-row") as HTMLElement;

    it("shows payables in readable rows with explanation, signed red values, dates and compact actions", async () => {
      renderFinance(financeWorkspace());
      fireEvent.click(
        await screen.findByRole("button", { name: "Contas a pagar (3)" }),
      );
      const section = (
        await screen.findByRole("heading", { name: "Contas a pagar" })
      ).closest("section")!;
      expect(
        within(section).getByText(/Despesas da clínica pelo vencimento/),
      ).toBeInTheDocument();

      const rent = rowOf("Aluguel da sala");
      expect(
        within(rent).getByText("Imobiliária Centro · Administrativo"),
      ).toBeInTheDocument();
      expect(within(rent).getByText("- R$ 2.500,00")).toHaveClass(
        "finance-amount",
        "cash-out",
      );
      expect(within(rent).getByText("Vencida há 3 dias")).toHaveClass(
        "status-pill",
        "overdue",
      );
      expect(
        within(rent).getByRole("button", { name: "Pagar Aluguel da sala" }),
      ).toHaveClass("primary-button", "button-sm");
      const dueText = shortDate.format(
        new Date(`${shiftDate(saoPauloToday(), -3)}T12:00:00`),
      );
      expect(rent.querySelector(".finance-due")).toHaveTextContent(dueText);

      const cleaning = rowOf("Material de limpeza");
      expect(
        within(cleaning).getByText("Aluguel · Administrativo"),
      ).toBeInTheDocument();
      expect(within(cleaning).getByText("Em aberto")).toHaveClass(
        "status-pill",
        "open",
      );

      const light = rowOf("Conta de luz");
      expect(within(light).getByText("Paga")).toHaveClass(
        "status-pill",
        "paid",
      );
      expect(
        within(light).getByRole("button", { name: "Estornar Conta de luz" }),
      ).toHaveClass("danger-button", "button-sm");
      expect(
        within(light).queryByRole("button", { name: /^Pagar/ }),
      ).not.toBeInTheDocument();

      // Pagar pede a forma de pagamento no modal.
      fireEvent.click(
        within(rent).getByRole("button", { name: "Pagar Aluguel da sala" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Pagar despesa",
      });
      expect(
        within(dialog).getByLabelText("Forma de pagamento usada"),
      ).toBeInTheDocument();
    });

    it("shows an empty payables list with the next step", async () => {
      renderFinance(financeWorkspace({ payables: [] }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Contas a pagar (0)" }),
      );
      const section = (
        await screen.findByRole("heading", { name: "Contas a pagar" })
      ).closest("section")!;
      expect(
        within(section).getByText("Nenhuma conta a pagar"),
      ).toBeInTheDocument();
      expect(
        within(section).getByText(/Lance a primeira despesa/),
      ).toBeInTheDocument();
      fireEvent.click(
        within(section).getByRole("button", { name: "Nova despesa" }),
      );
      expect(
        await screen.findByRole("dialog", { name: "Nova conta a pagar" }),
      ).toBeInTheDocument();
    });

    it("shows commissions with full labels, signed values aligned right and clear actions", async () => {
      renderFinance(financeWorkspace());
      fireEvent.click(
        await screen.findByRole("button", { name: "Comissões (2)" }),
      );
      const section = (
        await screen.findByRole("heading", { name: "Comissões" })
      ).closest("section")!;
      expect(
        within(section).getByText(/Quanto cada profissional tem a receber/),
      ).toBeInTheDocument();
      expect(
        within(section).getByRole("button", { name: "Nova regra" }),
      ).toHaveClass("secondary-button");
      expect(
        within(section).getByRole("button", { name: "Gerar comissões do mês" }),
      ).toHaveClass("primary-button");

      const juliana = rowOf("Juliana Prado");
      expect(
        within(juliana).getByText("Competência 09/2026"),
      ).toBeInTheDocument();
      const numbers = [...juliana.querySelectorAll(".finance-number")].map(
        (cell) => cell.textContent?.replace(/\s/g, " "),
      );
      expect(numbers).toEqual(["Base de cálculo R$ 300,00", "Percentual 30%"]);
      expect(within(juliana).getByText("- R$ 90,00")).toHaveClass(
        "finance-amount",
        "cash-out",
      );
      expect(within(juliana).getByText("Em aberto")).toHaveClass(
        "status-pill",
        "open",
      );
      expect(
        within(juliana).getByRole("button", {
          name: "Pagar comissão de Juliana Prado",
        }),
      ).toHaveClass("primary-button", "button-sm");

      const rafael = rowOf("Rafael Costa");
      expect(
        within(rafael).getByText(
          `Competência 08/2026 · paga em ${shortDate.format(new Date("2026-09-05T12:00:00.000Z"))}`,
        ),
      ).toBeInTheDocument();
      expect(
        within(rafael).getByRole("button", {
          name: "Estornar comissão de Rafael Costa",
        }),
      ).toHaveClass("danger-button", "button-sm");

      fireEvent.click(
        within(juliana).getByRole("button", {
          name: "Pagar comissão de Juliana Prado",
        }),
      );
      await vi.waitFor(() =>
        expect(
          vi
            .mocked(fetch)
            .mock.calls.some(
              ([url, options]) =>
                options?.method === "POST" &&
                String(url).includes(
                  "/finance/commissions/g1g1g1g1-0000-4000-8000-000000000001/pay",
                ),
            ),
        ).toBe(true),
      );
    });

    it("shows an empty commissions list with the next step", async () => {
      renderFinance(financeWorkspace({ commissions: [] }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Comissões (0)" }),
      );
      expect(
        await screen.findByText("Nenhuma comissão gerada"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Cadastre uma regra de comissão e use “Gerar comissões do mês”/,
        ),
      ).toBeInTheDocument();
    });

    it("creates a commission rule in a modal with professional, percentage and start date", async () => {
      const workspace = financeWorkspace();
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
      const professionals = [
        {
          id: "33333333-3333-4333-8333-333333333333",
          fullName: "Juliana Prado",
          color: "#5c6f68",
          active: true,
        },
        {
          id: "34343434-3434-4343-8343-343434343434",
          fullName: "Rafael Costa",
          color: "#336699",
          active: true,
        },
      ];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === "POST")
          return { ok: true, status: 201, json: async () => ({}) } as Response;
        const body = url.includes("/finance/workspace")
          ? workspace
          : url.endsWith("/professionals")
            ? professionals
            : [];
        return { ok: true, status: 200, json: async () => body } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/financeiro"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Comissões (2)" }),
      );
      const posts = () =>
        vi
          .mocked(fetch)
          .mock.calls.filter(
            ([url, options]) =>
              options?.method === "POST" &&
              String(url).includes("/finance/commission-rules"),
          );

      fireEvent.click(
        await screen.findByRole("button", { name: "Nova regra" }),
      );
      let dialog = await screen.findByRole("dialog", {
        name: "Nova regra de comissão",
      });
      expect(within(dialog).getByLabelText("Profissional")).toHaveFocus();
      expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
        professionals[0]!.id,
      );
      expect(within(dialog).getByLabelText("Vale a partir de")).toHaveValue(
        saoPauloToday(),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(posts()).toHaveLength(0);

      fireEvent.click(screen.getByRole("button", { name: "Nova regra" }));
      dialog = await screen.findByRole("dialog", {
        name: "Nova regra de comissão",
      });
      fireEvent.change(within(dialog).getByLabelText("Profissional"), {
        target: { value: professionals[1]!.id },
      });
      fireEvent.change(within(dialog).getByLabelText("Percentual (%)"), {
        target: { value: "" },
      });
      // Campo vazio é falta: Salvar desativado com a lista (QM14).
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toHaveAccessibleDescription("Falta: Percentual (%).");
      fireEvent.change(within(dialog).getByLabelText("Percentual (%)"), {
        target: { value: "120" },
      });
      expect(
        within(dialog).getByRole("button", { name: "Salvar" }),
      ).toBeEnabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      expect(
        within(dialog).getByText("Informe um percentual entre 0 e 100."),
      ).toHaveClass("form-error");
      expect(posts()).toHaveLength(0);
      fireEvent.change(within(dialog).getByLabelText("Percentual (%)"), {
        target: { value: "27.5" },
      });
      fireEvent.change(within(dialog).getByLabelText("Vale a partir de"), {
        target: { value: "2026-11-01" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(posts()).toHaveLength(1);
      expect(JSON.parse(String(posts()[0]![1]?.body))).toEqual({
        professionalId: professionals[1]!.id,
        percentage: 27.5,
        effectiveFrom: "2026-11-01",
      });
    });
  });

  it("shows the daily cash with totals by payment method and movements", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "finance",
      }),
    );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    const cash = {
      date: today,
      generatedAt: "2026-09-30T21:00:00.000Z",
      byPaymentMethod: [
        {
          paymentMethod: "pix",
          inflowInCents: 25000,
          outflowInCents: 0,
          balanceInCents: 25000,
        },
        {
          paymentMethod: "bank_transfer",
          inflowInCents: 0,
          outflowInCents: 250000,
          balanceInCents: -250000,
        },
        {
          paymentMethod: "unspecified",
          inflowInCents: -8000,
          outflowInCents: 5000,
          balanceInCents: -13000,
        },
      ],
      totalInflowInCents: 17000,
      totalOutflowInCents: 255000,
      balanceInCents: -238000,
      movements: [
        {
          id: "receipt:1",
          kind: "receipt",
          direction: "in",
          occurredAt: "2026-09-30T12:15:00.000Z",
          description: "Pilates 2x · parcela 1/3",
          counterpart: "Ana Souza",
          paymentMethod: "pix",
          amountInCents: 25000,
        },
        {
          id: "receipt_reversal:2",
          kind: "receipt_reversal",
          direction: "in",
          occurredAt: "2026-09-30T14:00:00.000Z",
          description: "Avaliação postural",
          counterpart: "Bruno Lima",
          paymentMethod: "unspecified",
          amountInCents: -8000,
        },
        {
          id: "payable:3",
          kind: "payable",
          direction: "out",
          occurredAt: "2026-09-30T17:30:00.000Z",
          description: "Aluguel da sala",
          counterpart: "Imobiliária Centro",
          paymentMethod: "bank_transfer",
          amountInCents: 250000,
        },
        {
          id: "commission:4",
          kind: "commission",
          direction: "out",
          occurredAt: "2026-09-30T20:00:00.000Z",
          description: "Comissão 09/2026",
          paymentMethod: "unspecified",
          amountInCents: 5000,
        },
      ],
    };
    const emptyCash = {
      ...cash,
      date: "2026-09-01",
      byPaymentMethod: [],
      totalInflowInCents: 0,
      totalOutflowInCents: 0,
      balanceInCents: 0,
      movements: [],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/finance/daily-cash")
        ? url.includes(`date=${today}`)
          ? cash
          : emptyCash
        : url.includes("/finance/workspace")
          ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Caixa do dia" }),
    );
    const section = (
      await screen.findByRole("heading", { name: "Caixa do dia" })
    ).closest("section")!;
    const dateInput = within(section).getByLabelText("Data");
    expect(dateInput).toHaveAttribute("type", "date");
    expect(dateInput).toHaveValue(today);
    expect(await within(section).findByText("Ana Souza")).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes(`/finance/daily-cash?date=${today}`),
        ),
    ).toBe(true);
    // A forma usada na baixa não se aplica ao caixa.
    expect(
      screen.queryByLabelText("Forma usada na baixa"),
    ).not.toBeInTheDocument();

    // Totais do dia.
    const totals = within(section).getByRole("list", { name: "Totais do dia" });
    expect(
      within(totals).getByText("Entradas").nextElementSibling,
    ).toHaveTextContent("R$ 170,00");
    expect(
      within(totals).getByText("Saídas").nextElementSibling,
    ).toHaveTextContent("R$ 2.550,00");
    expect(
      within(totals).getByText("Saldo").nextElementSibling,
    ).toHaveTextContent("-R$ 2.380,00");

    // Frase curta explica a aba; entradas em verde e saídas em vermelho no resumo.
    expect(
      within(section).getByText(
        /Tudo o que entrou e saiu do caixa no dia escolhido/,
      ),
    ).toBeInTheDocument();
    expect(within(totals).getByText("Entradas").nextElementSibling).toHaveClass(
      "cash-in",
    );
    expect(within(totals).getByText("Saídas").nextElementSibling).toHaveClass(
      "cash-out",
    );

    // Movimentos agrupados por forma de pagamento (ordem da API), cada grupo com seus totais.
    const groups = [
      ...section.querySelectorAll(".daily-cash-group"),
    ] as HTMLElement[];
    expect(
      groups.map((group) => group.querySelector("h3")?.textContent),
    ).toEqual(["Pix", "Transferência", "Não informada"]);
    const totalsOf = (group: HTMLElement) =>
      [...group.querySelectorAll(".daily-cash-group-totals dd")].map((dd) =>
        dd.textContent?.replace(/\s/g, " "),
      );
    expect(totalsOf(groups[0]!)).toEqual(["R$ 250,00", "R$ 0,00", "R$ 250,00"]);
    expect(totalsOf(groups[1]!)).toEqual([
      "R$ 0,00",
      "R$ 2.500,00",
      "-R$ 2.500,00",
    ]);
    expect(totalsOf(groups[2]!)).toEqual([
      "-R$ 80,00",
      "R$ 50,00",
      "-R$ 130,00",
    ]);
    expect(screen.getByRole("region", { name: "Movimentos em Pix" })).toBe(
      groups[0],
    );

    // Dentro de cada grupo, em ordem, com tipo, hora (São Paulo) e valor com sinal e cor.
    const rowsOf = (group: HTMLElement) =>
      [
        ...group.querySelectorAll(".daily-cash-table .finance-row"),
      ] as HTMLElement[];
    expect(
      section.querySelectorAll(".daily-cash-table .finance-row"),
    ).toHaveLength(4);
    const [pixRow] = rowsOf(groups[0]!);
    expect(within(pixRow!).getByText("Recebimento")).toBeInTheDocument();
    expect(within(pixRow!).getByText("09:15")).toBeInTheDocument();
    expect(within(pixRow!).getByText("+ R$ 250,00")).toHaveClass(
      "finance-amount",
      "cash-in",
    );
    const [transferRow] = rowsOf(groups[1]!);
    expect(within(transferRow!).getByText("Conta paga")).toBeInTheDocument();
    expect(within(transferRow!).getByText("14:30")).toBeInTheDocument();
    expect(within(transferRow!).getByText("- R$ 2.500,00")).toHaveClass(
      "finance-amount",
      "cash-out",
    );
    const unspecifiedRows = rowsOf(groups[2]!);
    expect(unspecifiedRows).toHaveLength(2);
    expect(
      within(unspecifiedRows[0]!).getByText("Estorno"),
    ).toBeInTheDocument();
    expect(
      within(unspecifiedRows[0]!).getByText("Bruno Lima"),
    ).toBeInTheDocument();
    expect(within(unspecifiedRows[0]!).getByText("- R$ 80,00")).toHaveClass(
      "cash-out",
    );
    expect(
      within(unspecifiedRows[1]!).getByText("Comissão"),
    ).toBeInTheDocument();
    expect(
      within(unspecifiedRows[1]!).getByText("- R$ 50,00"),
    ).toBeInTheDocument();

    // Outro dia sem movimento: busca a data escolhida e mostra o estado vazio.
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
    expect(
      await within(section).findByText("Nenhum movimento neste dia"),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/finance/daily-cash?date=2026-09-01"),
        ),
    ).toBe(true);
    expect(within(section).queryByText("Ana Souza")).not.toBeInTheDocument();
    expect(section.querySelector(".daily-cash-group")).toBeNull();
    // O vazio diz o próximo passo e oferece voltar para hoje.
    expect(
      within(section).getByText(/Escolha outra data no campo acima/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole("button", { name: "Ver o caixa de hoje" }),
    );
    expect(await within(section).findByText("Ana Souza")).toBeInTheDocument();
    expect(dateInput).toHaveValue(today);
  });

  it("shows the finance forecast by month with confirmed and projected values", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "finance",
      }),
    );
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    const flow = (inflowInCents: number, outflowInCents: number) => ({
      inflowInCents,
      outflowInCents,
      balanceInCents: inflowInCents - outflowInCents,
    });
    const monthKey = (index: number) => {
      const total = 2026 * 12 + 8 + index;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    };
    const forecast = (count: number) => {
      const months = Array.from({ length: count }, (_, index) => {
        const confirmed =
          index === 0
            ? flow(50000, 250000)
            : index === 1
              ? flow(30000, 0)
              : flow(0, 0);
        const projected = index === 0 ? flow(0, 0) : flow(45000, 250000);
        return {
          month: monthKey(index),
          confirmed,
          projected,
          balanceInCents: confirmed.balanceInCents + projected.balanceInCents,
        };
      });
      const sum = (key: "confirmed" | "projected") =>
        flow(
          months.reduce((t, m) => t + m[key].inflowInCents, 0),
          months.reduce((t, m) => t + m[key].outflowInCents, 0),
        );
      return {
        generatedAt: "2026-09-30T12:00:00.000Z",
        startMonth: months[0]!.month,
        endMonth: months[months.length - 1]!.month,
        months,
        overdue: flow(12000, 3000),
        totals: {
          confirmed: sum("confirmed"),
          projected: sum("projected"),
          balanceInCents: months.reduce((t, m) => t + m.balanceInCents, 0),
        },
      };
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/finance/forecast")
        ? forecast(Number(/months=(\d+)/.exec(url)?.[1] ?? 6))
        : url.includes("/finance/workspace")
          ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    const section = (
      await screen.findByRole("heading", { name: "Previsão" })
    ).closest("section")!;
    // A forma usada na baixa não se aplica à previsão.
    expect(
      screen.queryByLabelText("Forma usada na baixa"),
    ).not.toBeInTheDocument();
    const select = within(section).getByLabelText("Horizonte");
    expect(select).toHaveValue("6");
    expect(
      [...(select as HTMLSelectElement).options].map(
        (option) => option.textContent,
      ),
    ).toEqual(["3 meses", "6 meses", "12 meses"]);
    const table = await within(section).findByRole("table", {
      name: "Previsão por mês",
    });
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/finance/forecast?months=6"),
        ),
    ).toBe(true);

    // Os cabeçalhos distinguem confirmado de projetado.
    expect(
      within(table).getByRole("columnheader", {
        name: "Pagamentos confirmados",
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Pagamentos em aberto" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Saldo do mês" }),
    ).toBeInTheDocument();

    const bodyRows = () =>
      within(table)
        .getAllByRole("row")
        .filter((row) => row.closest("tbody"));
    expect(
      bodyRows().map((row) => row.querySelector("th")?.textContent),
    ).toEqual([
      "09/2026",
      "10/2026",
      "11/2026",
      "12/2026",
      "01/2027",
      "02/2027",
    ]);
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent?.replace(/\s/g, " "));
    expect(cells(bodyRows()[0]!)).toEqual([
      "R$ 500,00",
      "R$ 2.500,00",
      "-R$ 2.000,00",
      "R$ 0,00",
      "R$ 0,00",
      "R$ 0,00",
      "-R$ 2.000,00",
    ]);
    expect(cells(bodyRows()[1]!)).toEqual([
      "R$ 300,00",
      "R$ 0,00",
      "R$ 300,00",
      "R$ 450,00",
      "R$ 2.500,00",
      "-R$ 2.050,00",
      "-R$ 1.750,00",
    ]);
    const footer = within(table)
      .getAllByRole("row")
      .find((row) => row.closest("tfoot"))!;
    expect(footer.querySelector("th")?.textContent).toBe("Total");
    expect(cells(footer)).toEqual([
      "R$ 800,00",
      "R$ 2.500,00",
      "-R$ 1.700,00",
      "R$ 2.250,00",
      "R$ 12.500,00",
      "-R$ 10.250,00",
      "-R$ 11.950,00",
    ]);
    // Entradas em verde, saídas em vermelho, saldo negativo em vermelho.
    const firstCells = within(bodyRows()[0]!).getAllByRole("cell");
    expect(firstCells[0]).toHaveClass("cash-in");
    expect(firstCells[1]).toHaveClass("cash-out");
    expect(firstCells[2]).toHaveClass("negative");

    // Frase explicativa e legenda dos pagamentos confirmados e em aberto.
    expect(
      within(section).getByText(
        /Quanto deve entrar e sair do caixa nos próximos meses/,
      ),
    ).toBeInTheDocument();
    const legend = section.querySelector(".forecast-legend")!;
    expect(
      [...legend.querySelectorAll("dt")].map((dt) => dt.textContent),
    ).toEqual(["Pagamentos confirmados", "Pagamentos em aberto"]);
    expect(legend).toHaveTextContent("já lançadas e em aberto");
    expect(legend).toHaveTextContent(
      "Renovações automáticas de planos e despesas fixas",
    );
    // A tabela rola na horizontal dentro do próprio contêiner (1ª coluna fixa no CSS).
    expect(table.parentElement).toHaveClass("forecast-scroll");

    // Em atraso aparece à parte, fora dos saldos.
    const overdue = section.querySelector(".forecast-overdue")!;
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain("Em atraso");
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain(
      "R$ 120,00 a receber",
    );
    expect(overdue.textContent?.replace(/\s/g, " ")).toContain(
      "R$ 30,00 a pagar",
    );
    expect(overdue).toHaveTextContent("fora dos saldos");

    // Trocar o horizonte refaz a busca.
    fireEvent.change(select, { target: { value: "3" } });
    await vi.waitFor(() =>
      expect(
        within(section)
          .getAllByRole("row")
          .filter((row) => row.closest("tbody")),
      ).toHaveLength(3),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/finance/forecast?months=3"),
        ),
    ).toBe(true);
    fireEvent.change(select, { target: { value: "12" } });
    await vi.waitFor(() =>
      expect(
        within(section)
          .getAllByRole("row")
          .filter((row) => row.closest("tbody")),
      ).toHaveLength(12),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) =>
          String(url).includes("/finance/forecast?months=12"),
        ),
    ).toBe(true);
  });

  it("shows empty and error states for the finance forecast", async () => {
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
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    const zero = { inflowInCents: 0, outflowInCents: 0, balanceInCents: 0 };
    const emptyForecast = {
      generatedAt: "2026-09-30T12:00:00.000Z",
      startMonth: "2026-09",
      endMonth: "2027-02",
      months: [
        "2026-09",
        "2026-10",
        "2026-11",
        "2026-12",
        "2027-01",
        "2027-02",
      ].map((month) => ({
        month,
        confirmed: zero,
        projected: zero,
        balanceInCents: 0,
      })),
      overdue: zero,
      totals: { confirmed: zero, projected: zero, balanceInCents: 0 },
    };
    let failing = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/forecast") && failing) {
        return {
          ok: false,
          status: 500,
          json: async () => ({
            code: "INTERNAL",
            message: "Falha ao carregar a previsão.",
          }),
        } as Response;
      }
      const body = url.includes("/finance/forecast")
        ? emptyForecast
        : url.includes("/finance/workspace")
          ? workspace
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    expect(
      await screen.findByText("Nada previsto no período"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Venda um plano, lance uma conta a pagar ou cadastre uma despesa fixa/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Previsão por mês" }),
    ).not.toBeInTheDocument();
    unmount();

    failing = true;
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Previsão" }));
    expect(
      await screen.findByText("Falha ao carregar a previsão."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nada previsto no período"),
    ).not.toBeInTheDocument();
  });

  it("shows the API error for the daily cash", async () => {
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
    const workspace = {
      summary: {
        openInCents: 0,
        overdueInCents: 0,
        paidThisMonthInCents: 0,
        receivables: [],
      },
      categories: [],
      costCenters: [],
      payables: [],
      payableOpenInCents: 0,
      payableOverdueInCents: 0,
      paidExpensesThisMonthInCents: 0,
      cashBalanceThisMonthInCents: 0,
      commissionRules: [],
      commissions: [],
      commissionOpenInCents: 0,
      paidCommissionsThisMonthInCents: 0,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/finance/daily-cash")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: "VALIDATION_ERROR",
            message: "Informe uma data válida.",
          }),
        } as Response;
      }
      const body = url.includes("/finance/workspace") ? workspace : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Caixa do dia" }),
    );
    expect(
      await screen.findByText("Informe uma data válida."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum movimento neste dia"),
    ).not.toBeInTheDocument();
  });
});

function relationshipSettingsFixture() {
  return {
    birthdayDaysAhead: 7,
    singleNoReturnDays: 60,
    planExpiringDays: 7,
    lowBalanceSessions: 2,
    expiredWithBalanceDays: 60,
    treatmentPausedDays: 30,
    repeatedNoShowCount: 2,
    repeatedNoShowWindowDays: 30,
    formerClientMinDays: 30,
    formerClientMaxDays: 90,
    messages: {
      birthday: "Parabéns, {{nome}}!",
      single_no_return: "Oi {{nome}}, sentimos sua falta.",
      plan_expiring: "Oi {{nome}}, seu plano está acabando.",
      low_balance: "x",
      expired_with_balance: "x",
      treatment_paused: "x",
      repeated_no_show: "x",
      former_client: "x",
      overdue_payment: "x",
      nps_detractor: "x",
    },
  };
}

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
      target: { value: "SenhaForte123" },
    });
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
      password: "SenhaForte123",
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
      target: { value: "NovaSenha123" },
    });
    fireEvent.submit(
      within(resetDialog).getByLabelText("Nova senha").closest("form")!,
    );
    expect(
      await screen.findByText("Senha de Maria Souza redefinida."),
    ).toBeInTheDocument();
    const reset = lastCall("POST");
    expect(reset.url).toContain(`/admin/users/${customUser.id}/reset-password`);
    expect(reset.body).toEqual({ password: "NovaSenha123" });

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
            nonCancelledAppointmentsToday: 0,
            pendingToday: 0,
            awaitingConfirmationToday: 0,
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
      "Finalização automática",
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

describe("view-only modules", () => {
  it("shows appointment details without cancel, reschedule or satisfaction when the agenda is view-only", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["agenda", "patients"],
        editModules: [],
      }),
    );
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const base = {
      patientId: "99999999-9999-4999-8999-999999999999",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Fisioterapia individual",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
    };
    const scheduled = {
      ...base,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      status: "scheduled",
    };
    const completed = {
      ...base,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      patientName: "Bruno Costa",
      status: "completed",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body =
        url.includes("/appointments?") || url.includes("/appointments/options?")
          ? [scheduled, completed]
          : url.includes("/satisfaction")
            ? { surveys: [] }
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("note")).toHaveTextContent(
      "Seu acesso a Agenda é só de consulta",
    );
    expect(
      screen.queryByRole("button", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Bloquear horário" }),
    ).not.toBeInTheDocument();
    expect(
      (await screen.findAllByLabelText("Status do atendimento"))[0],
    ).toBeDisabled();

    fireEvent.click(
      await screen.findByRole("button", { name: "Detalhes de Helena Almeida" }),
    );
    let dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Sala Movimento", { exact: false }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Cancelar atendimento" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Remarcar atendimento" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Detalhes de Bruno Costa" }),
    );
    dialog = screen.getByRole("dialog");
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => String(url).includes("/satisfaction")),
      ).toBe(true),
    );
    expect(
      within(dialog).queryByRole("button", { name: "Registrar satisfação" }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([, init]) => init?.method && init.method !== "GET"),
    ).toBe(false);
  });

  it("shows the CRM history without lead actions or activity forms when the CRM is view-only", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["crm"],
        editModules: [],
      }),
    );
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "contacted",
      tags: [],
      openTasks: 1,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const activity = {
      tasks: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          clinicId: lead.clinicId,
          leadId: lead.id,
          title: "Ligar de volta",
          dueAt: "2026-10-05T12:00:00.000Z",
          status: "open",
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
        },
      ],
      contacts: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          clinicId: lead.clinicId,
          leadId: lead.id,
          channel: "phone",
          direction: "outbound",
          notes: "Pediu horários à noite",
          actorName: "Joana",
          occurredAt: lead.createdAt,
          createdAt: lead.createdAt,
        },
      ],
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = isLeadBoardUrl(url)
        ? leadBoardResponse(url, [lead])
        : url.includes("/activity")
          ? activity
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Bruna Lead")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Seu acesso a CRM comercial é só de consulta",
    );
    expect(
      screen.queryByRole("button", { name: /Novo lead/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Converter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Agendar experimental/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Atividades" }));
    const dialog = screen.getByRole("dialog", { name: "Bruna Lead" });
    expect(
      await within(dialog).findByText("Ligar de volta"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Aberta")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Adicionar tarefa" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Concluir" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Contatos/ }));
    expect(
      within(dialog).getByText(/Pediu horários à noite/),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Registrar contato" }),
    ).not.toBeInTheDocument();
  });
});

describe("view-only relationship", () => {
  it("keeps the congratulations link but hides 'Marcar como enviado' on the dashboard and month birthdays", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules: ["relationship", "settings"],
        editModules: [],
      }),
    );
    const suggestion = {
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      phone: "11987654321",
      whatsapp: "11911112222",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      detail: "Aniversário hoje",
      dueDate: "2026-10-10",
      priority: 1,
    };
    const entry = {
      patientId: "88888888-8888-4888-8888-888888888888",
      patientName: "Bruno Souza",
      phone: "11955556666",
      birthDate: "1990-02-03",
      date: "2027-02-03",
      day: 3,
      ageTurning: 37,
      referenceKey: "88888888-8888-4888-8888-888888888888:2027",
      congratulated: false,
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/relationship/suggestions")
        ? [suggestion]
        : url.includes("/relationship/birthdays")
          ? [entry]
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/dashboard")
              ? {
                  appointmentsToday: 0,
                  nonCancelledAppointmentsToday: 0,
                  pendingToday: 0,
                  awaitingConfirmationToday: 0,
                  completedToday: 0,
                  patientsActive: 3,
                  noShowsThisMonth: 0,
                  nextAppointments: [],
                }
              : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Aniversariantes" })
    ).closest("section")!;
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    expect(
      within(helena).getByRole("link", { name: /Dar parabéns/ }),
    ).toBeInTheDocument();
    expect(
      within(helena).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    cleanup();

    render(
      <MemoryRouter initialEntries={["/relacionamento"]}>
        <App />
      </MemoryRouter>,
    );
    const tabs = await screen.findByRole("group", { name: "Visão" });
    fireEvent.click(
      within(tabs).getByRole("button", { name: "Aniversários do mês" }),
    );
    const bruno = (await screen.findByText("Bruno Souza")).closest("article")!;
    expect(
      within(bruno).getByRole("link", { name: /Dar parabéns/ }),
    ).toBeInTheDocument();
    expect(
      within(bruno).queryByRole("button", { name: "Marcar como enviado" }),
    ).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });
});

describe("dashboard links by agenda access", () => {
  const dashboard = {
    date: "2026-10-12",
    appointmentsToday: 0,
    nonCancelledAppointmentsToday: 0,
    pendingToday: 0,
    awaitingConfirmationToday: 0,
    completedToday: 0,
    patientsActive: 3,
    noShowsThisMonth: 0,
    nextAppointments: [],
  };
  function renderDashboard(
    modules: string[],
    editModules: string[],
    summary: DashboardViewSummary = dashboard,
  ) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        fullName: "Carla Consulta",
        email: "carla@movimenta.local",
        role: "user",
        modules,
        editModules,
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/dashboard") ? summary : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("shows an empty day without claiming the agenda was completed", async () => {
    renderDashboard(["agenda"], []);
    expect(
      await screen.findByText("Nenhum atendimento hoje"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Não há atendimentos agendados para hoje."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agenda concluída")).not.toBeInTheDocument();
  });

  it("shows a completed agenda when today's appointments have been resolved", async () => {
    renderDashboard(["agenda"], [], {
      ...dashboard,
      appointmentsToday: 1,
      nonCancelledAppointmentsToday: 1,
      pendingToday: 0,
      awaitingConfirmationToday: 0,
      completedToday: 1,
    });
    expect(await screen.findByText("Agenda concluída")).toBeInTheDocument();
    expect(
      screen.getByText("Não há atendimentos pendentes hoje."),
    ).toBeInTheDocument();
  });

  it("keeps an overdue pending appointment visible on today's agenda", async () => {
    renderDashboard(["agenda"], [], {
      ...dashboard,
      appointmentsToday: 1,
      nonCancelledAppointmentsToday: 1,
      pendingToday: 1,
      awaitingConfirmationToday: 1,
      nextAppointments: [
        {
          id: "a1",
          clinicId: "clinic",
          patientId: "patient",
          professionalId: "professional",
          roomId: "room",
          serviceId: "service",
          visitType: "regular",
          patientName: "Bruno Souza",
          serviceName: "Pilates",
          professionalName: "Carla",
          professionalColor: "#26705f",
          roomName: "Sala 1",
          status: "scheduled",
          startsAt: "2000-10-12T13:00:00.000Z",
          endsAt: "2000-10-12T14:00:00.000Z",
          createdAt: "2000-10-01T12:00:00.000Z",
          updatedAt: "2000-10-01T12:00:00.000Z",
        },
      ],
    });
    expect(await screen.findByText("Bruno Souza")).toBeInTheDocument();
    expect(screen.getByText("Agendado")).toBeInTheDocument();
    expect(screen.queryByText("Agenda concluída")).not.toBeInTheDocument();
  });

  it("shows 'Ver agenda' but not 'Novo atendimento' when the agenda is view-only", async () => {
    renderDashboard(["agenda"], []);
    expect(
      await screen.findByRole("heading", { name: "Agenda de hoje" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver agenda/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
  });

  it("shows neither agenda link without the agenda module", async () => {
    renderDashboard(["patients"], ["patients"]);
    expect(
      await screen.findByRole("heading", { name: "Agenda de hoje" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ver agenda/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Novo atendimento/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps both agenda links for users who edit the agenda", async () => {
    renderDashboard(["agenda"], ["agenda"]);
    expect(
      await screen.findByRole("link", { name: /Ver agenda/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Novo atendimento/ }),
    ).toBeInTheDocument();
  });
});

describe("button variants", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const variants = [
    "primary-button",
    "secondary-button",
    "text-button",
    "danger-button",
    "icon-button",
    // Etiqueta verde que insere um código nos editores de mensagem.
    "variable-chip",
  ];

  /** Botões da página (fora da barra lateral e do topo) sem uma das variantes padronizadas. */
  function unstyledButtons(container: HTMLElement) {
    const page = container.querySelector(".page-content")!;
    return [...page.querySelectorAll("button")]
      .filter(
        (button) =>
          !variants.some((variant) => button.classList.contains(variant)),
      )
      .map(
        (button) =>
          button.textContent?.trim() ||
          button.getAttribute("aria-label") ||
          "(sem texto)",
      );
  }

  function mockApi(bodyFor: (url: string) => unknown, role = "owner") {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser({ ...owner, role }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = bodyFor(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => body ?? [],
      } as Response;
    });
  }

  it("uses a button variant on every button of the dashboard", async () => {
    const birthday = {
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      phone: "11987654321",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      detail: "Aniversário hoje",
      dueDate: "2026-10-10",
      priority: 1,
    };
    const appointment = {
      id: "a1",
      patientName: "Bruno Souza",
      serviceName: "Pilates",
      professionalName: "Carla",
      professionalColor: "#26705f",
      startsAt: "2026-10-04T13:00:00.000Z",
      endsAt: "2026-10-04T14:00:00.000Z",
      status: "scheduled",
    };
    mockApi(
      (url) =>
        url.includes("/relationship/suggestions")
          ? [birthday]
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/dashboard")
              ? {
                  appointmentsToday: 1,
                  nonCancelledAppointmentsToday: 1,
                  pendingToday: 1,
                  awaitingConfirmationToday: 1,
                  completedToday: 0,
                  patientsActive: 3,
                  noShowsThisMonth: 0,
                  nextAppointments: [appointment],
                }
              : undefined,
      "reception",
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Aniversariantes" })
    ).closest("section")!;
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    const congratulate = within(helena).getByRole("link", {
      name: /Dar parabéns/,
    });
    expect(congratulate).toHaveClass("whatsapp-button", "button-sm");
    expect(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    ).toHaveClass("secondary-button", "button-sm");
    // Sem a divisória do cartão de plano acima das ações de aniversário.
    expect(congratulate.parentElement).toHaveClass("birthday-actions");
    expect(congratulate.parentElement).not.toHaveClass("plan-actions");
    await screen.findByText("Bruno Souza");
    expect(unstyledButtons(container)).toEqual([]);
  });

  it("uses a button variant on every button of the settings page", async () => {
    const user = {
      id: "33333333-3333-4333-8333-333333333333",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Maria Souza",
      email: "maria@movimenta.local",
      ...legacyAccess("reception"),
      customModules: false,
      active: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const holiday = {
      id: "h1",
      clinicId: "11111111-1111-4111-8111-111111111111",
      name: "Dia da cidade",
      date: "2026-11-20",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi((url) =>
      url.includes("/admin/users")
        ? [user]
        : url.includes("/admin/permission-matrix")
          ? []
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/admin/clinic-settings")
              ? {
                  id: "c1",
                  name: "Studios Aryana",
                  legalName: "",
                  taxId: "",
                  phone: "",
                  email: "",
                  address: "",
                  timezone: "America/Sao_Paulo",
                  updatedAt: "2026-09-01T12:00:00.000Z",
                }
              : url.includes("/holidays")
                ? [holiday]
                : undefined,
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection(
      "Dados da clínica",
      "Prazos e mensagens",
      "Feriados",
    );
    const section = await openSettingsSection("Usuários");
    await within(section).findByText("Maria Souza");
    expect(
      within(section).getByRole("button", { name: "Redefinir senha" }),
    ).toHaveClass("secondary-button", "button-sm");
    expect(
      within(section).getByRole("button", { name: "Desativar" }),
    ).toHaveClass("danger-button", "button-sm");
    await openSettingsSection("Feriados");
    expect(
      await screen.findByRole("button", {
        name: "Excluir feriado Dia da cidade",
      }),
    ).toHaveClass("danger-button", "button-sm");
    // Salvar dos formulários de configuração: tamanho normal, no rodapé alinhado à direita (não estica no grid).
    for (const name of ["Salvar configurações", "Salvar prazos e mensagens"]) {
      await openSettingsSection(
        name === "Salvar configurações"
          ? "Dados da clínica"
          : "Prazos e mensagens",
      );
      const save = await screen.findByRole("button", { name });
      expect(save).toHaveClass("primary-button");
      expect(save.parentElement).toHaveClass("modal-actions");
    }
    expect(unstyledButtons(container)).toEqual([]);
  });

  it("uses a button variant on every button of the plans page", async () => {
    const plan = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi((url) => (url.includes("/plans") ? [plan] : undefined));
    const { container } = render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Renovar" })).toHaveClass(
      "secondary-button",
      "button-sm",
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass(
      "danger-button",
      "button-sm",
    );
    expect(unstyledButtons(container)).toEqual([]);
  });
});

describe("screens without loose elements", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };

  it('groups clinical follow-up actions with a keyboard-accessible "Mais ações" menu', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/patients")
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    const more = await screen.findByRole("button", { name: "Mais ações" });
    // Cabeçalho do prontuário: ação principal visível, o resto no menu.
    const actions = more.closest(".clinical-chart-actions") as HTMLElement;
    for (const name of ["Nova avaliação", "Imprimir", "Exportar"]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Novo modelo" }),
    ).not.toBeInTheDocument();
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Mais ações" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Nova medição",
      "Novo objetivo",
      "Anexar arquivo",
      "Novo alerta clínico",
      "Novo modelo",
      "Encerrar tratamento",
    ]);
    expect(
      within(menu).getByRole("menuitem", { name: "Nova medição" }),
    ).toHaveFocus();
    fireEvent.keyDown(
      within(menu).getByRole("menuitem", { name: "Nova medição" }),
      { key: "ArrowDown" },
    );
    expect(
      within(menu).getByRole("menuitem", { name: "Novo objetivo" }),
    ).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();

    fireEvent.click(more);
    fireEvent.click(screen.getByRole("menuitem", { name: "Novo objetivo" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Novo objetivo terapêutico" }),
    ).toBeInTheDocument();
  });

  it('highlights "Novo lead" when the CRM has no leads', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () => leadBoardResponse(input, []) ?? [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Nenhum lead cadastrado"),
    ).toBeInTheDocument();
    expect(document.querySelector(".kanban-board")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Cadastrar primeiro lead" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Novo lead" }),
    ).toBeInTheDocument();
  });

  it("shows a short hint in empty CRM columns", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    const lead = {
      id: "44444444-4444-4444-8444-444444444444",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Bruna Lead",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      stage: "contacted",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = isLeadBoardUrl(String(input))
        ? leadBoardResponse(String(input), [lead])
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comercial"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (await screen.findByText("Bruna Lead")).closest(
      ".kanban-column",
    ) as HTMLElement;
    expect(card.querySelector(".kanban-empty-hint")).toBeNull();
    expect(
      screen.getByText("Leads recém-cadastrados aparecem aqui."),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".kanban-empty-hint")).toHaveLength(5);
    expect(
      screen.queryByText("Nenhum lead cadastrado"),
    ).not.toBeInTheDocument();
  });

  it('puts "Matricular cliente" in the page header instead of floating between panels', async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = String(input).includes("/groups/workspace?")
        ? {
            groups: [],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    const enroll = await screen.findByRole("button", {
      name: "Matricular cliente",
    });
    expect(enroll.closest(".page-header")).not.toBeNull();
    expect(enroll).toHaveClass("secondary-button");
    expect(container.querySelector(".group-actions-bar")).toBeNull();
    fireEvent.click(enroll);
    const dialog = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Dados da matrícula" }),
    ).toBeInTheDocument();
  });
});

describe("action modals instead of browser dialogs", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const writes = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([, options]) => options?.method && options.method !== "GET",
      );

  /** Responde GETs com `bodyFor(url)` (ou []) e escritas com `writeBody(url)` (ou {}). */
  function mockApi(
    bodyFor: (url: string) => unknown,
    writeBody: (url: string) => unknown = () => ({}),
  ) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(owner));
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const body =
        init?.method && init.method !== "GET" ? writeBody(url) : bodyFor(url);
      return {
        ok: true,
        status: 200,
        json: async () => body ?? [],
      } as Response;
    });
  }

  describe("CRM", () => {
    const leadBase = {
      clinicId: "11111111-1111-4111-8111-111111111111",
      phone: "11987654321",
      source: "Instagram",
      interest: "Pilates",
      tags: [],
      openTasks: 0,
      overdueTasks: 0,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const lead = {
      ...leadBase,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Bruna Lead",
      stage: "contacted",
    };
    const cardOf = async (name: string) =>
      (await screen.findByRole("heading", { name })).closest(
        "article",
      ) as HTMLElement;

    it("asks the loss reason in a modal and sends it with the stage", async () => {
      mockApi(
        (url) =>
          isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : undefined,
        () => ({ ...lead, stage: "lost", lostReason: "Achou caro" }),
      );
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      let card = await cardOf("Bruna Lead");
      fireEvent.change(within(card).getByRole("combobox"), {
        target: { value: "lost" },
      });
      let dialog = await screen.findByRole("dialog", {
        name: "Marcar lead como perdido",
      });
      expect(
        within(dialog).getByText(/Bruna Lead sai das oportunidades abertas/),
      ).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Motivo da perda")).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);
      // Sem confirmar, o lead continua na etapa de antes.
      expect(within(card).getByRole("combobox")).toHaveValue("contacted");

      fireEvent.change(within(card).getByRole("combobox"), {
        target: { value: "lost" },
      });
      dialog = await screen.findByRole("dialog", {
        name: "Marcar lead como perdido",
      });
      fireEvent.change(within(dialog).getByLabelText("Motivo da perda"), {
        target: { value: "   " },
      });
      // Sem motivo, Confirmar fica desativado e diz o que falta (QM14).
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toHaveAccessibleDescription("Falta: Motivo da perda.");
      expect(writes()).toHaveLength(0);
      expect(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      ).toHaveClass("danger-button");
      fireEvent.change(within(dialog).getByLabelText("Motivo da perda"), {
        target: { value: " Achou caro " },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(writes()).toHaveLength(1);
      expect(String(writes()[0]![0])).toContain(`/leads/${lead.id}/stage`);
      expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({
        stage: "lost",
        lostReason: "Achou caro",
      });
      card = await cardOf("Bruna Lead");
      expect(within(card).getByText("Achou caro")).toBeInTheDocument();
    });

    it("confirms the conversion of a lead in a modal that explains the effect", async () => {
      const patient = {
        id: "99999999-9999-4999-8999-999999999999",
        fullName: "Bruna Lead",
      };
      mockApi(
        (url) =>
          isLeadBoardUrl(url) ? leadBoardResponse(url, [lead]) : undefined,
        () => ({
          lead: { ...lead, stage: "won", convertedPatientId: patient.id },
          patient,
          reusedExisting: false,
        }),
      );
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      let dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      expect(
        within(dialog).queryByText(/os dados do lead já vieram preenchidos/),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByText("Bruna Lead · (11) 98765-4321"),
      ).toBeInTheDocument();
      // Mesmo cadastro do "Novo cliente": o nome do lead vem preenchido e recebe o foco.
      expect(within(dialog).getByLabelText("Nome completo")).toHaveFocus();
      expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
        "Bruna Lead",
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(writes()).toHaveLength(0);

      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      expect(
        within(dialog).getByRole("button", { name: "Converter em cliente" }),
      ).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("CPF"), {
        target: { value: "52998224725" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Converter em cliente" }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(writes()).toHaveLength(1);
      expect(String(writes()[0]![0])).toContain(`/leads/${lead.id}/convert`);
      expect(writes()[0]![1]?.method).toBe("POST");
      expect(JSON.parse(String(writes()[0]![1]?.body))).toMatchObject({
        cpf: "52998224725",
        fullName: "Bruna Lead",
        phone: "11987654321",
        emergencyContactName: "",
        address: "",
      });
    });

    it("keeps the modal open with the API error", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(owner));
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (init?.method === "POST")
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: "LEAD_CONFLICT",
              message: "Não foi possível converter este lead.",
            }),
          } as Response;
        return {
          ok: true,
          status: 200,
          json: async () =>
            isLeadBoardUrl(String(input))
              ? leadBoardResponse(String(input), [lead])
              : [],
        } as Response;
      });
      render(
        <MemoryRouter initialEntries={["/comercial"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        within(await cardOf("Bruna Lead")).getByRole("button", {
          name: "Converter",
        }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Converter lead em cliente",
      });
      fireEvent.change(within(dialog).getByLabelText("CPF"), {
        target: { value: "52998224725" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Converter em cliente" }),
      );
      expect(
        await within(dialog).findByText(
          "Não foi possível converter este lead.",
        ),
      ).toHaveClass("form-error");
      expect(
        screen.getByRole("dialog", { name: "Converter lead em cliente" }),
      ).toBeInTheDocument();
    });
  });

  it("cancels a plan after a confirmation that shows the effect on installments and sessions", async () => {
    const plan = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi(
      (url) => (url.includes("/plans") ? [plan] : undefined),
      () => ({ ...plan, status: "cancelled" }),
    );
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    let dialog = await screen.findByRole("dialog", { name: "Cancelar plano" });
    expect(
      within(dialog).getByText("Helena Almeida · Mensalidade Pilates"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /parcelas em aberto deste plano são canceladas no Financeiro e as 2 sessões restantes não poderão mais ser usadas/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    dialog = await screen.findByRole("dialog", { name: "Cancelar plano" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(`/plans/${plan.id}/status`);
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({
      status: "cancelled",
    });
  });

  it("finalizes a clinical record after a confirmation saying it cannot be edited anymore", async () => {
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      recordNumber: 12,
    };
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: patient.id,
      professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "draft",
      version: 1,
      authorName: "Aryana Dutra",
      patientName: "Helena Almeida",
      professionalName: "Dra. Ana Martins",
      professionalCrefito: "CREFITO-3 123456-F",
      appointmentStartsAt: new Date().toISOString(),
      subjective: "Relato",
      objective: "Exame",
      assessment: "Evolução positiva",
      plan: "Manter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // O servidor passa a devolver a evolução finalizada depois da confirmação.
    let current: Record<string, unknown> = record;
    mockApi(
      (url) =>
        url.includes("/clinical-workspace/")
          ? {
              patient,
              records: [current],
              templates: [],
              assessments: [],
              goals: [],
              measurements: [],
              closures: [],
              attachments: [],
              addenda: [],
            }
          : url.includes("/clinical-records")
            ? [record]
            : url.includes("/patients")
              ? [patient]
              : undefined,
      () =>
        (current = {
          ...record,
          status: "finalized",
          finalizedAt: new Date().toISOString(),
        }),
    );
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Finalizar" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Finalizar evolução",
    });
    expect(
      within(dialog).getByText(/não poderá mais ser editada/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/^Helena Almeida · /)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    dialog = await screen.findByRole("dialog", { name: "Finalizar evolução" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(
      `/clinical-records/${record.id}/finalize`,
    );
    expect(writes()[0]![1]?.method).toBe("POST");
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Finalizar" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("cancels a schedule block after a confirmation with the reason and the time", async () => {
    const at = (hours: number) => {
      const value = new Date();
      value.setHours(hours, 0, 0, 0);
      return value;
    };
    const block = {
      id: "abababab-abab-4bab-8bab-abababababab",
      clinicId: "11111111-1111-4111-8111-111111111111",
      professionalId: "33333333-3333-4333-8333-333333333333",
      professionalName: "Dra. Ana Martins",
      startsAt: at(14).toISOString(),
      endsAt: at(16).toISOString(),
      reason: "Curso externo",
      status: "active",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi(
      (url) => (url.includes("/schedule-blocks?") ? [block] : undefined),
      () => ({ ...block, status: "cancelled" }),
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar bloqueio" }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Cancelar bloqueio",
    });
    expect(within(dialog).getByText(/^Curso externo · /)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /das 14:00 às 16:00 \(Dra\. Ana Martins\), volta a ficar livre/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar bloqueio" }));
    dialog = await screen.findByRole("dialog", { name: "Cancelar bloqueio" });
    expect(
      within(dialog).getByRole("button", { name: "Confirmar" }),
    ).toHaveClass("danger-button");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(writes()).toHaveLength(1);
    expect(String(writes()[0]![0])).toContain(
      `/schedule-blocks/${block.id}/cancel`,
    );
    expect(writes()[0]![1]?.method).toBe("POST");
    expect(screen.queryByText("Curso externo")).not.toBeInTheDocument();
  });
});

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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: "Helena" },
      },
    );
    expect(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Adicionar cliente" }),
    ).not.toBeInTheDocument();
    expectOnlyOptions();
  });

  it("opens contracts without the clients and plans modules", async () => {
    renderAs("contracts", "/contratos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    expect(
      await screen.findByRole("button", { name: "Preparar conteúdo" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "Helena" },
    });
    expect(
      await screen.findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Helena Almeida" }));
    expect(
      screen.getByRole("button", { name: "Preparar conteúdo" }),
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
    const dialog = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: "Helena" },
      },
    );
    expect(
      await within(dialog).findByRole("option", { name: "Helena Almeida" }),
    ).toBeInTheDocument();
    expectOnlyOptions();
  });
});

describe("configured patient tags", () => {
  it("offers editing independently from creating and deleting tags", async () => {
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
        permissions: ["settings.view", "settings.tags_update"],
      }),
    );
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            String(input).includes("/patient-tags")
              ? [patientTag("Pilates")]
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
      await screen.findByRole("button", { name: "Editar etiqueta Pilates" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Adicionar etiqueta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir etiqueta Pilates" }),
    ).not.toBeInTheDocument();
  });
  const admin = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }

  it("creates, edits and deletes tags in Settings, warning when the tag is in use", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const tags = [
      patientTag("Pilates", "#276749", 3),
      patientTag("VIP", "#facc15", 0),
    ];
    const writes: Array<{ method: string; url: string; body: unknown }> = [];
    let created = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/patient-tags")) {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        if (method !== "GET") writes.push({ method, url, body });
        if (method === "POST")
          return jsonResponse(
            { ...patientTag(`nova-${++created}`), ...body },
            201,
          );
        if (method === "PATCH") return jsonResponse({ ...tags[0], ...body });
        if (method === "DELETE" && url.endsWith(`/patient-tags/${tags[0]!.id}`))
          return jsonResponse(
            {
              code: "PATIENT_TAG_IN_USE",
              message:
                "A etiqueta Pilates Solo está em uso por 4 clientes. Retire-a desses clientes antes de excluir.",
              details: { patientCount: 4 },
            },
            409,
          );
        if (method === "DELETE")
          return {
            ok: true,
            status: 204,
            json: async () => {
              throw new SyntaxError("Unexpected end of JSON input");
            },
          } as unknown as Response;
        return jsonResponse(tags);
      }
      const body = url.includes("/relationship/settings")
        ? relationshipSettingsFixture()
        : url.includes("/admin/clinic-settings")
          ? null
          : [];
      return jsonResponse(body);
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Etiquetas");
    const list = await within(section).findByRole("list", {
      name: "Etiquetas configuradas",
    });

    // Selos na cor configurada, com texto preto ou branco conforme o contraste.
    const pilates = within(list).getByText("Pilates");
    expect(pilates).toHaveClass("tag-colored");
    expect(pilates.style.getPropertyValue("--tag-color")).toBe("#276749");
    expect(pilates.style.getPropertyValue("--tag-text")).toBe("#ffffff");
    expect(
      within(list).getByText("VIP").style.getPropertyValue("--tag-text"),
    ).toBe("#000000");
    expect(within(list).getByText("3 clientes")).toBeInTheDocument();
    expect(within(list).getByText("0 clientes")).toBeInTheDocument();

    // Criar com uma cor da paleta sugerida.
    fireEvent.change(within(section).getByLabelText("Nome da etiqueta"), {
      target: { value: "Dança" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Cor Roxo" }));
    expect(
      within(section).getByRole("button", { name: "Cor Roxo" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(await within(list).findByText("Dança")).toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "POST",
      body: { name: "Dança", color: "#7c3aed" },
    });
    expect(within(section).getByLabelText("Nome da etiqueta")).toHaveValue("");

    // Criar com o seletor livre de cor.
    fireEvent.change(within(section).getByLabelText("Nome da etiqueta"), {
      target: { value: "Avaliação" },
    });
    fireEvent.change(within(section).getByLabelText("Outra cor"), {
      target: { value: "#123456" },
    });
    expect(
      within(section).getByRole("button", { name: "Cor Roxo" }),
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(await within(list).findByText("Avaliação")).toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "POST",
      body: { name: "Avaliação", color: "#123456" },
    });

    // Nome vazio não chama a API.
    fireEvent.click(
      within(section).getByRole("button", { name: "Adicionar etiqueta" }),
    );
    expect(
      await within(section).findByText("Informe o nome da etiqueta."),
    ).toBeInTheDocument();
    expect(writes).toHaveLength(2);

    // Renomear e trocar a cor.
    fireEvent.click(
      within(list).getByRole("button", { name: "Editar etiqueta Pilates" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Editar etiqueta" });
    fireEvent.change(within(dialog).getByLabelText("Nome da etiqueta"), {
      target: { value: "Pilates Solo" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cor Azul" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar etiqueta" }),
    );
    expect(await within(list).findByText("Pilates Solo")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes.at(-1)).toMatchObject({
      method: "PATCH",
      url: expect.stringContaining(`/patient-tags/${tags[0]!.id}`),
      body: { name: "Pilates Solo", color: "#2563eb" },
    });

    // Excluir etiqueta em uso: o modal avisa e mostra o 409 da API, sem tirar da lista.
    fireEvent.click(
      within(list).getByRole("button", {
        name: "Excluir etiqueta Pilates Solo",
      }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir etiqueta" });
    expect(within(dialog).getByText(/está em 3 clientes/)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Excluir etiqueta" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A etiqueta Pilates Solo está em uso por 4 clientes.",
    );
    expect(within(list).getByText("Pilates Solo")).toBeInTheDocument();
    expect(within(list).getByText("4 clientes")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Excluir etiqueta sem clientes.
    fireEvent.click(
      within(list).getByRole("button", { name: "Excluir etiqueta VIP" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Excluir etiqueta" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Excluir etiqueta" }),
    );
    await vi.waitFor(() =>
      expect(within(list).queryByText("VIP")).not.toBeInTheDocument(),
    );
    expect(writes.at(-1)).toMatchObject({
      method: "DELETE",
      url: expect.stringContaining(`/patient-tags/${tags[1]!.id}`),
    });
  });

  it("shows the tags read-only in Settings for who only views settings", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "33333333-3333-4333-8333-333333333333",
        fullName: "Fábio Financeiro",
        email: "financeiro@movimenta.local",
        role: "finance",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) =>
      jsonResponse(
        String(input).includes("/patient-tags")
          ? [patientTag("Pilates", "#276749", 3)]
          : String(input).includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : [],
      ),
    );
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Etiquetas");
    const list = await within(section).findByRole("list", {
      name: "Etiquetas configuradas",
    });
    expect(within(list).getByText("Pilates")).toHaveClass("tag-colored");
    expect(
      within(section).queryByLabelText("Nome da etiqueta"),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByRole("button", {
        name: /Editar etiqueta|Excluir etiqueta/,
      }),
    ).not.toBeInTheDocument();
  });

  it("colors the client list and filters, and lets the record pick only configured tags", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const patient = {
      cpf: "52998224725",
      id: "99999999-9999-4999-8999-999999999999",
      recordNumber: "PAC-00001",
      fullName: "Helena Almeida",
      phone: "11987654321",
      tags: ["Pilates"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/patient-tags"))
        return jsonResponse([
          patientTag("Pilates", "#276749", 1),
          patientTag("VIP", "#facc15", 0),
        ]);
      if (init?.method === "PUT")
        return jsonResponse({ ...patient, ...JSON.parse(String(init.body)) });
      return jsonResponse([patient]);
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const row = (
      await screen.findByRole("button", {
        name: "Editar Helena Almeida",
      })
    ).closest<HTMLElement>(".patient-row")!;
    const badge = within(row).getByText("Pilates");
    expect(badge).toHaveClass("tag-colored");
    expect(badge.style.getPropertyValue("--tag-color")).toBe("#276749");
    expect(badge.style.getPropertyValue("--tag-text")).toBe("#ffffff");

    // Filtro lista todas as etiquetas configuradas (mesmo sem clientes), com a cor.
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Pilates1", "VIP0", "Pagamento atrasado0"]);
    expect(
      within(filter)
        .getByRole("button", { name: /^VIP/ })
        .style.getPropertyValue("--tag-color"),
    ).toBe("#facc15");

    fireEvent.click(
      within(row).getByRole("button", { name: "Editar Helena Almeida" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByLabelText(/separadas por vírgula/),
    ).not.toBeInTheDocument();
    const choices = within(dialog).getByRole("group", { name: "Etiquetas" });
    expect(within(choices).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(choices).getByRole("button", { name: "Pilates" }),
    ).toHaveAttribute("aria-pressed", "true");
    const vip = within(choices).getByRole("button", { name: "VIP" });
    expect(vip).toHaveAttribute("aria-pressed", "false");
    expect(vip.style.getPropertyValue("--tag-text")).toBe("#000000");
    fireEvent.click(vip);
    fireEvent.click(within(choices).getByRole("button", { name: "Pilates" }));
    expect(vip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const updateCall = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PUT");
    expect(JSON.parse(String(updateCall?.[1]?.body)).tags).toEqual(["VIP"]);
  });

  it("tells there are no configured tags in a new client record", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(/Nenhuma etiqueta configurada/),
    ).toBeInTheDocument();
  });

  it("formats CPF while typing and rejects invalid check digits", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    const cpf = within(dialog).getByLabelText("CPF");

    fireEvent.change(cpf, { target: { value: "52998224724" } });
    expect(cpf).toHaveValue("529.982.247-24");
    expect(cpf).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getAllByText("Informe um CPF válido.").length,
    ).toBeGreaterThan(0);

    fireEvent.change(cpf, { target: { value: "52998224725" } });
    expect(cpf).toHaveValue("529.982.247-25");
    expect(cpf).not.toHaveAttribute("aria-invalid");
  });

  describe("in the appointment details (Agenda › Dados do cliente)", () => {
    const patientId = "99999999-9999-4999-8999-999999999999";
    function mockAgenda(patientTags: string[], tagsResponse: () => Response) {
      const startsAt = new Date();
      startsAt.setHours(10, 0, 0, 0);
      const appointment = {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        patientId,
        patientName: "Helena Almeida",
        professionalColor: "#5c6f68",
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
        serviceName: "Fisioterapia individual",
        professionalName: "Dra. Ana Martins",
        roomName: "Sala Movimento",
        status: "scheduled",
      };
      const patient = {
        id: patientId,
        fullName: "Helena Almeida",
        recordNumber: "PAC-00001",
        phone: "11987654321",
        status: "active",
        tags: patientTags,
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/patient-tags")) return tagsResponse();
        if (url.includes("/relationship/settings"))
          return jsonResponse(relationshipSettingsFixture());
        if (url.includes("/admin/clinic-settings")) return jsonResponse(null);
        if (url.includes("/appointments?")) return jsonResponse([appointment]);
        if (url.includes("/patients")) return jsonResponse([patient]);
        return jsonResponse([]);
      });
    }
    const tagRequests = () =>
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes("/patient-tags"));

    it("shows the client tags as colored badges and links to manage them", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(admin));
      mockAgenda(["Retorno", "Antiga"], () =>
        jsonResponse([patientTag("Retorno", "#2563eb", 1)]),
      );
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      // Cor configurada; etiqueta sem configuração usa a cor padrão.
      await vi.waitFor(() =>
        expect(
          within(dialog)
            .getByText("Retorno")
            .style.getPropertyValue("--tag-color"),
        ).toBe("#2563eb"),
      );
      expect(within(dialog).getByText("Retorno")).toHaveClass("tag-colored");
      expect(
        within(dialog)
          .getByText("Retorno")
          .style.getPropertyValue("--tag-text"),
      ).toBe("#ffffff");
      expect(within(dialog).getByText("Antiga")).toHaveClass("tag-colored");
      expect(
        within(dialog)
          .getByText("Antiga")
          .style.getPropertyValue("--tag-color"),
      ).toBe("#64748b");
      expect(
        within(dialog).queryByText("Retorno, Antiga"),
      ).not.toBeInTheDocument();
      // Quem edita Configurações tem o atalho; a gaveta Etiquetas já abre.
      const manage = within(dialog).getByRole("link", {
        name: "Gerenciar etiquetas",
      });
      expect(manage).toHaveAttribute("href", "/configuracoes?secao=etiquetas");
      fireEvent.click(manage);
      expect(
        await screen.findByRole("list", { name: "Etiquetas configuradas" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Etiquetas" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("uses the default color without an error when the tag colors cannot be loaded", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem(
        "crm.auth.user",
        storedUser({
          id: "33333333-3333-4333-8333-333333333333",
          fullName: "Rita Recepção",
          email: "recepcao@movimenta.local",
          role: "reception",
        }),
      );
      mockAgenda(["VIP"], () =>
        jsonResponse({ code: "FORBIDDEN", message: "Sem permissão." }, 403),
      );
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      await vi.waitFor(() => expect(tagRequests()).toHaveLength(1));
      const vip = within(dialog).getByText("VIP");
      expect(vip).toHaveClass("tag-colored");
      expect(vip.style.getPropertyValue("--tag-color")).toBe("#64748b");
      expect(
        within(dialog).queryByText("Sem permissão."),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("link", { name: "Gerenciar etiquetas" }),
      ).not.toBeInTheDocument();
    });

    it("tells the client has no tags without fetching the tag colors", async () => {
      localStorage.setItem("crm.auth.token", "test-token");
      localStorage.setItem("crm.auth.user", storedUser(admin));
      mockAgenda([], () => jsonResponse([]));
      render(
        <MemoryRouter initialEntries={["/agenda"]}>
          <App />
        </MemoryRouter>,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Detalhes de Helena Almeida",
        }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Detalhes do atendimento",
      });
      expect(within(dialog).getByText("Sem etiquetas")).toBeInTheDocument();
      expect(tagRequests()).toHaveLength(0);
    });
  });
});

describe("guided client registration", () => {
  const admin = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const pilatesId = "77777777-7777-4777-8777-777777777777";
  const physioId = "78787878-7878-4878-8878-787878787878";
  const professionalId = "33333333-3333-4333-8333-333333333333";
  const roomId = "55555555-5555-4555-8555-555555555555";
  const created = {
    id: "99999999-9999-4999-8999-999999999999",
    clinicId: "11111111-1111-4111-8111-111111111111",
    recordNumber: "PAC-00042",
    fullName: "Marina Costa",
    phone: "11987654321",
    tags: [],
    status: "active",
    createdAt: "2026-10-04T12:00:00.000Z",
    updatedAt: "2026-10-04T12:00:00.000Z",
  };
  const pilatesTemplate = {
    id: "b1111111-1111-4111-8111-111111111111",
    name: "Pilates 2x semana",
    kind: "fixed_package",
    active: true,
    totalValueInCents: 48000,
    services: [
      { serviceId: pilatesId, totalSessions: 8, totalValueInCents: 48000 },
    ],
  };
  const physioTemplate = {
    ...pilatesTemplate,
    id: "b2222222-2222-4222-8222-222222222222",
    name: "Fisioterapia",
    services: [
      { serviceId: physioId, totalSessions: 8, totalValueInCents: 48000 },
    ],
  };
  const singleTemplate = {
    ...pilatesTemplate,
    id: "b3333333-3333-4333-8333-333333333333",
    name: "Serviço avulso",
    kind: "single",
    totalValueInCents: 9000,
    services: [
      { serviceId: pilatesId, totalSessions: 1, totalValueInCents: 9000 },
    ],
  };
  function group(
    id: string,
    name: string,
    serviceId: string,
    extra: Record<string, unknown> = {},
  ) {
    return {
      id,
      clinicId: created.clinicId,
      name,
      sequence: 1,
      serviceId,
      serviceName: "Pilates",
      professionalId,
      professionalName: "Dra. Ana Martins",
      roomId,
      roomName: "Sala Movimento",
      capacity: 4,
      activeEnrollments: 1,
      waitlistCount: 0,
      active: true,
      weeklySlots: [{ weekday: 1, startTime: "08:00", durationMinutes: 60 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      ...extra,
    };
  }
  const groups = [
    group("a1111111-1111-4111-8111-111111111111", "Pilates 1", pilatesId),
    group("a2222222-2222-4222-8222-222222222222", "Pilates 2", pilatesId, {
      professionalName: "Prof. Bruno Lima",
      activeEnrollments: 4,
    }),
    group("a3333333-3333-4333-8333-333333333333", "Fisioterapia 1", physioId),
    group("a4444444-4444-4444-8444-444444444444", "Pilates antiga", pilatesId, {
      active: false,
    }),
  ];
  function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
  }
  /** Cadastros simples e guiados, com os planos do catálogo vigente. */
  function mockApi(guided: (body: Record<string, unknown>) => Response) {
    const posts: Array<Record<string, unknown>> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/patients/guided")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(body);
        return guided(body);
      }
      if (init?.method === "POST" && url.endsWith("/patients")) {
        posts.push({ patient: JSON.parse(String(init.body)) });
        return jsonResponse(created, 201);
      }
      if (url.includes("/plan-templates"))
        return jsonResponse([pilatesTemplate, physioTemplate, singleTemplate]);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      if (url.includes("/professionals"))
        return jsonResponse([
          {
            id: professionalId,
            fullName: "Dra. Ana Martins",
            color: "#5c6f68",
          },
        ]);
      if (url.includes("/rooms"))
        return jsonResponse([
          { id: roomId, name: "Sala Movimento", capacity: 6 },
        ]);
      if (url.includes("/services"))
        return jsonResponse([
          { id: pilatesId, name: "Pilates", priceInCents: 9000 },
          { id: physioId, name: "Fisioterapia", priceInCents: 12000 },
        ]);
      if (url.includes("/groups/workspace?"))
        return jsonResponse({
          groups,
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        });
      return jsonResponse([]);
    });
    return posts;
  }
  function renderAs(user: string) {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", user);
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
  }
  async function openNewClient() {
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Marina Costa" },
    });
    fireEvent.change(within(dialog).getByLabelText("CPF"), {
      target: { value: "52998224725" },
    });
    fireEvent.change(within(dialog).getAllByLabelText("Telefone")[0]!, {
      target: { value: "11987654321" },
    });
    return dialog;
  }
  function customUser(editModules: AppModule[]) {
    return JSON.stringify({
      id: "55555555-5555-4555-8555-555555555555",
      fullName: "Carla Personalizada",
      email: "carla@movimenta.local",
      role: "user",
      modules: ["patients", "agenda", "plans", "groups"],
      editModules,
    });
  }

  it("asks what the client will do and only registers when chosen 'Só cadastrar por enquanto'", async () => {
    const posts = mockApi(() => jsonResponse({ patient: created }, 201));
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    const question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual([
      "Aula experimental",
      "Assinar um plano",
      "Serviço avulso",
      "Só cadastrar por enquanto",
    ]);
    expect(
      within(question).getByRole("radio", {
        name: "Só cadastrar por enquanto",
      }),
    ).toBeChecked();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    );
    expect(
      await screen.findByRole("button", { name: "Editar Marina Costa" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Novo cliente" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      patient: { fullName: "Marina Costa", phone: "11987654321" },
    });
    expect(posts[0]).not.toHaveProperty("next");
    expect(posts[0]).not.toHaveProperty("appointment");
    expect(posts[0]).not.toHaveProperty("plan");
  });

  it("books a demonstration class with service, professional, room and time", async () => {
    const posts = mockApi((body) => {
      const appointment = body.appointment as Record<string, unknown>;
      return jsonResponse(
        {
          patient: created,
          appointment: {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            patientId: created.id,
            patientName: created.fullName,
            ...appointment,
            visitType: "trial",
            endsAt: appointment.startsAt,
            status: "scheduled",
            serviceName: "Pilates",
            professionalName: "Dra. Ana Martins",
            roomName: "Sala Movimento",
            professionalColor: "#5c6f68",
          },
        },
        201,
      );
    });
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
    );
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue(pilatesId);
    fireEvent.change(service, { target: { value: physioId } });
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue(
      professionalId,
    );
    expect(within(dialog).getByLabelText("Sala")).toHaveValue(roomId);
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar aula experimental",
      }),
    );
    expect(
      await screen.findByText(/Aula experimental agendada para/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
    expect(posts[0]).toEqual({
      next: "demonstration",
      patient: expect.objectContaining({ fullName: "Marina Costa" }),
      appointment: {
        serviceId: physioId,
        professionalId,
        roomId,
        startsAt: new Date("2026-10-06T09:00").toISOString(),
        notes: "",
      },
    });
  });

  it("keeps the form filled and shows the API error when the guided registration fails", async () => {
    let fail = true;
    const posts = mockApi(() =>
      fail
        ? jsonResponse(
            {
              code: "APPOINTMENT_CONFLICT",
              message: "Profissional já tem atendimento neste horário.",
            },
            409,
          )
        : jsonResponse({ patient: created }, 201),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
    );
    await within(dialog).findByLabelText("Serviço");
    fireEvent.change(within(dialog).getByLabelText("Data e horário"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar aula experimental",
      }),
    );
    expect(
      await within(dialog).findByText(
        "Profissional já tem atendimento neste horário.",
      ),
    ).toHaveClass("form-error");
    expect(within(dialog).getByLabelText("Nome completo")).toHaveValue(
      "Marina Costa",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Aula experimental" }),
    ).toBeChecked();
    expect(within(dialog).getByLabelText("Data e horário")).toHaveValue(
      "2026-10-06T09:00",
    );
    expect(
      screen.queryByRole("button", { name: "Editar Marina Costa" }),
    ).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e agendar aula experimental",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Editar Marina Costa" }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(2);
  });

  it("subscribes a plan with an optional class of the same service and warns about the waiting list", async () => {
    const posts = mockApi((body) =>
      jsonResponse(
        {
          patient: created,
          plan: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            patientId: created.id,
            patientName: created.fullName,
            serviceName: "Pilates",
            ...(body.plan as object),
            status: "active",
            remainingSessions: 8,
          },
          enrollment: body.groupId
            ? {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                clinicId: created.clinicId,
                groupId: body.groupId,
                patientId: created.id,
                patientName: created.fullName,
                status: "waitlisted",
                queuePosition: 2,
                enrolledAt: "2026-10-04T12:00:00.000Z",
                updatedAt: "2026-10-04T12:00:00.000Z",
              }
            : undefined,
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    const catalog = await within(dialog).findByLabelText("Plano cadastrado");
    expect(catalog).toHaveValue("");
    fireEvent.change(catalog, { target: { value: pilatesTemplate.id } });
    const model = within(dialog).getByLabelText("Modelo");
    expect(
      within(model)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual(["Pacote fixo", "Recorrente"]);
    expect(
      within(dialog).getByText(
        "A turma pode ser escolhida depois com o responsável.",
      ),
    ).toBeInTheDocument();
    const turma = await within(dialog).findByLabelText("Turma (opcional)");
    expect(turma).toHaveValue("");
    // Só turmas ativas do serviço do plano, com o responsável e as vagas.
    expect(
      within(turma)
        .getAllByRole("option")
        .map((item) => item.textContent),
    ).toEqual([
      "Escolher depois",
      expect.stringMatching(/^Pilates 1 — .* · Dra\. Ana Martins · 3 vagas$/),
      expect.stringMatching(
        /^Pilates 2 — .* · Prof\. Bruno Lima · turma cheia \(lista de espera\)$/,
      ),
    ]);
    fireEvent.change(turma, { target: { value: groups[1]!.id } });
    fireEvent.change(within(dialog).getByLabelText("Sessões do serviço 1"), {
      target: { value: "8" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor do serviço 1"), {
      target: { value: "480" },
    });
    // Trocar o plano limpa a turma escolhida (ela é de outro serviço).
    fireEvent.change(catalog, { target: { value: physioTemplate.id } });
    expect(within(dialog).getByLabelText("Turma (opcional)")).toHaveValue("");
    expect(
      within(within(dialog).getByLabelText("Turma (opcional)")).getAllByRole(
        "option",
      ),
    ).toHaveLength(2);
    fireEvent.change(catalog, { target: { value: pilatesTemplate.id } });
    fireEvent.change(within(dialog).getByLabelText("Turma (opcional)"), {
      target: { value: groups[1]!.id },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar e criar plano" }),
    );
    expect(
      await screen.findByText(
        /A turma Pilates 2 está cheia: o cliente entrou na lista de espera \(posição 2\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Cliente cadastrado" }),
    ).not.toBeInTheDocument();
    expect(posts[0]).toMatchObject({
      next: "plan",
      groupId: groups[1]!.id,
      plan: {
        planTemplateId: pilatesTemplate.id,
        kind: "fixed_package",
        name: "Pilates 2x semana",
        services: [
          { serviceId: pilatesId, totalSessions: 8, totalValueInCents: 48000 },
        ],
        totalValueInCents: 48000,
      },
    });
  });

  it("sells a single service without model nor class", async () => {
    const posts = mockApi((body) =>
      jsonResponse(
        {
          patient: created,
          plan: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            patientId: created.id,
            patientName: created.fullName,
            serviceName: "Pilates",
            ...(body.plan as object),
            kind: "single",
            status: "active",
            remainingSessions: 1,
          },
        },
        201,
      ),
    );
    renderAs(storedUser(admin));
    const dialog = await openNewClient();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Serviço avulso" }),
    );
    const catalog = await within(dialog).findByLabelText("Plano cadastrado");
    fireEvent.change(catalog, { target: { value: singleTemplate.id } });
    expect(within(dialog).queryByLabelText("Modelo")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Turma (opcional)"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Salvar e criar serviço avulso",
      }),
    );
    expect(
      await screen.findByText(/Serviço avulso .* criado/),
    ).toBeInTheDocument();
    expect(posts[0]).toMatchObject({
      next: "single",
      plan: {
        planTemplateId: singleTemplate.id,
        services: [
          { serviceId: pilatesId, totalSessions: 1, totalValueInCents: 9000 },
        ],
      },
    });
    expect(posts[0]!.plan).not.toHaveProperty("kind");
    expect(posts[0]).not.toHaveProperty("groupId");
  });

  it("hides the options the user cannot edit", async () => {
    mockApi(() => jsonResponse({ patient: created }, 201));
    renderAs(customUser(["patients"]));
    let dialog = await openNewClient();
    expect(
      within(dialog).queryByRole("group", {
        name: "O que o cliente vai fazer?",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Salvar cliente" }),
    ).toBeInTheDocument();
    cleanup();

    renderAs(customUser(["patients", "agenda"]));
    dialog = await openNewClient();
    let question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual(["Aula experimental", "Só cadastrar por enquanto"]);
    cleanup();

    // Edita Planos mas não Turmas: plano sem o campo de turma (e sem buscar as turmas).
    renderAs(customUser(["patients", "plans"]));
    dialog = await openNewClient();
    question = within(dialog).getByRole("group", {
      name: "O que o cliente vai fazer?",
    });
    expect(
      within(question)
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent),
    ).toEqual([
      "Assinar um plano",
      "Serviço avulso",
      "Só cadastrar por enquanto",
    ]);
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Assinar um plano" }),
    );
    await within(dialog).findByLabelText("Plano cadastrado");
    expect(
      within(dialog).queryByLabelText("Turma (opcional)"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A turma pode ser escolhida depois com o responsável.",
      ),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/groups/workspace")),
    ).toBe(false);
  });

  it("filters subscribers without a class and links each one to the enrollment", async () => {
    const subscriber = { ...created, fullName: "Helena Almeida" };
    const other = {
      ...created,
      id: "98989898-9898-4898-8898-989898989898",
      fullName: "Bruno Souza",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      if (url.includes("/groups/workspace?"))
        return jsonResponse({
          groups,
          enrollments: [],
          sessions: [],
          attendance: [],
          replacementCredits: [],
        });
      if (url.includes("/patients/options"))
        return jsonResponse([
          { id: subscriber.id, fullName: subscriber.fullName, tags: [] },
          { id: other.id, fullName: other.fullName, tags: [] },
        ]);
      if (url.includes("/patients?"))
        return jsonResponse(
          url.includes("withoutGroup=true")
            ? [subscriber]
            : [other, subscriber],
        );
      return jsonResponse([]);
    });
    renderAs(storedUser(admin));
    await screen.findByRole("button", { name: "Editar Bruno Souza" });
    expect(screen.queryByText("Sem turma")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Assinantes sem turma vinculada" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Bruno Souza" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url]) =>
            String(url).includes("/patients?") &&
            String(url).includes("withoutGroup=true"),
        ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveTextContent(
      "1",
    );
    const row = screen
      .getByRole("button", { name: "Editar Helena Almeida" })
      .closest<HTMLElement>(".patient-row")!;
    expect(within(row).getByText("Sem turma")).toHaveClass("status-pill");
    const link = within(row).getByRole("link", {
      name: "Matricular Helena Almeida em uma turma",
    });
    expect(link).toHaveAttribute("href", `/turmas?matricular=${subscriber.id}`);
    fireEvent.click(link);
    const drawer = await screen.findByRole("dialog", {
      name: "Nova matrícula",
    });
    await waitFor(() =>
      expect(
        within(drawer).getByRole("combobox", { name: "Cliente" }),
      ).toHaveValue(subscriber.fullName),
    );
  });

  it("clears the subscribers filter reloading the full list", async () => {
    const subscriber = { ...created, fullName: "Helena Almeida" };
    const other = {
      ...created,
      id: "98989898-9898-4898-8898-989898989898",
      fullName: "Bruno Souza",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags")) return jsonResponse([]);
      return jsonResponse(
        url.includes("withoutGroup=true") ? [subscriber] : [other, subscriber],
      );
    });
    renderAs(customUser(["patients"]));
    await screen.findByRole("button", { name: "Editar Bruno Souza" });
    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Assinantes sem turma vinculada" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Bruno Souza" }),
      ).not.toBeInTheDocument(),
    );
    // Sem editar Turmas: o selo aparece, mas sem o atalho para matricular.
    const row = screen
      .getByRole("button", { name: "Editar Helena Almeida" })
      .closest<HTMLElement>(".patient-row")!;
    expect(within(row).getByText("Sem turma")).toBeInTheDocument();
    expect(
      within(row).queryByRole("link", { name: /Matricular/ }),
    ).not.toBeInTheDocument();
    expect(row).toHaveAccessibleName("Abrir ficha de Helena Almeida");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Limpar filtros" })[0]!,
    );
    expect(
      await screen.findByRole("button", { name: "Editar Bruno Souza" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sem turma")).not.toBeInTheDocument();
  });
});

describe("history page", () => {
  beforeEach(() => {
    vi.spyOn(api, "auditHistory").mockReset();
    vi.spyOn(api, "historyActors").mockResolvedValue([]);
  });
  const event = {
    id: "event-1",
    action: "clinic.updated",
    entityType: "clinic",
    metadata: {},
    createdAt: "2026-10-07T12:00:00.000Z",
    actorName: "Maria Souza",
  };
  function session(role: "admin" | "user" = "user", allowed = true) {
    const user = withPermissions({
      id: "history-reader",
      fullName: "History Reader",
      email: "history@test.local",
      role,
      modules: allowed ? ["history"] : ["settings"],
      editModules: [],
      permissions:
        role === "admin"
          ? legacyPermissions("admin")
          : allowed
            ? ["history.view" as const]
            : ["settings.view" as const],
    });
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", JSON.stringify(user));
    return user;
  }
  function open() {
    return render(
      <MemoryRouter initialEntries={["/historico"]}>
        <App />
      </MemoryRouter>,
    );
  }
  it("shows loading and the independent history menu, then the empty state", async () => {
    session();
    let resolve!: (value: import("@crm/contracts").AdminAuditPage) => void;
    vi.spyOn(api, "auditHistory").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    open();
    expect(
      await screen.findByRole("heading", { name: "Histórico" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Histórico" })).toHaveAttribute(
      "href",
      "/historico",
    );
    expect(
      screen.queryByRole("link", { name: "Configurações" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Atividades do sistema" }),
    ).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    resolve({ items: [], nextCursor: null });
    expect(
      await screen.findByText(
        "Nenhum registro encontrado. Tente alterar a pesquisa ou os filtros.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });
  it("allows administrators and displays the responsible person, time and system fallback", async () => {
    session("admin");
    const systemEvent = {
      id: "event-2",
      action: "user.updated",
      entityType: "user",
      metadata: {},
      createdAt: event.createdAt,
    };
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [event, systemEvent],
      nextCursor: null,
    });
    const { container } = open();
    expect(
      await screen.findByRole("heading", {
        name: "Dados da clínica atualizados",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Maria Souza ·/)).toBeInTheDocument();
    expect(screen.getByText(/Sistema ·/)).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      event.createdAt,
    );
  });
  it("retries a failed first load", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockRejectedValueOnce(new Error("Falha ao carregar"))
      .mockResolvedValueOnce({ items: [event], nextCursor: null });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao carregar",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", {
        name: "Dados da clínica atualizados",
      }),
    ).toBeInTheDocument();
    expect(history).toHaveBeenNthCalledWith(2, undefined, {});
  });
  it("keeps loaded events when the next page fails and retries the same cursor", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id })
      .mockRejectedValueOnce(new Error("Falha na próxima página"))
      .mockResolvedValueOnce({
        items: [{ ...event, id: "event-2", action: "user.created" }],
        nextCursor: null,
      });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha na próxima página",
    );
    expect(
      screen.getByRole("heading", { name: "Dados da clínica atualizados" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", { name: "Usuário cadastrado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
    expect(history).toHaveBeenNthCalledWith(2, event.id, {});
    expect(history).toHaveBeenNthCalledWith(3, event.id, {});
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });
  it("hides history and redirects direct access without its permission", async () => {
    session("user", false);
    const history = vi.spyOn(api, "auditHistory");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    open();
    expect(
      await screen.findByRole("link", { name: "Configurações" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Histórico" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "Histórico" }),
    ).not.toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
  });
  it("removes the page and menu after a permission revocation is refreshed", async () => {
    let fresh = session();
    vi.spyOn(api, "me").mockImplementation(async () => fresh);
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [event],
      nextCursor: null,
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    fresh = { ...fresh, modules: [], permissions: [] };
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Histórico" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
  });
  it("opens the readable summary and preserves all technical values in the details tab", async () => {
    session();
    const detailed = {
      ...event,
      clinicId: "clinic-1",
      actorUserId: "user-1",
      entityId: "record-1",
      ipAddress: "192.0.2.1",
      metadata: {
        untouchedKey: { nested: [false, null, 0, "<script>example</script>"] },
        longValue: "long".repeat(80),
      },
    };
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [detailed],
      nextCursor: null,
    });
    open();
    const trigger = await screen.findByRole("button", { name: "Ver detalhes" });
    expect(screen.queryByText(event.action)).not.toBeInTheDocument();
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Detalhes da alteração",
    });
    const summaryTab = within(dialog).getByRole("tab", { name: "Resumo" });
    expect(summaryTab).toHaveFocus();
    expect(summaryTab).toHaveAttribute("aria-selected", "true");
    const summaryPanel = within(dialog).getByRole("tabpanel", {
      name: "Resumo",
    });
    expect(
      within(summaryPanel).getByText("Dados da clínica atualizados"),
    ).toBeInTheDocument();
    expect(
      within(summaryPanel).queryByText(event.action),
    ).not.toBeInTheDocument();
    const technicalTab = within(dialog).getByRole("tab", {
      name: "Detalhes técnicos",
    });
    fireEvent.click(technicalTab);
    const technicalPanel = within(dialog).getByRole("tabpanel", {
      name: "Detalhes técnicos",
    });
    for (const value of [
      event.id,
      event.action,
      event.entityType,
      "record-1",
      "clinic-1",
      "user-1",
      event.actorName,
      event.createdAt,
      "192.0.2.1",
    ])
      expect(within(technicalPanel).getByText(value)).toBeInTheDocument();
    expect(technicalPanel.querySelector("pre")!.textContent).toBe(
      JSON.stringify(detailed.metadata, null, 2),
    );
    expect(technicalPanel.querySelector("script")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("supports keyboard tabs, Escape and focus restoration without technical data inventing", async () => {
    session();
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [
        {
          ...event,
          action: "future.action",
          entityType: "user",
          actorName: "",
          actorUserId: "removed-user",
        },
      ],
      nextCursor: null,
    });
    open();
    expect(
      await screen.findByRole("heading", { name: "Alteração registrada" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Usuário não identificado/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Ver detalhes" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const summary = within(dialog).getByRole("tab", { name: "Resumo" });
    const technical = within(dialog).getByRole("tab", {
      name: "Detalhes técnicos",
    });
    fireEvent.keyDown(summary, { key: "ArrowRight" });
    expect(technical).toHaveFocus();
    expect(technical).toHaveAttribute("aria-selected", "true");
    expect(
      within(dialog).getByRole("tabpanel", { name: "Detalhes técnicos" }),
    ).toHaveTextContent("Não registrado");
    fireEvent.keyDown(technical, { key: "Home" });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "ArrowLeft" });
    expect(technical).toHaveFocus();
    fireEvent.keyDown(technical, { key: "ArrowRight" });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(summary, { key: "End" });
    expect(technical).toHaveFocus();
    fireEvent.keyDown(technical, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("applies search and combined filters on submit and resets the page", async () => {
    session();
    const actor = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Aryana Dutra",
    };
    vi.spyOn(api, "historyActors").mockResolvedValue([actor]);
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValue({ items: [event], nextCursor: event.id });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    await screen.findByRole("option", { name: actor.name });
    fireEvent.change(screen.getByLabelText("Pesquisar"), {
      target: { value: "pagamento" },
    });
    fireEvent.change(screen.getByLabelText("Área"), {
      target: { value: "finance" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de atividade"), {
      target: { value: "financial.payment" },
    });
    fireEvent.change(screen.getByLabelText("Responsável"), {
      target: { value: actor.id },
    });
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Até"), {
      target: { value: "2026-10-08" },
    });
    expect(history).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Pesquisar e filtrar" }),
    );
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    const filters = {
      search: "pagamento",
      module: "finance",
      action: "financial.payment",
      actorUserId: actor.id,
      from: "2026-10-01",
      to: "2026-10-08",
    };
    expect(history).toHaveBeenLastCalledWith(undefined, filters);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Próxima" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(event.id, filters),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(undefined, {}),
    );
    expect(screen.getByLabelText("Pesquisar")).toHaveValue("");
    expect(screen.getByLabelText("Área")).toHaveValue("");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Página 1"),
    );
  });
  it("keeps only the current page and retrieves the previous page again", async () => {
    session();
    const history = vi
      .spyOn(api, "auditHistory")
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id })
      .mockResolvedValueOnce({
        items: [{ ...event, id: "second", action: "user.created" }],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [event], nextCursor: event.id });
    open();
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByRole("heading", { name: "Usuário cadastrado" });
    expect(
      screen.queryByRole("heading", { name: "Dados da clínica atualizados" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Página 2");
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByRole("heading", {
      name: "Dados da clínica atualizados",
    });
    expect(
      screen.queryByRole("heading", { name: "Usuário cadastrado" }),
    ).not.toBeInTheDocument();
    expect(history).toHaveBeenLastCalledWith(undefined, {});
  });
  it("does not offer clinical technical details without the required permissions", async () => {
    session();
    vi.spyOn(api, "auditHistory").mockResolvedValue({
      items: [
        {
          ...event,
          action: "clinical.access.read",
          module: "clinical",
          detailsRestricted: true,
          metadata: {},
        },
      ],
      nextCursor: null,
    });
    open();
    expect(
      await screen.findByRole("heading", { name: "Prontuário consultado" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ver detalhes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Detalhes disponíveis para quem tem acesso aos Prontuários.",
      ),
    ).toBeInTheDocument();
  });
});

vi.mock("./features/contracts/document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nTest contract"], { type: "application/pdf" }),
}));
