import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function seed() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Paula Picado",
    phone: "11988887777",
    tags: [],
  });
  const cream = await api.repository.createProduct(clinicId, actorId, {
    name: "Creme relaxante",
    sku: "CREME",
    unit: "un",
    costInCents: 1_000,
    salePriceInCents: 5_000,
    initialStock: 5,
  });
  return { ...api, patient, cream };
}

describe("pagamento picado na venda de produtos", () => {
  it("adiciona formas com animação, completa o total e grava cada forma", async () => {
    const { repository, patient, cream } = await seed();
    open("/vendas");
    const panel = await screen.findByRole("region", { name: "Nova venda" });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Cliente" }), {
      target: { value: "Paula" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: patient.fullName }),
    );
    fireEvent.change(within(panel).getByLabelText("Produto 1"), {
      target: { value: cream.id },
    });
    fireEvent.change(within(panel).getByLabelText("Quantidade 1"), {
      target: { value: "2" },
    });
    const payment = within(panel).getByRole("group", {
      name: "Formas de pagamento",
    });
    // Uma forma: sem valor nem "Remover" (nunca fica sem forma de pagamento).
    expect(within(payment).queryByLabelText(/Valor da forma/)).toBeNull();
    expect(
      within(payment).queryByRole("button", { name: /Remover forma/ }),
    ).toBeNull();

    fireEvent.click(
      within(payment).getByRole("button", {
        name: "Adicionar forma de pagamento",
      }),
    );
    expect(payment).toHaveTextContent("Forma 2 adicionada logo abaixo.");
    const second = within(payment).getByRole("group", { name: "Forma 2" });
    // Entra com a mesma animação dos itens do cadastro de cliente.
    expect(second).toHaveClass("guided-item");
    fireEvent.change(within(payment).getByLabelText("Forma de pagamento 2"), {
      target: { value: "card" },
    });
    // A 1ª forma fica com o total; ao digitar a 1ª, a 2ª completa o que falta.
    fireEvent.change(within(payment).getByLabelText("Valor da forma 1"), {
      target: { value: "3000" },
    });
    expect(within(payment).getByLabelText("Valor da forma 2")).toHaveValue(
      "70,00",
    );
    expect(payment).toHaveTextContent(
      /Soma das formas\s*R\$\s100,00 de R\$\s100,00/,
    );

    // Terceira forma, depois removida: recolhe e some.
    fireEvent.click(
      within(payment).getByRole("button", {
        name: "Adicionar forma de pagamento",
      }),
    );
    const third = within(payment).getByRole("group", { name: "Forma 3" });
    fireEvent.click(
      within(third).getByRole("button", { name: "Remover forma 3" }),
    );
    await waitFor(() =>
      expect(
        within(payment).queryByRole("group", { name: "Forma 3" }),
      ).toBeNull(),
    );
    expect(payment).toHaveTextContent("Forma de pagamento removida.");

    // Soma diferente do total bloqueia a venda.
    fireEvent.change(within(payment).getByLabelText("Valor da forma 2"), {
      target: { value: "1000" },
    });
    const submit = within(panel).getByRole("button", {
      name: "Registrar venda",
    });
    // Digitar a 2ª faz a 1ª completar: volta a fechar o total.
    expect(within(payment).getByLabelText("Valor da forma 1")).toHaveValue(
      "90,00",
    );
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(
      await screen.findByText(/Venda de R\$\s100,00 registrada para Paula\./),
    ).toBeInTheDocument();
    const tab = (await repository.getInventoryWorkspace(clinicId)).tabs.find(
      (item) => item.patientId === patient.id,
    )!;
    const receivable = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.find((item) => item.id === tab.receivableId);
    expect(receivable).toMatchObject({
      status: "paid",
      paymentParts: [
        { paymentMethod: "pix", amountInCents: 9_000 },
        { paymentMethod: "card", amountInCents: 1_000 },
      ],
    });
  });
});
