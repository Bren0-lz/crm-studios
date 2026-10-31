import type { FinancialEntry, FinancialReport } from "@crm/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import App from "../../App";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { localIsoDate } from "../../shared/lib/formatting";

const centro = "b1",
  norte = "b2";

const entry = (
  id: string,
  partial: Partial<FinancialEntry> &
    Pick<FinancialEntry, "direction" | "amountInCents" | "origin">,
): FinancialEntry => ({
  id,
  kind: partial.direction === "in" ? "receipt" : "payable",
  occurredAt: "2026-10-10T15:00:00.000Z",
  date: "2026-10-10",
  description: `Lançamento ${id}`,
  paymentMethod: "pix",
  categoryName: "Venda de planos",
  branchId: centro,
  ...partial,
});

function report(): FinancialReport {
  return {
    from: "2026-10-01",
    to: "2026-10-25",
    generatedAt: "2026-10-25T12:00:00.000Z",
    commissionMonths: ["2026-10"],
    branches: [
      { id: centro, name: "Unidade Centro" },
      { id: norte, name: "Unidade Norte" },
    ],
    proLabore: { percentage: 20, base: "profit" },
    entries: [
      entry("r1", {
        direction: "in",
        amountInCents: 100_000,
        origin: "plan",
        counterpart: "Cliente Ana",
        paymentMethod: "card",
      }),
      entry("r2", {
        direction: "in",
        amountInCents: 50_000,
        origin: "tab",
        categoryName: "Comandas",
        counterpart: "Cliente Bia",
        branchId: norte,
      }),
      entry("p1", {
        direction: "out",
        amountInCents: 30_000,
        origin: "expense",
        description: "Aluguel de outubro",
        categoryName: "Aluguel",
        counterpart: "Imobiliária Centro",
        costCenterName: "Administrativo",
      }),
      entry("c1", {
        kind: "commission",
        direction: "out",
        amountInCents: 20_000,
        origin: "commission",
        description: "Comissão 2026-10",
        categoryName: "Pagamento de profissionais",
        counterpart: "Beatriz Lima",
        professionalId: "pro1",
        professionalName: "Beatriz Lima",
        paymentMethod: "unspecified",
        date: "2026-10-20",
      }),
    ],
    professionals: [
      {
        id: "pro1",
        name: "Beatriz Lima",
        branchId: centro,
        paidInCents: 20_000,
        salaryPaidInCents: 0,
        generatedInCents: 26_000,
        openInCents: 6_000,
      },
    ],
  };
}

/** Período anterior (06 a 30 de setembro): metade das entradas, mesma despesa. */
function previousReport(): FinancialReport {
  return {
    ...report(),
    from: "2026-09-06",
    to: "2026-09-30",
    entries: [
      entry("old-r1", {
        direction: "in",
        amountInCents: 75_000,
        origin: "plan",
        date: "2026-09-10",
        occurredAt: "2026-09-10T15:00:00.000Z",
      }),
      entry("old-p1", {
        direction: "out",
        amountInCents: 30_000,
        origin: "expense",
        categoryName: "Aluguel",
        date: "2026-09-10",
        occurredAt: "2026-09-10T15:00:00.000Z",
      }),
    ],
    professionals: [],
  };
}

const text = (element: HTMLElement) =>
  (element.textContent ?? "").replace(/\s/g, " ");

async function openFinancialTab(admin = true) {
  localStorage.setItem("crm.auth.token", "test-token");
  const person = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
  };
  localStorage.setItem(
    "crm.auth.user",
    admin
      ? storedUser({ ...person, role: "owner" })
      : JSON.stringify(
          withPermissions({
            ...person,
            role: "user",
            modules: ["reports"],
            editModules: [],
            permissions: ["reports.view", "reports.dre"],
          }),
        ),
  );
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.includes("/reports/financial?"))
      return {
        ok: true,
        status: 200,
        json: async () =>
          // A tela começa no dia 1º do mês corrente; antes disso é o período anterior.
          new URL(url).searchParams.get("from")! >=
          `${localIsoDate().slice(0, 7)}-01`
            ? report()
            : previousReport(),
      } as Response;
    if (url.includes("/reports/financial/export?"))
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(["planilha"], { type: "text/csv" }),
      } as Response;
    if (url.includes("/admin/pro-labore"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...JSON.parse(String(init?.body)),
          updatedAt: "2026-10-25T12:00:00.000Z",
        }),
      } as Response;
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
  fireEvent.click(await screen.findByRole("tab", { name: "Financeiro" }));
  await screen.findByRole("heading", { name: "Resultado do caixa" });
  return calls;
}

describe("aba Financeiro dos relatórios", () => {
  it("mostra entradas, saídas, pró-labore, lucro e o que cada profissional recebeu", async () => {
    const calls = await openFinancialTab();
    const request = calls.find((call) =>
      call.url.includes("/reports/financial?"),
    )!;
    expect(new Headers(request.init?.headers).get("x-branch-id")).toBe("all");
    const waterfall = await screen.findByLabelText("Composição do resultado");
    // Entradas 1.500 − despesas 300 − profissionais 200 = 1.000; 20% = 200.
    expect(text(waterfall)).toContain("EntradasR$ 1.500,00");
    expect(text(waterfall)).toContain("(=) Resultado do caixaR$ 1.000,00");
    expect(text(waterfall)).toContain("(−) Pró-labore (20% do lucro do caixa)");
    expect(text(waterfall)).toContain("(=) Fica no caixa da empresaR$ 800,00");
    const professionals = screen.getByRole("table", {
      name: "Pagamentos e comissões por profissional",
    });
    expect(
      text(within(professionals).getByRole("row", { name: /Beatriz Lima/ })),
    ).toContain("R$ 200,00R$ 0,00R$ 200,00100%R$ 260,00R$ 60,00");
    const branches = screen.getByRole("table", {
      name: "Resultado do caixa por filial",
    });
    expect(
      text(within(branches).getByRole("row", { name: /Unidade Centro/ })),
    ).toContain("R$ 1.000,00R$ 500,00R$ 500,00R$ 100,00R$ 400,00");
  });

  it("filtra o extrato e abre o detalhe a partir dos quadros", async () => {
    await openFinancialTab();
    const ledger = screen.getByRole("table", { name: "Lançamentos do caixa" });
    expect(within(ledger).getAllByRole("row")).toHaveLength(5);

    const outflows = screen.getByRole("table", {
      name: "Por onde saiu · Categoria",
    });
    fireEvent.click(within(outflows).getByRole("button", { name: "Aluguel" }));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("table", { name: "Lançamentos do caixa" }),
        ).getAllByRole("row"),
      ).toHaveLength(2),
    );
    expect(screen.getByText("Aluguel de outubro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar filtros (2)" })).toBe(
      screen.getByRole("button", { name: /Limpar filtros/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "card" },
    });
    const filtered = screen.getByRole("table", {
      name: "Lançamentos do caixa",
    });
    expect(within(filtered).getAllByRole("row")).toHaveLength(2);
    expect(within(filtered).getByText("Lançamento r1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "inexistente" },
    });
    expect(
      screen.getByText("Nenhum lançamento com esses filtros"),
    ).toBeInTheDocument();
  });

  it("mostra só uma filial e esconde o comparativo", async () => {
    await openFinancialTab();
    fireEvent.change(screen.getByLabelText("Filial"), {
      target: { value: norte },
    });
    expect(text(screen.getByLabelText("Composição do resultado"))).toContain(
      "EntradasR$ 500,00",
    );
    expect(
      screen.queryByRole("table", { name: "Resultado do caixa por filial" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Nenhum pagamento a profissionais"),
    ).toBeInTheDocument();
  });

  it("o admin configura o pró-labore e o lucro é recalculado", async () => {
    const calls = await openFinancialTab();
    fireEvent.click(
      screen.getByRole("button", { name: "Configurar pró-labore" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Percentual (%)"), {
      target: { value: "150" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar pró-labore" }),
    );
    expect(
      await within(dialog).findByText("O percentual não pode passar de 100%."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Percentual (%)"), {
      target: { value: "12,5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Calcular sobre"), {
      target: { value: "revenue" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar pró-labore" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const saved = calls.find((call) => call.url.includes("/admin/pro-labore"));
    expect(saved?.init?.method).toBe("PUT");
    expect(JSON.parse(String(saved?.init?.body))).toEqual({
      percentage: 12.5,
      base: "revenue",
    });
    // 12,5% de R$ 1.500,00 de entradas = R$ 187,50.
    expect(text(screen.getByLabelText("Composição do resultado"))).toContain(
      "(=) Fica no caixa da empresaR$ 812,50",
    );
  });

  it("quem não é admin não vê a configuração do pró-labore", async () => {
    await openFinancialTab(false);
    expect(
      screen.queryByRole("button", { name: "Configurar pró-labore" }),
    ).not.toBeInTheDocument();
    // Consultar o relatório não dá direito à planilha (reports.financial_export).
    expect(
      screen.queryByRole("button", { name: "Exportar extrato" }),
    ).not.toBeInTheDocument();
  });

  it("exporta o extrato pela API com a filial e os filtros da tela", async () => {
    const original = {
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
    };
    const createObjectURL = vi.fn(() => "blob:extrato");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    onTestFinished(() => {
      Object.assign(URL, original);
    });
    const calls = await openFinancialTab();
    fireEvent.change(screen.getByLabelText("Filial"), {
      target: { value: centro },
    });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "card" },
    });
    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Exportar extrato" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const exported = calls.find((call) =>
      call.url.includes("/reports/financial/export?"),
    )!;
    const query = new URL(exported.url).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      periodFrom: "2026-10-01",
      periodTo: "2026-10-25",
      branchId: centro,
      paymentMethod: "card",
      search: "ana",
    });
    expect(new Headers(exported.init?.headers).get("x-branch-id")).toBe("all");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:extrato");
  });

  it("compara com o período anterior e mostra o fluxo de caixa por semana", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const calls = await openFinancialTab();
    expect(
      calls.some((call) =>
        call.url.includes("/reports/financial?from=2026-09-06&to=2026-09-30"),
      ),
    ).toBe(true);
    const inflow = (await screen.findByText(/\+100% \(antes R\$ 750,00\)/))
      .parentElement!;
    expect(text(inflow)).toContain("Entradas");
    const flow = screen.getByRole("table", {
      name: "Fluxo de caixa por categoria",
    });
    expect(within(flow).getAllByRole("columnheader")).toHaveLength(6);
    expect(text(within(flow).getByRole("row", { name: /^Aluguel/ }))).toContain(
      "—-R$ 300,00——-R$ 300,00",
    );
    expect(
      text(within(flow).getByRole("row", { name: /Fica no caixa da empresa/ })),
    ).toContain("R$ 800,00");
    fireEvent.click(within(flow).getByRole("button", { name: "08/10 a 14/10" }));
    const filters = screen.getByRole("search", { name: "Filtros" });
    expect(within(filters).getByLabelText("De")).toHaveValue("2026-10-08");
    expect(within(filters).getByLabelText("Até")).toHaveValue("2026-10-14");
  });

  it("filtra o extrato por faixa de valor e ordena com saldo acumulado", async () => {
    await openFinancialTab();
    const rows = () =>
      within(
        screen.getByRole("table", { name: "Lançamentos do caixa" }),
      ).getAllByRole("row");
    expect(
      within(rows()[0]!).getByRole("columnheader", { name: "Saldo" }),
    ).toBeInTheDocument();
    // Saldo após as quatro linhas: 1.000 + 500 − 300 − 200.
    expect(text(rows()[4]!)).toContain("R$ 1.000,00");
    fireEvent.change(screen.getByLabelText("Valor mínimo (R$)"), {
      target: { value: "400" },
    });
    expect(rows()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Valor mínimo (R$)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Valor máximo (R$)"), {
      target: { value: "250,5x" },
    });
    expect(screen.getByLabelText("Valor máximo (R$)")).toHaveValue("250,5");
    expect(rows()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Valor máximo (R$)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Ordenar"), {
      target: { value: "amount-desc" },
    });
    expect(text(rows()[1]!)).toContain("Lançamento r1");
    expect(
      within(rows()[0]!).queryByRole("columnheader", { name: "Saldo" }),
    ).not.toBeInTheDocument();
  });
});
