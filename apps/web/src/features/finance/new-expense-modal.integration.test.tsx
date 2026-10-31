import type { FinancialWorkspace } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import type { ExpenseKind } from "./expense-kind";
import { NewExpenseModal } from "./NewExpenseModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

const workspace = {
  categories: [
    { id: "cat-1", name: "Aluguel", kind: "expense", active: true },
    { id: "cat-2", name: "Utilidades", kind: "expense", active: true },
  ],
  costCenters: [
    { id: "cc-1", name: "Estúdio", active: true },
    { id: "cc-2", name: "Clínica", active: true },
  ],
  commissions: [],
  payables: [],
} as unknown as FinancialWorkspace;

function mount(kinds: ExpenseKind[] = ["single", "recurring"]) {
  vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
  const onClose = vi.fn();
  render(
    <AuthorizationContext.Provider value={authorization}>
      <NewExpenseModal
        workspace={workspace}
        currentMonth="2026-10"
        kinds={kinds}
        onClose={onClose}
        onCreated={() => undefined}
      />
    </AuthorizationContext.Provider>,
  );
  return onClose;
}

const dialog = () => screen.getByRole("dialog", { name: "Nova despesa" });

describe("Nova despesa: pontual ou fixa no mesmo modal", () => {
  it("opens as a one-off expense and switches to a fixed one, keeping the filled fields", () => {
    mount();
    expect(
      within(dialog()).getByRole("radio", { name: "Pontual (uma vez)" }),
    ).toBeChecked();
    expect(
      within(dialog()).getByRole("button", { name: "Cadastrar despesa" }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog()).getByLabelText("Descrição"), {
      target: { value: "Conta de luz" },
    });
    fireEvent.change(within(dialog()).getByLabelText("Categoria"), {
      target: { value: "cat-2" },
    });
    fireEvent.click(
      within(dialog()).getByRole("radio", { name: "Fixa (todo mês)" }),
    );

    expect(
      within(dialog()).getByRole("radio", { name: "Fixa (todo mês)" }),
    ).toBeChecked();
    expect(within(dialog()).getByLabelText("Descrição")).toHaveValue(
      "Conta de luz",
    );
    expect(within(dialog()).getByLabelText("Categoria")).toHaveValue("cat-2");
    // Despesa fixa: valor fixo ou variável.
    const amountType = within(dialog()).getByLabelText("Tipo de valor");
    expect(amountType).toHaveValue("fixed");
    fireEvent.change(amountType, { target: { value: "variable" } });
    expect(
      within(dialog()).getByLabelText("Valor estimado (opcional)"),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByRole("button", { name: "Cadastrar despesa fixa" }),
    ).toBeInTheDocument();

    // E volta para pontual sem perder a descrição.
    fireEvent.click(
      within(dialog()).getByRole("radio", { name: "Pontual (uma vez)" }),
    );
    expect(within(dialog()).getByLabelText("Descrição")).toHaveValue(
      "Conta de luz",
    );
  });

  it("asks before discarding what was typed before the switch", () => {
    const onClose = mount();
    fireEvent.change(within(dialog()).getByLabelText("Descrição"), {
      target: { value: "Internet" },
    });
    fireEvent.click(
      within(dialog()).getByRole("radio", { name: "Fixa (todo mês)" }),
    );
    fireEvent.click(within(dialog()).getByRole("button", { name: "Voltar" }));
    expect(
      screen.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("hides the choice when the profile can register only one kind", () => {
    mount(["recurring"]);
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(
      within(dialog()).getByRole("button", { name: "Cadastrar despesa fixa" }),
    ).toBeInTheDocument();
  });
});
