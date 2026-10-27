import type { FinancialEntry, FinancialReport } from "@crm/contracts";
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
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

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
        generatedInCents: 26_000,
        openInCents: 6_000,
      },
    ],
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
      return { ok: true, status: 200, json: async () => report() } as Response;
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
    ).toContain("R$ 200,00R$ 260,00R$ 60,00");
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
  });
});
