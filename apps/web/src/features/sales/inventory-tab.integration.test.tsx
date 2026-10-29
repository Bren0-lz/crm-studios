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
    // O aviso de reposição é opcional e vem desligado.
    expect(
      within(dialog).getByLabelText<HTMLInputElement>(
        "Avisar quando for hora de repor",
      ).checked,
    ).toBe(false);
    expect(
      within(dialog).queryByLabelText("Avisar quando restarem"),
    ).not.toBeInTheDocument();
    change("Categoria", category!.id, dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "FAIXA")!;
    expect(product).toMatchObject({
      salePriceInCents: 2000,
      currentStock: 10,
      categoryId: category!.id,
      restockAlertAt: null,
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

  it("liga e desliga o aviso de reposição do produto", async () => {
    const { repository } = await setupApi();
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Óleo de massagem",
      sku: "OLEO",
      unit: "un",
      costInCents: 1500,
      salePriceInCents: 3000,
      initialStock: 4,
    });
    await repository.createProduct(clinicId, actorId, {
      name: "Faixa elástica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 500,
      salePriceInCents: 1500,
      initialStock: 0,
    });
    const panel = await openInventoryTab();
    const row = (name: string) =>
      within(panel)
        .getByText(name, { exact: true })
        .closest<HTMLElement>("tr")!;
    await within(panel).findByText("Óleo de massagem", { exact: true });
    expect(
      within(row("Óleo de massagem")).getByText("Ativo"),
    ).toBeInTheDocument();
    expect(
      within(row("Faixa elástica")).getByText("Sem estoque"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Óleo de massagem" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Editar produto" });
    fireEvent.click(
      within(dialog).getByLabelText("Avisar quando for hora de repor"),
    );
    change("Avisar quando restarem", "5", dialog);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ restockAlertAt: 5, lowStock: true });
    expect(
      await within(row("Óleo de massagem")).findByText("Repor estoque"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Editar Óleo de massagem" }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    const checkbox = within(dialog).getByLabelText<HTMLInputElement>(
      "Avisar quando for hora de repor",
    );
    expect(checkbox.checked).toBe(true);
    expect(
      within(dialog).getByLabelText<HTMLInputElement>("Avisar quando restarem")
        .value,
    ).toBe("5");
    fireEvent.click(checkbox);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ restockAlertAt: null, lowStock: false });
    expect(
      await within(row("Óleo de massagem")).findByText("Ativo"),
    ).toBeInTheDocument();
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
    expect(within(dialog).queryByLabelText("Estoque inicial")).toBeNull();
    change("Estoque inicial P", "2", dialog);
    change("Estoque inicial Baby look M", "1", dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "CAM")!;
    expect(product).toMatchObject({
      sizes: ["p", "g", "baby_look_m"],
      currentStock: 3,
    });
    expect(
      await within(panel).findByText("P: 2 · G: 0 · Baby look M: 1"),
    ).toBeInTheDocument();
    // Sem aviso de reposição: o produto tem saldo, mas o tamanho zerado aparece como esgotado.
    expect(within(panel).getByText("Esgotado: G")).toBeInTheDocument();

    // Ajuste de estoque pede o tamanho do produto.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Ajustar estoque" }),
    );
    dialog = screen.getByRole("dialog", { name: "Ajustar estoque" });
    expect(within(dialog).queryByLabelText("Tamanho")).toBeNull();
    change("Produto", product.id, dialog);
    expect(
      within(dialog).getByRole("option", { name: "G · 0 un" }),
    ).toBeInTheDocument();
    change("Tamanho", "g", dialog);
    change("Quantidade", "4", dialog);
    change("Motivo", "Compra de camisetas", dialog);
    await save("Ajustar estoque", "Salvar ajuste");
    expect(
      await within(panel).findByText("P: 2 · G: 4 · Baby look M: 1"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Esgotado/)).toBeNull();
    const history = expand("Histórico de estoque");
    const movement = within(history)
      .getByText("Compra de camisetas")
      .closest<HTMLElement>("tr")!;
    expect(
      within(movement).getByText("Camiseta do estúdio · G"),
    ).toBeInTheDocument();

    // Sem tamanhos, o saldo dos tamanhos antigos continua visível até ser baixado.
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
      ),
    ).toMatchObject({ sizes: [], currentStock: 7 });
    expect(
      await within(panel).findByText("P: 2 · G: 4 · Baby look M: 1"),
    ).toBeInTheDocument();
  });

  it("define a quantidade de cada tamanho ao editar o produto", async () => {
    const { repository } = await setupApi();
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Camiseta do estúdio",
      sku: "CAM",
      unit: "un",
      costInCents: 2000,
      salePriceInCents: 5000,
      initialStock: 0,
      sizes: ["p"],
      initialSizeStock: [{ size: "p", quantity: 2 }],
    });
    const panel = await openInventoryTab();
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Editar Camiseta do estúdio",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Editar produto" });
    const quantities = within(dialog).getByRole("group", {
      name: "Quantidade por tamanho",
    });
    expect(
      within(quantities).getByLabelText<HTMLInputElement>("Quantidade P").value,
    ).toBe("2");
    fireEvent.click(
      within(
        within(dialog).getByRole("group", { name: "Tamanhos disponíveis" }),
      ).getByLabelText("M"),
    );
    change("Quantidade M", "3", dialog);
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({
      sizes: ["p", "m"],
      currentStock: 5,
      sizeStock: [
        { size: "p", currentStock: 2 },
        { size: "m", currentStock: 3 },
      ],
    });
    expect(await within(panel).findByText("P: 2 · M: 3")).toBeInTheDocument();
  });

  it("cadastra categoria e marca sem fechar o formulário do produto", async () => {
    const { repository } = await setupApi();
    const panel = await openInventoryTab();
    await within(panel).findByText("Nenhum produto");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Novo produto" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo produto" });
    change("Nome", "Meia antiderrapante", dialog);
    change("Categoria", "__new__", dialog);
    const category = screen.getByRole("dialog", { name: "Nova categoria" });
    change("Nome", "Meias", category);
    fireEvent.click(
      within(category).getByRole("button", { name: "Cadastrar" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova categoria" }),
      ).not.toBeInTheDocument(),
    );
    // O produto continua aberto, com o que já foi preenchido e a categoria nova escolhida.
    expect(within(dialog).getByLabelText<HTMLInputElement>("Nome").value).toBe(
      "Meia antiderrapante",
    );
    expect(
      within(dialog).getByRole("option", { name: "Meias" }),
    ).toHaveProperty("selected", true);

    change("Marca", "__new__", dialog);
    const brand = screen.getByRole("dialog", { name: "Nova marca" });
    change("Nome", "Toesox", brand);
    fireEvent.click(within(brand).getByRole("button", { name: "Cadastrar" }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("option", { name: "Toesox" }),
      ).toHaveProperty("selected", true),
    );
    change("Código do produto", "MEIA", dialog);
    await save("Novo produto", "Salvar produto");
    const [meias] = await repository.listClinicCatalog(
      clinicId,
      "product_category",
    );
    const [toesox] = await repository.listClinicCatalog(
      clinicId,
      "product_brand",
    );
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products[0],
    ).toMatchObject({ categoryId: meias!.id, brandId: toesox!.id });
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
