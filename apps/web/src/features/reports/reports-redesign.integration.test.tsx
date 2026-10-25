import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PermissionKey, SalesPeriodReport } from "@crm/contracts";
import App from "../../App";
import { api } from "../../api";
import {
  storedUser,
  withPermissions,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function session(permissions?: PermissionKey[]) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    permissions
      ? JSON.stringify(
          withPermissions({
            id: "22222222-2222-4222-8222-222222222222",
            fullName: "Gestora",
            email: "gestora@example.com",
            role: "user",
            modules: ["reports"],
            editModules: [],
            permissions,
          }),
        )
      : storedUser({
          id: "22222222-2222-4222-8222-222222222222",
          fullName: "Aryana Dutra",
          email: "admin@movimenta.local",
          role: "owner",
        }),
  );
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ message: "Dados indisponíveis" }),
  } as Response);
}
function sales(from: string, to: string, value = 120000): SalesPeriodReport {
  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    summary: {
      from,
      to,
      grossSalesInCents: value,
      netSalesInCents: value,
      cancelledSalesInCents: 0,
      receivedInCents: value,
      attendedPatients: 14,
    },
    sales: [
      {
        id: "sale-1",
        sourceId: "plan-1",
        sourceType: "plan",
        patientId: "p1",
        patientName: "Helena Almeida",
        itemName: "Plano de fisioterapia",
        kind: "sale",
        occurredAt: `${from}T12:00:00Z`,
        amountInCents: value,
        quantity: 1,
      },
    ],
    payments: [],
    patientsWithoutReturn: [
      {
        patientId: "p2",
        patientName: "Cliente sem retorno",
        lastCompletedAt: "2026-08-20T15:00:00Z",
      },
    ],
    returnReference: { from: "2026-08-01", to: "2026-08-31" },
  };
}
function open(path = "/relatorios") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
function apply(from: string, to: string) {
  fireEvent.change(screen.getByLabelText("De"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("Até"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
}

describe("management reports redesign", () => {
  it("opens overview, loads other tabs on demand, preserves filters and supports keyboard navigation", async () => {
    session();
    const load = vi
      .spyOn(api, "salesPeriodReport")
      .mockImplementation(async (from, to) => sales(from, to));
    const clients = vi
      .spyOn(api, "clientDetailsReport")
      .mockRejectedValue(new Error("Indisponível"));
    const dre = vi
      .spyOn(api, "dreReport")
      .mockRejectedValue(new Error("Indisponível"));
    open();
    await screen.findByText("Vendido líquido");
    expect(clients).not.toHaveBeenCalled();
    expect(dre).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/frente ao mês anterior|Comparação mensal/),
    ).not.toBeInTheDocument();
    const overview = screen.getByRole("tab", { name: "Visão geral" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    const clientsTab = screen.getByRole("tab", { name: "Clientes" });
    expect(clientsTab).toHaveFocus();
    expect(clientsTab).toHaveAttribute("aria-selected", "true");
    const noReturnTab = screen.getByRole("tab", { name: "Sem retorno" });
    fireEvent.keyDown(screen.getByRole("tab", { name: "Retenção" }), {
      key: "End",
    });
    const detailsTab = screen.getByRole("tab", {
      name: "Consulta de clientes",
    });
    expect(detailsTab).toHaveFocus();
    expect(detailsTab).toHaveAttribute("aria-selected", "true");
    const search = await screen.findByLabelText("Buscar cliente");
    fireEvent.change(search, { target: { value: "Helena" } });
    fireEvent.click(overview);
    fireEvent.click(clientsTab);
    expect(screen.getByLabelText("Buscar cliente")).toHaveValue("Helena");
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(noReturnTab);
    await screen.findByText("Cliente sem retorno");
    expect(load).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(clientsTab, { key: "End" });
    expect(screen.getByRole("tab", { name: "DRE" })).toHaveFocus();
    await waitFor(() => expect(dre).toHaveBeenCalledTimes(1));
  });
  it("keeps edits pending until Apply and ignores late results from the previous range", async () => {
    session();
    let resolveOld!: (value: SalesPeriodReport) => void;
    const load = vi
      .spyOn(api, "salesPeriodReport")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementation(async (from, to) => sales(from, to, 99000));
    open();
    await screen.findByRole("heading", { name: "Relatórios gerenciais" });
    fireEvent.change(screen.getByLabelText("De"), {
      target: { value: "2026-01-01" },
    });
    expect(load).toHaveBeenCalledTimes(1);
    apply("2026-01-01", "2026-01-15");
    await within(
      (await screen.findByText("Vendido líquido")).closest("article")!,
    ).findByText(/^R\$\s990,00$/);
    await act(async () => {
      resolveOld(sales("2026-02-01", "2026-02-15", 888888));
    });
    expect(screen.queryByText(/8\.888,88/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("De")).toHaveValue("2026-01-01");
    apply("2026-02-01", "2026-01-01");
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeDisabled();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("opens the direct no-return link with the full list and criterion", async () => {
    session();
    vi.spyOn(api, "salesPeriodReport").mockImplementation(async (from, to) => ({
      ...sales(from, to),
      patientsWithoutReturn: Array.from({ length: 15 }, (_, i) => ({
        patientId: String(i),
        patientName: `Cliente Sem Retorno ${i + 1}`,
        lastCompletedAt: "2026-08-20T15:00:00Z",
      })),
    }));
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scroll,
      configurable: true,
    });
    open("/relatorios?secao=sem-retorno");
    await screen.findByText("Cliente Sem Retorno 15");
    expect(screen.getByRole("tab", { name: "Clientes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Sem retorno" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText(/^Cliente Sem Retorno \d+$/)).toHaveLength(15);
    expect(
      screen.getByText(/Atendidos de 01\/08\/2026 a 31\/08\/2026/),
    ).toBeInTheDocument();
    expect(scroll).toHaveBeenCalled();
  });
  it("filters clients without return by name and next appointment", async () => {
    session();
    vi.spyOn(api, "salesPeriodReport").mockImplementation(async (from, to) => ({
      ...sales(from, to),
      patientsWithoutReturn: [
        {
          patientId: "p1",
          patientName: "Lúcia Prado",
          lastCompletedAt: "2026-08-20T15:00:00Z",
          nextAppointmentAt: "2099-01-10T13:00:00Z",
        },
        {
          patientId: "p2",
          patientName: "Luana Reis",
          lastCompletedAt: "2026-08-18T15:00:00Z",
        },
        {
          patientId: "p3",
          patientName: "Marta Souza",
          lastCompletedAt: "2026-08-12T15:00:00Z",
        },
      ],
    }));
    open("/relatorios?secao=sem-retorno");
    await screen.findByText("Marta Souza");
    const group = screen.getByRole("group", { name: "Próximo agendamento" });
    fireEvent.click(
      within(group).getByRole("button", { name: /Sem agendamento/ }),
    );
    expect(screen.queryByText("Lúcia Prado")).not.toBeInTheDocument();
    expect(screen.getByText("Luana Reis")).toBeInTheDocument();
    expect(screen.getByText("Marta Souza")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar cliente sem retorno"), {
      target: { value: "lu" },
    });
    expect(screen.getByText("Luana Reis")).toBeInTheDocument();
    expect(screen.queryByText("Marta Souza")).not.toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: /Todos/ }),
    ).toHaveTextContent("Todos2");
    fireEvent.click(
      within(group).getByRole("button", { name: /Com agendamento/ }),
    );
    expect(screen.getByText("Lúcia Prado")).toBeInTheDocument();
    expect(screen.queryByText("Luana Reis")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar cliente sem retorno"), {
      target: { value: "marta" },
    });
    expect(screen.getByText("Nenhum cliente encontrado.")).toBeInTheDocument();
  });
  it("opens the contract history and the WhatsApp link of a client without return", async () => {
    session();
    vi.spyOn(api, "salesPeriodReport").mockImplementation(async (from, to) => ({
      ...sales(from, to),
      patientsWithoutReturn: [
        {
          patientId: "p1",
          patientName: "Lucas Ribeiro",
          lastCompletedAt: "2026-08-20T15:00:00Z",
          phone: "(11) 98888-7777",
          whatsapp: "11977776666",
        },
        {
          patientId: "p2",
          patientName: "Helena Almeida",
          lastCompletedAt: "2026-08-19T15:00:00Z",
        },
      ],
    }));
    let resolveHistory: (
      value: Awaited<ReturnType<typeof api.patientSalesHistory>>,
    ) => void = () => {};
    const history = vi
      .spyOn(api, "patientSalesHistory")
      .mockImplementation(
        () => new Promise((resolve) => (resolveHistory = resolve)),
      );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    open("/relatorios?secao=sem-retorno");
    const whatsapp = await screen.findByRole("link", {
      name: "WhatsApp de Lucas Ribeiro",
    });
    expect(whatsapp).toHaveAttribute(
      "href",
      `https://wa.me/5511977776666?text=${encodeURIComponent("Olá, Lucas! Tudo bem?")}`,
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("link", { name: "WhatsApp de Helena Almeida" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Histórico de Lucas Ribeiro" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Histórico de contratações",
    });
    expect(history).toHaveBeenCalledWith("p1");
    await act(async () =>
      resolveHistory([
        {
          id: "s1:sale",
          sourceId: "plan-1",
          sourceType: "plan",
          kind: "sale",
          occurredAt: "2025-03-10T15:00:00Z",
          patientId: "p1",
          patientName: "Lucas Ribeiro",
          itemName: "Pilates 2x (Pilates)",
          quantity: 1,
          amountInCents: 48000,
        },
      ]),
    );
    expect(
      within(dialog).getByText("Pilates 2x (Pilates)"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("10/03/2025")).toBeInTheDocument();
    expect(within(dialog).getByText("Plano")).toBeInTheDocument();
    expect(within(dialog).getByText(/480,00/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
  it("exports the applied range even when the draft has changed and exposes chart values by keyboard", async () => {
    session();
    vi.spyOn(api, "salesPeriodReport").mockImplementation(async (from, to) =>
      sales(from, to),
    );
    const exporting = vi
      .spyOn(api, "salesPeriodReportXlsx")
      .mockResolvedValue(new Blob(["xlsx"]));
    const originalCreate = URL.createObjectURL,
      originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:download");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      open();
      await screen.findByText("Vendido líquido");
      apply("2026-01-01", "2026-01-15");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Exportar Excel detalhado" }),
        ).toBeEnabled(),
      );
      fireEvent.change(screen.getByLabelText("Até"), {
        target: { value: "2026-02-15" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Exportar Excel detalhado" }),
      );
      await waitFor(() =>
        expect(exporting).toHaveBeenCalledWith("2026-01-01", "2026-01-15"),
      );
      const point = screen.getByRole("img", {
        name: /01\/01\/2026: Vendas líquidas/,
      });
      fireEvent.focus(point);
      const readout = document.querySelector(
        ".report-chart-readout",
      ) as HTMLElement;
      expect(
        within(readout).getByRole("list", {
          name: /01\/01\/2026: Vendas líquidas: R\$\s1\.200,00 · Recebimentos:/,
        }),
      ).toBeInTheDocument();
      expect(within(readout).getByText("01/01/2026")).toBeInTheDocument();
      expect(within(readout).getByText(/^R\$\s1\.200,00$/)).toBeInTheDocument();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
  it("only renders and queries permitted tabs", async () => {
    session(["reports.view", "reports.dre"]);
    const dre = vi
      .spyOn(api, "dreReport")
      .mockRejectedValue(new Error("DRE indisponível"));
    const load = vi.spyOn(api, "salesPeriodReport");
    open();
    await screen.findByText("DRE indisponível");
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "DRE" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(dre).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Exportar DRE" }),
    ).not.toBeInTheDocument();
  });
  it("shows the no-access state without requesting reports", async () => {
    session(["reports.view"]);
    const load = vi.spyOn(api, "salesPeriodReport");
    open();
    await screen.findByText("Nenhum relatório foi liberado para seu usuário.");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
  it("recovers from a failed query and shows empty periods without a fictitious graph", async () => {
    session();
    vi.spyOn(api, "salesPeriodReport")
      .mockRejectedValueOnce(new Error("Vendas indisponíveis"))
      .mockImplementation(async (from, to) => ({
        ...sales(from, to, 0),
        sales: [],
        payments: [],
      }));
    open();
    await screen.findByText("Vendas indisponíveis");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await screen.findByText("Sem movimentações no período");
    expect(screen.queryByText("Vendas indisponíveis")).not.toBeInTheDocument();
    const panel = screen
      .getByRole("heading", { name: "Vendas e recebimentos" })
      .closest("section")!;
    expect(
      within(panel).queryByRole("group", {
        name: "Vendas líquidas e recebimentos no período",
      }),
    ).not.toBeInTheDocument();
  });
});
