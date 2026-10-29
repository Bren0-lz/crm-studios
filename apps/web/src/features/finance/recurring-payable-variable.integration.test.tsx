import { saoPauloToday } from "@crm/contracts";
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
  name: "Água, luz e internet",
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

function workspaceWith(payables: unknown[]) {
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

afterEach(() => {
  vi.useRealTimers();
});

describe("variable fixed expenses", () => {
  it("shows the reminder, informs the month amount and edits the amount type", async () => {
    login();
    // 12:00 em São Paulo, 16/10/2026: a água vence em 18/10 (2 dias).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
    const today = saoPauloToday();
    expect(today).toBe("2026-10-16");
    const month = today.slice(0, 7);
    const dueDate = "2026-10-18";
    const water = {
      ...base,
      id: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
      description: "Conta de água",
      amountType: "variable",
      amountInCents: 15000,
      dayOfMonth: Number(dueDate.slice(8)),
      reminderDaysBefore: 3,
      startMonth: "2026-01",
      active: true,
      lastCompetence: month,
    };
    const internet = {
      ...base,
      id: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2",
      description: "Internet",
      amountType: "fixed",
      amountInCents: 12990,
      dayOfMonth: 5,
      reminderDaysBefore: 2,
      startMonth: "2026-01",
      active: true,
    };
    let payable: Record<string, unknown> = {
      ...base,
      id: "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1",
      description: "Conta de água",
      dueDate,
      amountInCents: 15000,
      status: "open",
      overdue: false,
      recurringPayableId: water.id,
      competence: dueDate.slice(0, 7),
      amountPending: true,
    };
    let recurring: Record<string, unknown>[] = [water, internet];
    const bodies: { url: string; body: Record<string, unknown> }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as Response;
      if (method === "PUT" && url.includes("/finance/payables/")) {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ url, body });
        payable = { ...payable, ...body, amountPending: false };
        return json(payable);
      }
      if (method === "PUT" && url.includes("/finance/recurring-payables/")) {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        bodies.push({ url, body });
        const id = url.split("/").pop();
        const updated = { ...base, id, ...body };
        recurring = recurring.map((item) => (item.id === id ? updated : item));
        return json(updated);
      }
      if (url.includes("/finance/recurring-payables")) return json(recurring);
      if (url.includes("/finance/workspace"))
        return json(workspaceWith([payable]));
      return json([]);
    });
    // O link do sino abre direto a aba de contas a pagar.
    render(
      <MemoryRouter initialEntries={["/financeiro?aba=contas-a-pagar"]}>
        <App />
      </MemoryRouter>,
    );
    const section = (
      await screen.findByRole("heading", { name: "Despesas fixas" })
    ).closest("section")!;
    // Bloco "Avisos de vencimento" no topo: a internet (dia 5, vencida e ainda não gerada) e a
    // água, que entrou no prazo de aviso; só a variável pede o valor do mês.
    const remindersBlock = await within(section).findByRole("region", {
      name: "Avisos de vencimento",
    });
    expect(
      within(remindersBlock)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("strong")?.textContent),
    ).toEqual(["Internet", "Conta de água"]);
    expect(
      within(remindersBlock).getAllByRole("button", { name: /Informar valor/ }),
    ).toHaveLength(1);
    expect(
      within(remindersBlock).getByText(/vence em 2 dias .* a informar/),
    ).toHaveTextContent(/150,00 \(estimado\)$/);
    expect(
      within(remindersBlock).getByRole("button", {
        name: "Informar valor de Conta de água (10/2026)",
      }),
    ).toBeInTheDocument();
    const table = section.querySelector(".recurring-table") as HTMLElement;
    const waterRow = (await within(table).findByText("Conta de água")).closest(
      ".finance-row",
    ) as HTMLElement;
    expect(
      within(waterRow).getByText(
        "Valor variável (estimativa) · Aviso 3 dias antes",
      ),
    ).toBeInTheDocument();
    expect(
      within(waterRow).getByText(/vence em 2 dias .* valor do mês a informar$/),
    ).toHaveClass("recurring-reminder");

    // Na lista de contas a pagar, a conta variável pede o valor antes de pagar.
    const payablesPanel = screen
      .getByRole("heading", { name: "Contas a pagar" })
      .closest("section")!;
    expect(
      within(payablesPanel).queryByRole("button", {
        name: "Pagar Conta de água",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(payablesPanel).getByText(/Valor estimado: informe o valor do mês/),
    ).toBeInTheDocument();

    fireEvent.click(
      within(waterRow).getByRole("button", {
        name: "Informar valor de Conta de água",
      }),
    );
    const amountDialog = await screen.findByRole("dialog", {
      name: "Informar valor do mês",
    });
    const amount = within(amountDialog).getByLabelText("Valor do mês");
    expect(amount).toHaveValue("");
    fireEvent.change(amount, { target: { value: "187,90" } });
    fireEvent.click(
      within(amountDialog).getByRole("button", { name: "Salvar valor" }),
    );
    expect(
      await within(payablesPanel).findByRole("button", {
        name: "Pagar Conta de água",
      }),
    ).toBeInTheDocument();
    expect(bodies[0]).toEqual({
      url: expect.stringContaining(
        "/finance/payables/f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1/amount",
      ),
      body: { amountInCents: 18790 },
    });
    expect(
      within(waterRow).queryByRole("button", {
        name: "Informar valor de Conta de água",
      }),
    ).not.toBeInTheDocument();
    expect(within(waterRow).getByText(/vence em 2 dias/)).not.toHaveTextContent(
      "valor do mês a informar",
    );
    // Com o valor informado, o aviso continua (falta pagar), sem o botão e sem "(estimado)".
    expect(
      within(remindersBlock).queryByRole("button", { name: /Informar valor/ }),
    ).not.toBeInTheDocument();
    expect(
      within(remindersBlock).getByText(/vence em 2 dias/),
    ).toHaveTextContent(/187,90$/);

    // Editar a internet: passa a variável e sem aviso.
    fireEvent.click(
      within(section).getByRole("button", { name: "Editar Internet" }),
    );
    const editDialog = await screen.findByRole("dialog", {
      name: "Editar despesa fixa",
    });
    expect(within(editDialog).getByLabelText("Descrição")).toHaveValue(
      "Internet",
    );
    expect(
      within(editDialog).getByLabelText("Dias de antecedência do aviso"),
    ).toHaveValue(2);
    fireEvent.change(within(editDialog).getByLabelText("Tipo de valor"), {
      target: { value: "variable" },
    });
    // Na variável, a estimativa é opcional: dá para salvar sem ela.
    fireEvent.change(
      within(editDialog).getByLabelText("Valor estimado (opcional)"),
      { target: { value: "" } },
    );
    fireEvent.click(
      within(editDialog).getByLabelText("Avisar antes do vencimento"),
    );
    expect(
      within(editDialog).queryByLabelText("Dias de antecedência do aviso"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(editDialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await vi.waitFor(() =>
      expect(bodies[1]).toEqual({
        url: expect.stringContaining(
          "/finance/recurring-payables/e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2",
        ),
        body: {
          description: "Internet",
          categoryId: category.id,
          costCenterId: center.id,
          amountType: "variable",
          amountInCents: 0,
          dayOfMonth: 5,
          startMonth: "2026-01",
          active: true,
        },
      }),
    );
    const internetRow = (
      await within(section).findByText(
        "Valor variável (estimativa) · Sem aviso",
      )
    ).closest(".finance-row") as HTMLElement;
    expect(within(internetRow).getByText("Internet")).toBeInTheDocument();
    expect(within(internetRow).getByText("A informar")).toBeInTheDocument();
  });

  it("opens accounts payable from the fixed expenses notification", async () => {
    login();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/notifications")
        ? { date: "2026-10-16", recurringPayablesDue: 2 }
        : url.includes("/finance/workspace")
          ? workspaceWith([])
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    // Já no Financeiro (aba de parcelas), o sino leva às contas a pagar.
    render(
      <MemoryRouter initialEntries={["/financeiro"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Contas a pagar (0)" }),
    ).not.toHaveClass("active");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Notificações: 2 pendências",
      }),
    );
    const item = within(
      screen.getByRole("dialog", { name: "Notificações" }),
    ).getByRole("button", { name: /Despesas fixas a vencer/ });
    expect(item).toHaveTextContent("2");
    expect(item).toHaveTextContent(
      "No prazo de aviso ou vencidas, ainda sem pagamento",
    );
    fireEvent.click(item);
    expect(
      await screen.findByRole("heading", { name: "Despesas fixas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contas a pagar (0)" }),
    ).toHaveClass("active");
  });
});
