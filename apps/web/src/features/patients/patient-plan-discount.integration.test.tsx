import type {
  PatientOption,
  PatientPlan,
  PlanTemplate,
  Service,
} from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { PatientPlanModal } from "./PatientPlanModal";

/** Contratação pela ficha com o desconto do cadastro guiado (RE15). */
const allowAll: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  // Sem contrato nem turma: o teste fica só na contratação simples.
  can: (permission) =>
    !permission.startsWith("contracts.") && permission !== "groups.enroll",
  canView: () => true,
  canEdit: () => true,
};
const clinicId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-10-12T12:00:00Z";
const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  fullName: "Ana Azevedo Gomes",
} as PatientOption;
const service: Service = {
  id: "77777777-7777-4777-8777-777777777777",
  clinicId,
  name: "Pilates",
  active: true,
  businessLine: "studio",
  durationMinutes: 50,
};
const template: PlanTemplate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pacote Pilates",
  kind: "fixed_package",
  totalValueInCents: 30_000,
  services: [
    { serviceId: service.id, totalSessions: 10, totalValueInCents: 30_000 },
  ],
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

beforeEach(() => {
  vi.mocked(fetch).mockImplementation(async () => jsonResponse([]));
  vi.spyOn(api, "services").mockResolvedValue([service]);
  vi.spyOn(api, "planTemplates").mockResolvedValue([template]);
  vi.spyOn(api, "createPlan").mockImplementation(
    async (input) =>
      ({
        ...input,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        clinicId,
        patientName: patient.fullName,
      }) as unknown as PatientPlan,
  );
});

async function openPlanModal() {
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <AuthorizationContext.Provider value={allowAll}>
        <PatientPlanModal
          patient={patient}
          kind="recurring"
          onClose={() => undefined}
          onSaved={onSaved}
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
  fireEvent.change(select, { target: { value: template.id } });
  return { dialog, onSaved };
}

describe("desconto na contratação pela ficha (RE15)", () => {
  it("vende 3x com 10% e mostra o total e as parcelas com o desconto", async () => {
    const { dialog, onSaved } = await openPlanModal();
    expect(within(dialog).getByText("Sem desconto neste plano.")).toBeVisible();
    expect(within(dialog).getByText("3 × R$ 100,00")).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Configurar desconto" }),
    );
    const discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
    });
    fireEvent.change(
      within(discount).getByLabelText("Porcentagem de desconto (%)"),
      { target: { value: "10" } },
    );
    fireEvent.click(
      within(discount).getByLabelText("Permanente (até remover)"),
    );
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Desconto do plano" }),
    ).not.toBeInTheDocument();

    expect(
      within(dialog).getByText("10% de desconto · permanente"),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Alterar desconto" }),
    ).toBeVisible();
    // Resumo das parcelas: 3 × R$ 90,00, com o desconto em cada uma e o total.
    expect(within(dialog).getByText("3 × R$ 90,00")).toBeVisible();
    const parcels = within(dialog).getByRole("list", {
      name: "Parcelas previstas",
    });
    expect(
      within(parcels).getAllByText("Desconto do plano · 10%"),
    ).toHaveLength(3);
    expect(within(dialog).getByText("Total a pagar").nextSibling).toHaveTextContent(
      "R$ 270,00",
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planTemplateId: template.id,
        installments: 3,
        totalValueInCents: 30_000,
        discount: { type: "percentage", percent: 10, scope: "permanent" },
      }),
    );
  });

  it("remove o desconto e, sem desconto, vende como antes", async () => {
    const { dialog, onSaved } = await openPlanModal();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Configurar desconto" }),
    );
    let discount = await screen.findByRole("dialog", {
      name: "Desconto do plano",
    });
    fireEvent.click(within(discount).getByLabelText("Valor (R$)"));
    fireEvent.change(within(discount).getByLabelText("Valor do desconto (R$)"), {
      target: { value: "30,00" },
    });
    fireEvent.click(
      within(discount).getByRole("button", { name: "Aplicar desconto" }),
    );
    expect(
      within(dialog).getByText("R$ 30,00 de desconto · só no próximo pagamento"),
    ).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Alterar desconto" }),
    );
    discount = await screen.findByRole("dialog", { name: "Desconto do plano" });
    fireEvent.click(
      within(discount).getByRole("button", { name: "Remover desconto" }),
    );
    expect(within(dialog).getByText("Sem desconto neste plano.")).toBeVisible();
    expect(within(dialog).getByText("3 × R$ 100,00")).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(vi.mocked(api.createPlan).mock.calls[0]![0]).not.toHaveProperty(
      "discount",
    );
  });
});
