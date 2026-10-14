import { saoPauloToday } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
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
      expect(
        screen.queryByRole("button", { name: "Exportar" }),
      ).not.toBeInTheDocument();
    },
  );

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
      expect(value).toHaveValue(250);
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
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      expect(
        within(dialog).getByText(
          "Informe o novo valor em reais (zero ou mais).",
        ),
      ).toHaveClass("form-error");
      fireEvent.change(within(dialog).getByLabelText("Novo valor (R$)"), {
        target: { value: "199.9" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      expect(
        within(dialog).getByText(
          "Escreva a justificativa do ajuste (pelo menos 5 caracteres).",
        ),
      ).toBeInTheDocument();
      expect(writes()).toHaveLength(0);
      fireEvent.change(within(dialog).getByLabelText("Justificativa"), {
        target: { value: "  Desconto combinado " },
      });
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
      ).toHaveValue(250);
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
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      expect(
        within(dialog).getByText("Informe de 1 a 36 parcelas."),
      ).toHaveClass("form-error");
      fireEvent.change(within(dialog).getByLabelText("Número de parcelas"), {
        target: { value: "3" },
      });
      fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
        target: { value: "2026-11-10" },
      });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Confirmar" }),
      );
      expect(
        within(dialog).getByText(
          "Escreva o motivo da renegociação (pelo menos 5 caracteres).",
        ),
      ).toBeInTheDocument();
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
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      expect(
        within(dialog).getByText(
          "Informe um nome com pelo menos 2 caracteres.",
        ),
      ).toHaveClass("form-error");
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
      fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
      expect(
        within(dialog).getByText(
          "Informe um nome com pelo menos 2 caracteres.",
        ),
      ).toBeInTheDocument();
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
        target: { value: "120" },
      });
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
      within(table).getByRole("columnheader", { name: "Confirmado" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Projetado" }),
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

    // Frase explicativa e legenda do que é Confirmado e Projetado.
    expect(
      within(section).getByText(
        /Quanto deve entrar e sair do caixa nos próximos meses/,
      ),
    ).toBeInTheDocument();
    const legend = section.querySelector(".forecast-legend")!;
    expect(
      [...legend.querySelectorAll("dt")].map((dt) => dt.textContent),
    ).toEqual(["Confirmado", "Projetado"]);
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
