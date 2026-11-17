import type {
  CommissionAccountPayment,
  CommissionReconciliationPreview,
} from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import "../../test-support/legacy-setup";
import { CommissionReconciliationModal } from "./CommissionReconciliationModal";

const allowAll: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const clinicId = "11111111-1111-4111-8111-111111111111";
const payment: CommissionAccountPayment = {
  id: "33333333-3333-4333-8333-333333333333",
  clinicId,
  commissionId: "44444444-4444-4444-8444-444444444444",
  professionalId: "55555555-5555-4555-8555-555555555555",
  professionalName: "Paula Profissional",
  amountInCents: -1_500,
  actorId: "22222222-2222-4222-8222-222222222222",
  occurredAt: "2026-10-05T12:00:00Z",
  originalIncluded: false,
  adjustmentIds: [],
};
const preview: CommissionReconciliationPreview = {
  reconciliations: [],
  digest: "digest",
  commission: {
    id: payment.commissionId,
    clinicId,
    professionalId: payment.professionalId,
    professionalName: payment.professionalName,
    competence: "2026-10",
    baseAmountInCents: 15_000,
    percentage: 10,
    amountInCents: 1_500,
    status: "paid",
    paidAt: "2026-10-05T12:00:00Z",
    createdAt: "2026-10-04T12:00:00Z",
  },
  expected: null,
  adjustments: [],
  payments: [payment],
  changes: [],
  originalManagedByExpense: false,
};

afterEach(() => vi.restoreAllMocks());

describe("estorno de baixa conciliada pede motivo (D4)", () => {
  it("só confirma com motivo, envia-o e trava Voltar enquanto salva", async () => {
    vi.spyOn(api, "commissionReconciliation").mockResolvedValue(preview);
    let finish: () => void = () => undefined;
    const reverse = vi
      .spyOn(api, "reverseCommissionAccountPayment")
      .mockImplementation(
        () =>
          new Promise<CommissionAccountPayment>((resolve) => {
            finish = () =>
              resolve({ ...payment, reversedAt: "2026-10-06T12:00:00Z" });
          }),
      );
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={allowAll}>
          <CommissionReconciliationModal
            id={payment.commissionId}
            onClose={() => undefined}
            onChanged={async () => undefined}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Estornar baixa conciliada" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Estornar baixa conciliada",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Confirmar registro conciliado",
    });
    const reason = within(dialog).getByLabelText("Motivo");
    expect(reason).toHaveAttribute("maxLength", "500");
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("Falta: Motivo.")).toBeInTheDocument();
    fireEvent.change(reason, { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason, {
      target: { value: "  Pagamento lançado em duplicidade  " },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(reverse).toHaveBeenCalledWith(
      payment.id,
      "Pagamento lançado em duplicidade",
    );
    // Durante o salvamento: Voltar e Confirmar desativados.
    expect(confirm).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Voltar" }),
    ).toBeDisabled();
    finish();
    expect(
      await screen.findByText(
        "Estorno conciliado registrado sem remover o pagamento original.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Estornar baixa conciliada" }),
    ).not.toBeInTheDocument();
  });
});
