import type { CampaignReport, PermissionKey } from "@crm/contracts";
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
import { api } from "../../api";
import { withPermissions } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function session(permissions: PermissionKey[]) {
  localStorage.setItem("crm.auth.token", "test-token");
  localStorage.setItem(
    "crm.auth.user",
    JSON.stringify(
      withPermissions({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Gestora",
        email: "gestora@example.com",
        role: "user",
        modules: ["reports"],
        editModules: [],
        permissions,
      }),
    ),
  );
  vi.mocked(fetch).mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ message: "Dados indisponíveis" }),
  } as Response);
}

function report(from: string, to: string): CampaignReport {
  return {
    from,
    to,
    generatedAt: "2026-10-30T12:00:00.000Z",
    summary: {
      manualCampaigns: 1,
      automaticCampaigns: 1,
      sent: 7,
      skipped: 2,
      pending: 3,
      redemptions: 4,
    },
    campaigns: [
      {
        campaignId: "auto-1",
        kind: "automatic",
        name: "Aniversários",
        origin: "Aniversário",
        createdAt: "2026-09-01T12:00:00.000Z",
        createdByName: "Aryana",
        active: true,
        total: 5,
        sent: 4,
        skipped: 1,
        pending: 0,
        redemptions: 4,
      },
      {
        campaignId: "manual-1",
        kind: "manual",
        name: "Volta às aulas",
        origin: "Convite",
        createdAt: "2026-10-02T12:00:00.000Z",
        createdByName: "Aryana",
        active: true,
        total: 7,
        sent: 3,
        skipped: 1,
        pending: 3,
        redemptions: 0,
      },
    ],
  };
}

function open() {
  render(
    <MemoryRouter initialEntries={["/relatorios"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("relatório de campanhas", () => {
  it("mostra o resumo e as campanhas e filtra por tipo, sem exportar sem permissão", async () => {
    session(["reports.view", "reports.campaigns"]);
    vi.spyOn(api, "campaignReport").mockImplementation(async (from, to) =>
      report(from, to),
    );
    open();
    fireEvent.click(await screen.findByRole("tab", { name: "Campanhas" }));
    const table = await screen.findByRole("table", { name: /Campanhas/ });
    expect(
      screen.getByText("Promoções usadas", { selector: "span" }),
    ).toBeInTheDocument();
    const auto = within(table).getByRole("row", { name: /Aniversários/ });
    expect(auto).toHaveTextContent("Automática");
    expect(auto).toHaveTextContent("Ligada");
    const manual = within(table).getByRole("row", { name: /Volta às aulas/ });
    expect(manual).toHaveTextContent("Em andamento");
    expect(
      screen.queryByRole("button", { name: "Exportar planilha" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tipo de campanha"), {
      target: { value: "manual" },
    });
    expect(
      within(table).queryByRole("row", { name: /Aniversários/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole("row", { name: /Volta às aulas/ }),
    ).toBeInTheDocument();
  });

  it("exporta a planilha do período aplicado com a permissão de download", async () => {
    session(["reports.view", "reports.campaigns", "reports.campaigns_export"]);
    vi.spyOn(api, "campaignReport").mockImplementation(async (from, to) =>
      report(from, to),
    );
    const exporting = vi
      .spyOn(api, "campaignReportXlsx")
      .mockResolvedValue(new Blob(["xlsx"]));
    const originalCreate = URL.createObjectURL,
      originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:download");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      open();
      fireEvent.click(await screen.findByRole("tab", { name: "Campanhas" }));
      const button = await screen.findByRole("button", {
        name: "Exportar planilha",
      });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      await waitFor(() => expect(exporting).toHaveBeenCalledTimes(1));
      const [from, to] = exporting.mock.calls[0]!;
      expect(from <= to).toBe(true);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("esconde a aba de quem não pode consultar o relatório", async () => {
    session(["reports.view", "reports.dre"]);
    open();
    await screen.findByRole("tab", { name: "DRE" });
    expect(
      screen.queryByRole("tab", { name: "Campanhas" }),
    ).not.toBeInTheDocument();
  });
});
