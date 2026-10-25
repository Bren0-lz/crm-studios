import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, expand, open, save } from "../../test-support/workflow-ui";

async function openInventoryTab() {
  open("/vendas");
  fireEvent.click(await screen.findByRole("button", { name: "Estoque" }));
  return screen.getByRole("region", { name: "Estoque" });
}

describe("aba Estoque de Vendas de produtos (QM9)", () => {
  it("lista, cadastra, ajusta e edita produtos em Vendas de produtos", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 5,
      minimumStock: 1,
    });
    const category = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_category",
      { name: "Terapia", active: true },
    );
    const panel = await openInventoryTab();
    expect(
      await within(panel).findByText("Óleo de massagem", { exact: true }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo produto" });
    change("Nome", "Faixa terapêutica", dialog);
    change("Código do produto", "FAIXA", dialog);
    change("Custo (R$)", "10", dialog);
    change("Preço de venda (R$)", "20", dialog);
    change("Estoque inicial", "10", dialog);
    change("Estoque mínimo", "2", dialog);
    change("Categoria", category!.id, dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "FAIXA")!;
    expect(product).toMatchObject({
      salePriceInCents: 2000,
      currentStock: 10,
      categoryId: category!.id,
    });
    await within(panel).findByText("Faixa terapêutica", { exact: true });

    fireEvent.click(
      within(panel).getByRole("button", { name: "Ajustar estoque" }),
    );
    dialog = screen.getByRole("dialog", { name: "Ajustar estoque" });
    change("Produto", product.id, dialog);
    change("Quantidade", "2", dialog);
    change("Motivo", "Compra de reposição", dialog);
    await save("Ajustar estoque", "Salvar ajuste");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(12);
    await within(panel).findByText("12 un");
    const history = expand("Histórico de estoque");
    const movement = within(history)
      .getByText("Compra de reposição")
      .closest<HTMLElement>("tr")!;
    expect(within(movement).getByText("Faixa terapêutica")).toBeInTheDocument();
    expect(within(movement).getByText("+2")).toBeInTheDocument();
    expect(within(movement).getByText("12")).toBeInTheDocument();

    const row = within(panel)
      .getByText("Faixa terapêutica", { exact: true })
      .closest<HTMLElement>("tr")!;
    expect(within(row).getByText("Ativo")).toBeInTheDocument();
    fireEvent.click(
      within(row).getByRole("button", { name: "Editar Faixa terapêutica" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    change("Unidade", "kit", dialog);
    fireEvent.click(within(dialog).getByLabelText("Ativo"));
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ unit: "kit", active: false, currentStock: 12 });
    await waitFor(() =>
      expect(within(row).getByText("Inativo")).toBeInTheDocument(),
    );
  });

  it("configura os tamanhos do produto quando ele tem distinção por tamanho", async () => {
    const { repository } = await setupApi();
    const panel = await openInventoryTab();
    await within(panel).findByText("Nenhum produto");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo produto" });
    expect(
      within(dialog).queryByRole("group", { name: "Tamanhos disponíveis" }),
    ).not.toBeInTheDocument();
    change("Nome", "Camiseta do estúdio", dialog);
    change("Código do produto", "CAM", dialog);
    fireEvent.click(
      within(dialog).getByLabelText("Possui distinção por tamanhos"),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar produto" }),
    );
    expect(
      await within(dialog).findByText("Selecione ao menos um tamanho."),
    ).toBeInTheDocument();
    const sizes = within(dialog).getByRole("group", {
      name: "Tamanhos disponíveis",
    });
    for (const label of [
      "PP",
      "P",
      "M",
      "G",
      "GG",
      "Tamanho único",
      "Baby look PP",
      "Baby look P",
      "Baby look M",
      "Baby look G",
      "Baby look GG",
    ])
      expect(within(sizes).getByLabelText(label)).toBeInTheDocument();
    fireEvent.click(within(sizes).getByLabelText("G"));
    fireEvent.click(within(sizes).getByLabelText("Baby look M"));
    fireEvent.click(within(sizes).getByLabelText("P"));
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "CAM")!;
    expect(product.sizes).toEqual(["p", "g", "baby_look_m"]);
    expect(
      await within(panel).findByText("Tamanhos: P, G, Baby look M"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Camiseta do estúdio" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    const checkbox = within(dialog).getByLabelText<HTMLInputElement>(
      "Possui distinção por tamanhos",
    );
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.sizes,
    ).toEqual([]);
    await waitFor(() =>
      expect(within(panel).queryByText(/^Tamanhos:/)).not.toBeInTheDocument(),
    );
  });

  it("tira o Estoque do Financeiro, mesmo com permissão de consultar", async () => {
    await setupApi();
    open("/financeiro");
    await screen.findByRole("button", { name: /Contas a receber/ });
    expect(
      screen.queryByRole("button", { name: "Estoque" }),
    ).not.toBeInTheDocument();
  });

  it("abre o Estoque por link direto e cadastra categorias e marcas de produtos", async () => {
    const { repository } = await setupApi();
    open("/vendas?aba=estoque");
    await screen.findByRole("region", { name: "Estoque" });

    fireEvent.click(
      screen.getByRole("button", { name: "Categorias e marcas" }),
    );
    const catalogs = screen.getByRole("region", {
      name: "Categorias e marcas",
    });
    const categories = await within(catalogs).findByRole("region", {
      name: "Categorias de produtos",
    });
    fireEvent.click(
      within(categories).getByRole("button", {
        name: "Adicionar em Categorias de produtos",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo cadastro" });
    change("Nome", "Óleos", dialog);
    await save("Novo cadastro", "Salvar");
    expect(
      await repository.listClinicCatalog(clinicId, "product_category"),
    ).toEqual([expect.objectContaining({ name: "Óleos", active: true })]);
    expect(
      within(catalogs).getByRole("region", { name: "Marcas" }),
    ).toBeInTheDocument();
  });

  it("leva do Estoque para a nova venda, que baixa o saldo do produto", async () => {
    const { repository } = await setupApi();
    await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 5,
      minimumStock: 1,
    });
    const panel = await openInventoryTab();
    await within(panel).findByText("Óleo de massagem", { exact: true });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Registrar venda" }),
    );
    const sale = await screen.findByRole("region", { name: "Nova venda" });
    expect(
      within(sale).getByRole("option", { name: "Óleo de massagem · 5 un" }),
    ).toBeInTheDocument();
  });
});
