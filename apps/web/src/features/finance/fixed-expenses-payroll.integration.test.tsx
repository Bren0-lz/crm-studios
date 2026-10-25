import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const clinicId = "11111111-1111-4111-8111-111111111111";
const category = {
  id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1",
  clinicId,
  name: "Utilidades",
  kind: "expense",
  active: true,
};
const center = {
  id: "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1",
  clinicId,
  name: "Administrativo",
  active: true,
};

function login() {
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
}

function workspace(payables: unknown[] = []) {
  return {
    summary: {
      openInCents: 0,
      overdueInCents: 0,
      paidThisMonthInCents: 0,
      receivables: [],
    },
    categories: [category],
    costCenters: [center],
    payables,
    payableOpenInCents: 0,
    payableOverdueInCents: 0,
    paidExpensesThisMonthInCents: 0,
    cashBalanceThisMonthInCents: 0,
    commissionRules: [],
    commissions: [],
    commissionOpenInCents: 0,
    paidCommissionsThisMonthInCents: 0,
  };
}

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function renderFinance(entry = "/financeiro") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("despesas fixas de valor variável", () => {
  it("cadastra com valor variável e aviso, mostra o aviso e informa o valor do mês", async () => {
    login();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 12:00 em São Paulo, 25/10/2026: vence dia 28, aviso de 5 dias já vale.
    vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
    const month = "2026-10";
    const dueDay = 28;
    const model = {
      id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
      clinicId,
      description: "Conta de luz",
      categoryId: category.id,
      costCenterId: center.id,
      categoryName: category.name,
      costCenterName: center.name,
      amountInCents: 30000,
      variableAmount: true,
      reminderDaysBefore: 5,
      dayOfMonth: dueDay,
      startMonth: "2026-01",
      active: true,
      lastCompetence: month,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    let payable: Record<string, unknown> = {
      id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
      clinicId,
      description: "Conta de luz",
      categoryId: category.id,
      costCenterId: center.id,
      categoryName: category.name,
      costCenterName: center.name,
      dueDate: `${month}-${String(dueDay).padStart(2, "0")}`,
      amountInCents: 30000,
      status: "open",
      overdue: false,
      recurringPayableId: model.id,
      competence: month,
      amountEstimated: true,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const requests: { method: string; url: string; body: unknown }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET")
        requests.push({ method, url, body: JSON.parse(String(init!.body)) });
      if (url.includes("/finance/payables/") && method === "PUT") {
        const { amountInCents } = JSON.parse(String(init!.body)) as {
          amountInCents: number;
        };
        payable = { ...payable, amountInCents };
        delete payable.amountEstimated;
        return json(payable);
      }
      if (url.includes("/finance/recurring-payables") && method === "POST")
        return json(
          { ...model, id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2" },
          201,
        );
      if (url.includes("/finance/recurring-payables")) return json([model]);
      if (url.includes("/finance/workspace")) return json(workspace([payable]));
      return json([]);
    });
    renderFinance("/financeiro?aba=contas-a-pagar");
    const section = (
      await screen.findByRole("heading", { name: "Despesas fixas" })
    ).closest("section")!;
    // Aviso de vencimento com o valor ainda estimado.
    const reminders = await within(section).findByLabelText(
      "Avisos de vencimento",
    );
    expect(within(reminders).getByText("Conta de luz")).toBeInTheDocument();
    expect(
      within(reminders).getByText(
        /Vence em 3 dias · 28\/10\/2026 .*\(estimado\)/,
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/Valor variável \(estimado\)/),
    ).toBeInTheDocument();
    expect(within(section).getByText("Aviso 5 dias antes")).toBeInTheDocument();

    fireEvent.click(
      within(reminders).getByRole("button", {
        name: "Informar valor de Conta de luz",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Informar valor do mês",
    });
    fireEvent.change(within(dialog).getByLabelText("Valor do mês"), {
      target: { value: "274,50" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar valor" }),
    );
    expect(
      await screen.findByText("Valor do mês informado."),
    ).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({
      method: "PUT",
      url: expect.stringContaining(
        `/finance/payables/${String(payable.id)}/amount`,
      ),
      body: { amountInCents: 27450 },
    });

    // Nova despesa variável com aviso: envia os dois campos.
    fireEvent.click(
      within(section).getByRole("button", { name: "Nova despesa fixa" }),
    );
    const create = await screen.findByRole("dialog", {
      name: "Nova despesa fixa",
    });
    fireEvent.change(within(create).getByLabelText("Descrição"), {
      target: { value: "Conta de água" },
    });
    fireEvent.click(
      within(create).getByLabelText("Valor variável a cada mês (água, luz)"),
    );
    fireEvent.change(within(create).getByLabelText("Valor estimado"), {
      target: { value: "90" },
    });
    fireEvent.click(
      within(create).getByLabelText("Avisar antes do vencimento"),
    );
    fireEvent.change(within(create).getByLabelText("Dias de antecedência"), {
      target: { value: "5" },
    });
    fireEvent.click(
      within(create).getByRole("button", { name: "Cadastrar despesa fixa" }),
    );
    expect(await screen.findByText("Despesa fixa criada.")).toBeInTheDocument();
    expect(requests.at(-1)).toMatchObject({
      method: "POST",
      body: {
        description: "Conta de água",
        amountInCents: 9000,
        variableAmount: true,
        reminderDaysBefore: 5,
        active: true,
      },
    });
  });
});

describe("folha de pagamento", () => {
  it("mostra salário fixo + comissões e cadastra colaborador", async () => {
    login();
    const professional = {
      id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
      clinicId,
      fullName: "Dra. Ana Martins",
      crefito: "1",
      active: true,
    };
    const employee = {
      id: "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1",
      clinicId,
      name: "Ana Martins",
      role: "Fisioterapeuta",
      professionalId: professional.id,
      professionalName: professional.fullName,
      baseSalaryInCents: 250000,
      active: true,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
    };
    const posted: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/finance/payroll/employees") && method === "POST") {
        posted.push(JSON.parse(String(init!.body)));
        return json({ ...employee, id: "new", name: "Bia" }, 201);
      }
      if (url.includes("/finance/payroll/employees")) return json([employee]);
      if (url.includes("/finance/payroll?"))
        return json({
          competence: new URL(url, "http://x").searchParams.get("competence"),
          lines: [
            {
              employee,
              baseSalaryInCents: 250000,
              commissionInCents: 1500,
              commissionCount: 1,
              totalInCents: 251500,
            },
          ],
          baseSalaryInCents: 250000,
          commissionInCents: 1500,
          totalInCents: 251500,
        });
      if (url.includes("/finance/workspace")) return json(workspace());
      if (url.includes("/professionals")) return json([professional]);
      return json([]);
    });
    renderFinance();
    fireEvent.click(
      await screen.findByRole("button", { name: "Folha de pagamento" }),
    );
    const panel = (
      await screen.findByRole("heading", { name: "Folha de pagamento" })
    ).closest("section")!;
    const row = (await within(panel).findByText("Ana Martins")).closest(
      ".finance-row",
    ) as HTMLElement;
    expect(row).toHaveTextContent("R$ 2.500,00");
    expect(row).toHaveTextContent("R$ 15,00");
    expect(row).toHaveTextContent("R$ 2.515,00");
    expect(
      within(panel).getByText("Total da folha").closest(".finance-row"),
    ).toHaveTextContent("R$ 2.515,00");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo colaborador" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Novo colaborador",
    });
    // Profissional já ligado a outro colaborador não aparece de novo.
    expect(
      within(dialog).queryByRole("option", { name: "Dra. Ana Martins" }),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "Bia" },
    });
    fireEvent.change(within(dialog).getByLabelText("Cargo"), {
      target: { value: "Recepcionista" },
    });
    fireEvent.change(within(dialog).getByLabelText("Salário fixo"), {
      target: { value: "1800" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cadastrar colaborador" }),
    );
    expect(
      await screen.findByText("Colaborador cadastrado."),
    ).toBeInTheDocument();
    expect(posted).toEqual([
      {
        name: "Bia",
        role: "Recepcionista",
        baseSalaryInCents: 180000,
        active: true,
      },
    ]);
  });
});
