import {
  effectivePermissions,
  permissionEditModules,
  permissionModules,
  planTypeLabels,
  type PermissionKey,
  type PlanTemplate,
  type UserSummary,
} from "@crm/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { api } from "../../api";
const serviceId = "77777777-7777-4777-8777-777777777777";
const template: PlanTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "11111111-1111-4111-8111-111111111111",
  name: "Dançaterapia mensal",
  planType: "monthly",
  kind: "recurring",
  totalValueInCents: 16000,
  services: [
    {
      serviceId,
      totalSessions: 8,
      sessionsPerWeek: 2,
      totalValueInCents: 16000,
    },
  ],
  active: true,
  createdAt: "2026-10-10T12:00:00Z",
  updatedAt: "2026-10-10T12:00:00Z",
};
function session(permissions?: PermissionKey[]) {
  const chosen = permissions ?? effectivePermissions("admin");
  const user: UserSummary = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Admin",
    email: "test@local.test",
    role: permissions ? "user" : "admin",
    modules: permissionModules(chosen),
    editModules: permissionEditModules(chosen),
    permissions: chosen,
  };
  localStorage.setItem("crm.auth.token", "token");
  localStorage.setItem("crm.auth.user", JSON.stringify(user));
  vi.spyOn(api, "me").mockResolvedValue(user);
}
function page(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
async function settings() {
  page("/configuracoes");
  fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
}
beforeEach(() => {
  session();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    ),
  );
  vi.spyOn(api, "services").mockResolvedValue([
    {
      id: serviceId,
      clinicId: template.clinicId,
      name: "Dançaterapia",
      active: true,
      durationMinutes: 50,
      priceInCents: 16000,
      color: "#000000",
    },
  ]);
  vi.spyOn(api, "planTemplates").mockResolvedValue([template]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("plan types and weekly sessions", () => {
  it("offers all six types and registers the user's monthly example", async () => {
    vi.spyOn(api, "createPlanTemplate").mockResolvedValue(template);
    await settings();
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const dialog = screen.getByRole("dialog");
    for (const label of Object.values(planTypeLabels))
      expect(
        within(dialog).getByRole("option", { name: label }),
      ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome do plano"), {
      target: { value: template.name },
    });
    fireEvent.change(within(dialog).getByLabelText("Serviço 1"), {
      target: { value: serviceId },
    });
    fireEvent.change(
      within(dialog).getByLabelText("Sessões por semana do serviço 1"),
      { target: { value: "2" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "160,00" },
    });
    expect(
      within(dialog).getByText(/8 sessões no período/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await waitFor(() =>
      expect(api.createPlanTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          planType: "monthly",
          kind: "recurring",
          totalValueInCents: 16000,
          services: [
            {
              serviceId,
              sessionsPerWeek: 2,
              totalSessions: 8,
              totalValueInCents: 16000,
            },
          ],
        }),
      ),
    );
  });
  it("recalculates period quantities and supports manual promotional packages", async () => {
    await settings();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Editar plano Dançaterapia mensal",
      }),
    );
    const dialog = screen.getByRole("dialog");
    for (const [type, total] of [
      ["quarterly", 24],
      ["semiannual", 48],
      ["annual", 96],
    ] as const) {
      fireEvent.change(within(dialog).getByLabelText("Tipo de plano"), {
        target: { value: type },
      });
      expect(
        within(dialog).getByText(new RegExp(total + " sessões no período")),
      ).toBeInTheDocument();
    }
    fireEvent.change(within(dialog).getByLabelText("Tipo de plano"), {
      target: { value: "promotional" },
    });
    expect(
      within(dialog).getByLabelText("Sessões do serviço 1"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Sessões por semana do serviço 1"),
    ).not.toBeInTheDocument();
  });
  it("fills the service, price, balance and period in a sale and recalculates dates", async () => {
    const promo = {
      ...template,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Dançaterapia promocional",
      planType: "promotional" as const,
    };
    vi.mocked(api.planTemplates).mockResolvedValue([template, promo]);
    page("/planos");
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Plano cadastrado"),
      ).not.toBeDisabled(),
    );
    fireEvent.change(within(dialog).getByLabelText("Início"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: template.id },
    });
    expect(within(dialog).getByLabelText("Sessões do serviço 1")).toHaveValue(
      8,
    );
    expect(within(dialog).getByLabelText("Valor do serviço 1")).toHaveValue(
      "R$\u00a0160,00",
    );
    expect(within(dialog).getByLabelText("Fim da validade")).toHaveValue(
      "2026-11-09",
    );
    fireEvent.change(within(dialog).getByLabelText("Início"), {
      target: { value: "2026-11-10" },
    });
    expect(within(dialog).getByLabelText("Fim da validade")).toHaveValue(
      "2026-12-09",
    );
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("checkbox")).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: promo.id },
    });
    expect(within(dialog).getByLabelText("Fim da validade")).toHaveValue("");
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
  });
  it("charges a recurring plan once per cycle and warns about installments after the validity", async () => {
    vi.mocked(api.planTemplates).mockResolvedValue([template]);
    page("/planos");
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Plano cadastrado"),
      ).not.toBeDisabled(),
    );
    fireEvent.change(within(dialog).getByLabelText("Início"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: template.id },
    });
    expect(within(dialog).queryByLabelText("Parcelas")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Plano recorrente: 1 cobrança por ciclo.");

    fireEvent.change(within(dialog).getByLabelText("Modelo"), {
      target: { value: "fixed_package" },
    });
    fireEvent.change(within(dialog).getByLabelText("Parcelas"), {
      target: { value: "3" },
    });
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "A última parcela vence em 10/12/2026, depois do fim da validade (09/11/2026).",
    );
  });
  it("previews each installment of the sale with its due date and how the value is split", async () => {
    vi.mocked(api.planTemplates).mockResolvedValue([template]);
    page("/planos");
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Plano cadastrado"),
      ).not.toBeDisabled(),
    );
    fireEvent.change(within(dialog).getByLabelText("Primeiro vencimento"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Plano cadastrado"), {
      target: { value: template.id },
    });
    const preview = within(dialog)
      .getByText("Ver parcelas")
      .closest("details")!;
    expect(within(preview).getByText("1 cobrança de R$ 160,00")).toBeVisible();
    expect(preview).toHaveTextContent(
      "Plano recorrente: as próximas cobranças são geradas a cada renovação.",
    );

    fireEvent.change(within(dialog).getByLabelText("Modelo"), {
      target: { value: "fixed_package" },
    });
    fireEvent.change(within(dialog).getByLabelText("Parcelas"), {
      target: { value: "3" },
    });
    expect(
      within(preview).getByText("3 parcelas · R$ 160,00"),
    ).toBeInTheDocument();
    const rows = within(
      within(preview).getByRole("list", { name: "Parcelas previstas" }),
    ).getAllByRole("listitem");
    expect(
      rows.map((row) => row.querySelector(".muted-copy")?.textContent),
    ).toEqual(["vence 10/10/2026", "vence 10/11/2026", "vence 10/12/2026"]);
    expect(rows[0]).toHaveTextContent("Parcela 1/3");
    expect(rows[0]).toHaveTextContent(
      /Valor do plano \(R\$ 160,00\) ÷ 3\s*R\$\s53,33/,
    );
    expect(rows[0]).toHaveTextContent(
      /Centavo do arredondamento da divisão\s*R\$\s0,01/,
    );
    expect(rows[1]).not.toHaveTextContent("Centavo");
  });
  it("keeps the catalog read-only for settings viewers", async () => {
    vi.mocked(api.me).mockRestore();
    session(["settings.view"]);
    await settings();
    await screen.findByText(template.name);
    expect(
      screen.queryByRole("button", { name: "Cadastrar plano" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Editar plano Dançaterapia mensal",
      }),
    ).not.toBeInTheDocument();
  });
  it("preserves edits after a save failure", async () => {
    vi.spyOn(api, "updatePlanTemplate").mockRejectedValueOnce(
      new Error("Falha ao salvar"),
    );
    await settings();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Editar plano Dançaterapia mensal",
      }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Valor total"), {
      target: { value: "180,00" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar plano" }),
    );
    await within(dialog).findByText("Falha ao salvar");
    expect(within(dialog).getByLabelText("Valor total")).toHaveValue("180,00");
  });
});
