import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { change, open, save } from "../../test-support/workflow-ui";
import { CREATE_OPTION_VALUE } from "./FinanceRegistryModal";

describe("Nova despesa com fornecedor", () => {
  it("tem um campo só de fornecedor e cadastra um novo sem sair da despesa", async () => {
    const { repository } = await setupApi();
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Materiais",
      kind: "expense",
    });
    open("/financeiro");
    fireEvent.click(
      await screen.findByRole("button", { name: "Nova despesa" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Nova despesa" });
    await within(dialog).findByRole("option", { name: "+ Novo fornecedor" });
    // Sem o par "Fornecedor cadastrado" + texto livre.
    expect(
      within(dialog).queryByLabelText("Fornecedor cadastrado"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getAllByLabelText("Fornecedor")).toHaveLength(1);

    change("Fornecedor", CREATE_OPTION_VALUE, dialog);
    const supplierDialog = await screen.findByRole("dialog", {
      name: "Novo fornecedor",
    });
    change("Nome", "Distribuidora Faixas", supplierDialog);
    await save("Novo fornecedor", "Salvar fornecedor");

    const select = within(dialog).getByLabelText<HTMLSelectElement>(
      "Fornecedor",
    );
    await waitFor(() =>
      expect(select.selectedOptions[0]?.textContent).toBe(
        "Distribuidora Faixas",
      ),
    );

    for (const [label, value] of [
      ["Descrição", "Compra de faixas"],
      ["Categoria", category.id],
      ["Valor", "40.00"],
    ])
      change(label!, value!, dialog);
    await save("Nova despesa", "Cadastrar despesa");

    const [supplier] = await repository.listSuppliers(clinicId);
    const payable = (
      await repository.getFinancialWorkspace(clinicId)
    ).payables.find((item) => item.description === "Compra de faixas");
    expect(payable).toMatchObject({
      supplierId: supplier!.id,
      supplier: "Distribuidora Faixas",
    });
  });
});
