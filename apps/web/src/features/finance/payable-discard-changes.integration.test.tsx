import type { FinancialWorkspace } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { PayableModal } from "./PayableModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

function mount() {
  vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
  const onClose = vi.fn();
  render(
    <AuthorizationContext.Provider value={authorization}>
      <PayableModal
        workspace={
          {
            categories: [],
            costCenters: [],
            commissions: [],
            payables: [],
          } as unknown as FinancialWorkspace
        }
        onClose={onClose}
        onCreated={() => undefined}
      />
    </AuthorizationContext.Provider>,
  );
  return onClose;
}

function discardPrompt() {
  return screen.getByRole("dialog", { name: "Descartar alterações?" });
}

describe("Nova despesa: descartar alterações (QM11)", () => {
  it("closes an untouched expense directly with Voltar", () => {
    const onClose = mount();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks on X, Escape and Voltar once the description is typed", () => {
    const onClose = mount();
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Conta de luz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(
      within(discardPrompt()).getByRole("button", {
        name: "Continuar editando",
      }),
    );
    expect(screen.getByLabelText("Descrição")).toHaveValue("Conta de luz");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Descrição")).toHaveValue("Conta de luz");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(
      within(discardPrompt()).getByRole("button", { name: "Descartar" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
