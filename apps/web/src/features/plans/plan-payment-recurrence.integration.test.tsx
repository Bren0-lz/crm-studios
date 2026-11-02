import type { PlanPaymentPart } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { planRecurrenceMissing } from "../../shared/lib/payment-parts";
import { PlanPaymentFields, type PlanPaymentValue } from "./PlanPaymentFields";

let latest: PlanPaymentValue & { autoRenew: boolean } = {
  installments: 1,
  autoRenew: true,
};

function Harness() {
  const [plan, setPlan] = useState<PlanPaymentValue & { autoRenew: boolean }>({
    paymentMethod: "pix",
    installments: 1,
    autoRenew: true,
  });
  latest = plan;
  return (
    <>
      <PlanPaymentFields
        plan={{
          ...plan,
          kind: "recurring",
          totalValueInCents: 40000,
          firstDueDate: "2026-11-10",
        }}
        settings={null}
        onChange={(fields) => setPlan({ ...plan, ...fields })}
      />
      <ul aria-label="Pendências">
        {planRecurrenceMissing(plan).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

describe("formas do plano: só da primeira vez ou recorrente", () => {
  it("pede a marcação em cada forma e uma recorrente na renovação automática", () => {
    render(<Harness />);
    const payment = screen.getByRole("group", { name: "Formas de pagamento" });
    // Forma única: nada a marcar.
    expect(within(payment).queryByText("Só na primeira vez")).toBeNull();
    fireEvent.click(
      within(payment).getByRole("button", {
        name: "Adicionar forma de pagamento",
      }),
    );
    const pending = screen.getByRole("list", { name: "Pendências" });
    expect(pending).toHaveTextContent(
      "Cobrança de cada forma (só na primeira vez ou recorrente)",
    );
    const first = within(payment).getByRole("group", {
      name: "Cobrança da forma 1",
    });
    const second = within(payment).getByRole("group", {
      name: "Cobrança da forma 2",
    });
    fireEvent.click(within(first).getByLabelText("Só na primeira vez"));
    fireEvent.click(within(second).getByLabelText("Só na primeira vez"));
    expect(pending).toHaveTextContent(
      "Uma forma de pagamento recorrente (renovação automática)",
    );
    fireEvent.click(
      within(second).getByLabelText("Recorrente (segue nas renovações)"),
    );
    expect(pending).toBeEmptyDOMElement();
    expect(
      latest.paymentParts?.map((part: PlanPaymentPart) => part.recurring),
    ).toEqual([false, true]);
  });
});
