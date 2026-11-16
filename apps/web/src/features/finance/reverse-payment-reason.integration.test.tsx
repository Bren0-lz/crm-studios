import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../test-support/legacy-setup";
import { ReversePaymentModal } from "./ReversePaymentModal";

describe("estorno pede motivo (E7c)", () => {
  it("só confirma com motivo e trava Voltar enquanto salva", async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <ReversePaymentModal
        target={{
          kind: "receivable",
          id: "r1",
          description: "Mensalidade",
          amountInCents: 10_000,
          paymentMethod: "pix",
        }}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Estornar pagamento" });
    const confirm = within(dialog).getByRole("button", {
      name: "Estornar pagamento",
    });
    const reason = within(dialog).getByLabelText("Motivo");
    expect(reason).toHaveAttribute("maxLength", "500");
    expect(confirm).toBeDisabled();
    fireEvent.change(reason, { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(reason, {
      target: { value: "  Cobrança em duplicidade  " },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("Cobrança em duplicidade");
    // Durante o salvamento: Voltar desativado e o modal ocupado.
    expect(
      await within(dialog).findByRole("button", { name: "Salvando…" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Voltar" }),
    ).toBeDisabled();
    finish();
  });
});
