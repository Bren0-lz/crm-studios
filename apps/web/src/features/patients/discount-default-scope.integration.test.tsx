import type { PatientOption, PlanTemplate, Service } from "@crm/contracts";
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
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { fillRequiredContact } from "../../test-support/patient-actions";
import { PatientPlanModal } from "./PatientPlanModal";

/** RF11 (D3): o alcance já marcado no desconto novo vem das Configurações da clínica. */
const clinicId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-12T12:00:00Z";
const pilates: Service = {
  id: "77777777-7777-4777-8777-777777777777",
  clinicId,
  name: "Pilates",
  active: true,
  businessLine: "studio",
  durationMinutes: 50,
};
const recurring: PlanTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pacote Pilates",
  kind: "fixed_package",
  totalValueInCents: 30_000,
  services: [
    { serviceId: pilates.id, totalSessions: 10, totalValueInCents: 30_000 },
  ],
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const single = {
  id: "b3333333-3333-4333-8333-333333333333",
  name: "Aula avulsa",
  kind: "single",
  active: true,
  totalValueInCents: 9000,
  services: [
    { serviceId: pilates.id, totalSessions: 1, totalValueInCents: 9000 },
  ],
};
const branding = (defaultDiscountScope: string) => ({
  name: "Studios Aryana",
  logoDataUrl: "",
  timezone: "America/Sao_Paulo",
  defaultDiscountScope,
});

function scopeOf(discount: HTMLElement) {
  return ["Só no próximo pagamento", "Nas próximas cobranças"]
    .concat("Permanente (até remover)")
    .find(
      (label) =>
        (within(discount).getByLabelText(label) as HTMLInputElement).checked,
    );
}

describe("alcance padrão do desconto (RF11)", () => {
  it("cadastro guiado: o desconto novo já vem com o alcance da clínica", async () => {
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
      const body = url.includes("/clinic/branding")
        ? branding("next")
        : url.includes("/plan-templates")
          ? [single]
          : url.includes("/services")
            ? [{ id: pilates.id, name: "Pilates" }]
            : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo cliente" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Novo cliente" });
    fireEvent.change(within(dialog).getByLabelText("Nome completo"), {
      target: { value: "Maria Aparecida Lima" },
    });
    fillRequiredContact(dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adicionar serviço avulso" }),
    );
    fireEvent.change(await within(dialog).findByLabelText("Plano cadastrado"), {
      target: { value: single.id },
    });
    const block = within(dialog).getByRole("group", { name: "Serviço avulso" });
    fireEvent.click(
      within(block).getByRole("button", { name: "Configurar desconto" }),
    );
    let discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
    });
    expect(scopeOf(discount)).toBe("Nas próximas cobranças");
    expect(
      within(discount).getByLabelText(
        "Quantas cobranças (parcelas ou renovações)",
      ),
    ).toHaveValue(3);

    // A equipe troca o alcance deste desconto; ao editar, o alcance dele continua.
    fireEvent.change(
      within(discount).getByLabelText("Porcentagem de desconto (%)"),
      { target: { value: "10" } },
    );
    fireEvent.click(within(discount).getByLabelText("Só no próximo pagamento"));
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      await within(block).findByText(
        "10% de desconto · só no próximo pagamento",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(block).getByRole("button", { name: "Alterar desconto" }),
    );
    discount = await screen.findByRole("dialog", { name: "Desconto do plano" });
    expect(scopeOf(discount)).toBe("Só no próximo pagamento");
  });

  it("ficha: o desconto novo já vem com o alcance da clínica", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as unknown as Response,
    );
    vi.spyOn(api, "services").mockResolvedValue([pilates]);
    vi.spyOn(api, "planTemplates").mockResolvedValue([recurring]);
    vi.spyOn(api, "clinicBranding").mockResolvedValue(
      branding("permanent") as Awaited<ReturnType<typeof api.clinicBranding>>,
    );
    const allowAll: Authorization = {
      user: null,
      checking: false,
      setUser: () => undefined,
      logout: () => undefined,
      can: (permission) =>
        !permission.startsWith("contracts.") && permission !== "groups.enroll",
      canView: () => true,
      canEdit: () => true,
    };
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={allowAll}>
          <PatientPlanModal
            patient={
              {
                id: "99999999-9999-4999-8999-999999999999",
                fullName: "Ana Azevedo Gomes",
              } as PatientOption
            }
            kind="recurring"
            onClose={() => undefined}
            onSaved={() => undefined}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Novo plano recorrente",
    });
    const select = await within(dialog).findByRole("combobox", {
      name: "Plano cadastrado",
    });
    await within(select).findByRole("option", { name: /Pacote Pilates/ });
    fireEvent.change(select, { target: { value: recurring.id } });
    await waitFor(() => expect(api.clinicBranding).toHaveBeenCalled());
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
    });
    expect(scopeOf(discount)).toBe("Permanente (até remover)");
  });
});
